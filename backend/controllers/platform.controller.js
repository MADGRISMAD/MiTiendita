const db = require('../database/mongodb');
const { PLANS, BILLING_STATUSES, trialEndsFrom } = require('../models/tenant.model');
const { planAiQuota, planPrice, PLAN_CATALOG, isPerpetual, hasAiFeatures } = require('../services/plans.catalog');
const mp = require('../services/mercadopago.service');
const supportMail = require('../services/support-mail.service');
const { ownerMonthlyReport } = require('../utils/mail-templates');
const hasher = require('../utils/bcrypt.utils');

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const PLAN_NAMES = { basic: 'Básico', growth: 'Crecimiento', pro: 'Pro', perpetual: 'Perpetua' };
const STATUS_NAMES = {
  trialing: 'Prueba',
  active: 'Activo',
  past_due: 'Pago atrasado',
  suspended: 'Suspendido',
};

function ownerOf(users) {
  return users.find((user) => user.role === 'admin') || users[0] || null;
}

async function dropMercadoPago(tenant, patch) {
  if (!tenant?.mpPreapprovalId) return;
  try {
    await mp.cancelPreapproval(tenant.mpPreapprovalId);
  } catch (err) {
    console.warn('[platform] no pude cancelar Mercado Pago al pasar a perpetua:', err.message);
  }
  patch.mpPreapprovalId = null;
}

function stampPerpetual(patch, billingStatus) {
  if (billingStatus !== 'suspended') patch.billingStatus = 'active';
  patch.billingInterval = 'lifetime';
  patch.currentPeriodEnd = null;
  patch.cancelAtPeriodEnd = false;
}

async function noteLicense(tenantId, plan, note) {
  try {
    await db.CreateBillingEvent({
      tenantId,
      type: 'support',
      plan,
      interval: isPerpetual(plan) ? 'lifetime' : 'month',
      amount: 0,
      note,
    });
  } catch (err) {
    console.warn('[platform] no pude guardar el evento de licencia:', err.message);
  }
}

function dateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

async function clientCard(tenant, { withUsers = false } = {}) {
  const [settings, users, aiUsed] = await Promise.all([
    db.GetSettings(tenant.id),
    db.ListUsersByTenant(tenant.id),
    db.GetAiUsage(tenant.id),
  ]);
  const owner = ownerOf(users);
  const plan = tenant.plan || 'basic';
  const card = {
    id: tenant.id,
    businessName: settings?.businessName || tenant.name || 'Sin nombre',
    phone: settings?.phone || owner?.cellphone || '',
    address: settings?.address || '',
    inventoryEnabled: Boolean(settings?.inventoryEnabled),
    plan,
    planName: PLAN_NAMES[plan] || 'Básico',
    billingStatus: tenant.billingStatus || 'trialing',
    billingStatusName:
      isPerpetual(plan) && (tenant.billingStatus || 'trialing') === 'active'
        ? 'Perpetua'
        : STATUS_NAMES[tenant.billingStatus] || 'Prueba',
    trialEndsAt: tenant.trialEndsAt || null,
    trialEndsOn: dateInput(tenant.trialEndsAt),
    currentPeriodEnd: tenant.currentPeriodEnd || null,
    suspendedReason: tenant.suspendedReason || '',
    mpPayerEmail: tenant.mpPayerEmail || '',
    createdAt: tenant.createdAt || null,
    usersCount: users.length,
    ownerName: owner ? `${owner.name || ''} ${owner.lastName || ''}`.trim() : '',
    ownerEmail: owner?.email || '',
    ownerUsername: owner?.username || '',
    ownerPhone: owner?.cellphone || '',
    aiUsed: hasAiFeatures(plan) ? aiUsed : 0,
    aiLimit: hasAiFeatures(plan) ? planAiQuota(plan) : 0,
    aiEnabled: hasAiFeatures(plan),
    isPerpetual: isPerpetual(plan),
  };
  if (withUsers) card.users = users;
  return card;
}

async function listTenants(req, res) {
  try {
    const [tenants, inbox] = await Promise.all([db.ListTenants(), supportMail.waitingInbox()]);
    const waiting = new Map();
    for (const item of inbox.items || []) {
      const current = waiting.get(item.tenantId) || { count: 0, at: null };
      current.count += 1;
      if (!current.at || new Date(item.updatedAt || 0) > new Date(current.at)) current.at = item.updatedAt;
      waiting.set(item.tenantId, current);
    }
    const enriched = await Promise.all(tenants.map(async (tenant) => {
      const card = await clientCard(tenant);
      const open = waiting.get(tenant.id) || { count: 0, at: null };
      return { ...card, waiting: open.count, waitingAt: open.at };
    }));
    return res.status(200).json(enriched);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude cargar los clientes.');
  }
}

async function getTenant(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    return res.status(200).json(await clientCard(tenant, { withUsers: true }));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude abrir ese cliente.');
  }
}

async function updateTenant(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');

    const body = req.body || {};
    const businessName = String(body.businessName || '').trim();
    if (businessName.length < 2) {
      return res.status(400).send('Escribe el nombre del negocio.');
    }

    const plan = String(body.plan || tenant.plan || 'basic');
    if (!PLANS.includes(plan)) return res.status(400).send('Ese plan no existe.');

    const billingStatus = String(body.billingStatus || tenant.billingStatus || 'trialing');
    if (!BILLING_STATUSES.includes(billingStatus)) {
      return res.status(400).send('Ese estado no existe.');
    }

    const patch = {
      name: businessName,
      plan,
      billingStatus,
    };
    if (isPerpetual(plan)) {
      stampPerpetual(patch, billingStatus);
      if (!isPerpetual(tenant.plan)) await dropMercadoPago(tenant, patch);
    } else if (tenant.billingInterval === 'lifetime') {
      patch.billingInterval = 'month';
    }
    if (body.trialEndsOn && !isPerpetual(plan)) {
      const trial = new Date(`${body.trialEndsOn}T12:00:00`);
      if (Number.isNaN(trial.getTime())) return res.status(400).send('La fecha de prueba no es válida.');
      patch.trialEndsAt = trial;
    }
    if (billingStatus === 'suspended') {
      patch.suspendedAt = tenant.suspendedAt || new Date();
      patch.suspendedReason = String(body.suspendedReason || tenant.suspendedReason || 'soporte').slice(0, 200);
    } else {
      patch.suspendedAt = null;
      patch.suspendedReason = null;
    }
    if (!isPerpetual(plan) && billingStatus === 'active' && !tenant.currentPeriodEnd) {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      patch.currentPeriodEnd = periodEnd;
    }

    await db.UpdateTenant(tenant.id, patch);
    if (isPerpetual(plan) && !isPerpetual(tenant.plan)) {
      await noteLicense(tenant.id, 'perpetual', 'Soporte activó la licencia perpetua (sin magia)');
    }
    await db.UpdateSettings(
      {
        tenantId: tenant.id,
        businessName,
        phone: String(body.phone || '').trim().slice(0, 30),
        address: String(body.address || '').trim().slice(0, 200),
        inventoryEnabled: Boolean(body.inventoryEnabled),
        updatedAt: new Date(),
      },
      tenant.id
    );

    const fresh = await db.GetTenantById(tenant.id);
    return res.status(200).json(await clientCard(fresh, { withUsers: true }));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude guardar los cambios.');
  }
}

async function clientMail(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    return res.status(200).json(await supportMail.threadFor(tenant.id));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude cargar los correos.');
  }
}

async function sendClientMail(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    const card = await clientCard(tenant, { withUsers: true });
    const allowed = new Set(
      (card.users || [])
        .map((user) => String(user.email || '').trim().toLowerCase())
        .filter((email) => email.includes('@'))
    );
    const ticketId = String(req.body?.ticketId || '').trim();
    const to = String(req.body?.to || card.ownerEmail || '').trim().toLowerCase();
    if (!ticketId && !allowed.has(to)) {
      return res.status(400).send('Ese correo no pertenece a este cliente.');
    }
    const thread = await supportMail.sendToClient({
      tenantId: tenant.id,
      to,
      subject: req.body?.subject,
      message: req.body?.message,
      storeName: card.businessName,
      ticketId,
    });
    return res.status(200).json(thread);
  } catch (err) {
    console.error(err);
    const status = err.status || (err.code === 'MAIL_NOT_CONFIGURED' ? 503 : 500);
    return res.status(status).send(err.message || 'No pude enviar el correo.');
  }
}

async function inbox(req, res) {
  try {
    return res.status(200).json(await supportMail.unmatchedInbox());
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude leer la bandeja.');
  }
}

async function suspend(req, res) {
  try {
    const reason = String(req.body?.reason || 'manual').slice(0, 200);
    const updated = await db.UpdateTenant(req.params.id, {
      billingStatus: 'suspended',
      suspendedAt: new Date(),
      suspendedReason: reason,
    });
    if (!updated) return res.status(404).send('Tenant no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al suspender');
  }
}

async function reactivate(req, res) {
  try {
    const mode = String(req.body?.mode || 'active'); // active | trial
    const patch = {
      suspendedAt: null,
      suspendedReason: null,
    };
    if (mode === 'trial') {
      patch.billingStatus = 'trialing';
      patch.trialEndsAt = trialEndsFrom(new Date());
    } else {
      patch.billingStatus = 'active';
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      patch.currentPeriodEnd = periodEnd;
    }
    const updated = await db.UpdateTenant(req.params.id, patch);
    if (!updated) return res.status(404).send('Tenant no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al reactivar');
  }
}

async function setPlan(req, res) {
  try {
    const plan = String(req.body?.plan || '');
    if (!PLANS.includes(plan)) {
      return res.status(400).send('plan debe ser basic, growth, pro o perpetual');
    }
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('Tenant no encontrado');
    const patch = { plan };
    if (isPerpetual(plan)) {
      stampPerpetual(patch, 'active');
      if (!isPerpetual(tenant.plan)) await dropMercadoPago(tenant, patch);
    } else if (tenant.billingInterval === 'lifetime') {
      patch.billingInterval = 'month';
    }
    const updated = await db.UpdateTenant(req.params.id, patch);
    if (isPerpetual(plan) && !isPerpetual(tenant.plan)) {
      await noteLicense(req.params.id, 'perpetual', 'Soporte activó la licencia perpetua (sin magia)');
    }
    if (!updated) return res.status(404).send('Tenant no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al cambiar plan');
  }
}

function monthlyFee(tenant) {
  if ((tenant.billingStatus || 'trialing') !== 'active') return 0;
  if (isPerpetual(tenant.plan)) return 0;
  const yearly = tenant.billingInterval === 'year';
  const price = planPrice(tenant.plan || 'basic', yearly ? 'year' : 'month');
  return yearly ? price / 12 : price;
}

function recentMonthKeys(current, count = 6) {
  const [year, month] = String(current).split('-').map(Number);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
  }
  return keys;
}

function addCount(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function dayInMonth(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const part = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
  }).formatToParts(date).find((piece) => piece.type === 'day');
  return Number(part?.value || 0) || null;
}

async function buildBooks() {
    const month = db.aiMonthKey();
    const costPerUse = Number(process.env.AI_COST_MXN_PER_USE || 0.15);
    const [tenants, usage, expenses, usageAll, expensesAll, snapshots] = await Promise.all([
      db.ListTenants(),
      db.ListAiUsage(month),
      db.ListPlatformExpenses(month),
      db.ListAiUsageAll(),
      db.ListPlatformExpensesAll(),
      db.ListPlatformSnapshots(),
    ]);
    const settingsList = await Promise.all(tenants.map((tenant) => db.GetSettings(tenant.id)));
    const nameOf = (tenant, settings) => settings?.businessName || tenant.name || 'Sin nombre';
    const usageByTenant = new Map(usage.map((row) => [row.tenantId, row.count]));

    const byPlan = {
      basic: { clients: 0, amount: 0 },
      growth: { clients: 0, amount: 0 },
      pro: { clients: 0, amount: 0 },
    };
    const counts = { total: tenants.length, active: 0, trialing: 0, pastDue: 0, suspended: 0 };
    const payers = [];
    const cloud = [];
    let revenue = 0;
    let aiUses = 0;
    const aiClients = [];

    tenants.forEach((tenant, index) => {
      const status = tenant.billingStatus || 'trialing';
      if (status === 'active') counts.active += 1;
      else if (status === 'past_due') counts.pastDue += 1;
      else if (status === 'suspended') counts.suspended += 1;
      else counts.trialing += 1;

      const amount = monthlyFee(tenant);
      revenue += amount;
      const plan = byPlan[tenant.plan] ? tenant.plan : 'basic';
      if (amount > 0) {
        byPlan[plan].clients += 1;
        byPlan[plan].amount += amount;
        payers.push({
          id: tenant.id,
          businessName: nameOf(tenant, settingsList[index]),
          planName: PLAN_CATALOG[plan]?.name || plan,
          interval: tenant.billingInterval === 'year' ? 'year' : 'month',
          amount,
        });
      }

      const uses = usageByTenant.get(String(tenant.id)) || 0;
      aiUses += uses;
      cloud.push({
        id: tenant.id,
        businessName: nameOf(tenant, settingsList[index]),
        uses,
        revenue: amount,
        limit: planAiQuota(plan),
        joined: Boolean(tenant.createdAt) && db.aiMonthKey(new Date(tenant.createdAt)) === month,
        day: dayInMonth(tenant.createdAt),
      });
      if (uses > 0) {
        aiClients.push({
          id: tenant.id,
          businessName: nameOf(tenant, settingsList[index]),
          uses,
          cost: uses * costPerUse,
        });
      }
    });

    payers.sort((a, b) => b.amount - a.amount);
    aiClients.sort((a, b) => b.uses - a.uses);
    const aiCost = aiUses * costPerUse;
    const expensesTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
    const profit = revenue - aiCost - expensesTotal;

    const usesByMonth = new Map();
    usageAll.forEach((row) => addCount(usesByMonth, row.month, row.count));
    const spentByMonth = new Map();
    expensesAll.forEach((row) => addCount(spentByMonth, row.month, row.amount));
    const revenueByMonth = new Map(snapshots.map((row) => [row.month, row.revenue]));
    revenueByMonth.set(month, revenue);
    const signupsByMonth = new Map();
    tenants.forEach((tenant) => {
      if (!tenant.createdAt) return;
      addCount(signupsByMonth, db.aiMonthKey(new Date(tenant.createdAt)), 1);
    });

    const trend = recentMonthKeys(month).map((key) => {
      const uses = usesByMonth.get(key) || 0;
      const spent = spentByMonth.get(key) || 0;
      const knownRevenue = revenueByMonth.has(key) ? revenueByMonth.get(key) : null;
      const monthAi = uses * costPerUse;
      return {
        month: key,
        label: SHORT_MONTHS[Number(key.slice(5, 7)) - 1] || key,
        revenue: knownRevenue,
        aiCost: monthAi,
        aiUses: uses,
        expenses: spent,
        signups: signupsByMonth.get(key) || 0,
        profit: knownRevenue == null ? null : knownRevenue - monthAi - spent,
      };
    });

    await db.SavePlatformSnapshot(month, { revenue, aiUses, active: counts.active });

    return {
      month,
      clients: counts,
      revenue,
      byPlan: ['basic', 'growth', 'pro'].map((id) => ({
        id,
        name: PLAN_CATALOG[id].name,
        price: PLAN_CATALOG[id].priceMonth,
        clients: byPlan[id].clients,
        amount: byPlan[id].amount,
      })),
      payers,
      cloud,
      ai: {
        uses: aiUses,
        costPerUse,
        cost: aiCost,
        clients: aiClients,
      },
      expenses: expenses.map((row) => ({ ...row, day: dayInMonth(row.createdAt) })),
      expensesTotal,
      profit,
      trend,
    };
}

async function overview(req, res) {
  try {
    const [books, inbox] = await Promise.all([buildBooks(), supportMail.waitingInbox()]);
    return res.status(200).json({
      ...books,
      waiting: inbox.items || [],
      inboxError: inbox.inboxError || '',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude armar el resumen.');
  }
}

async function report(req, res) {
  try {
    const books = await buildBooks();
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(ownerMonthlyReport(books));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude armar el reporte.');
  }
}

async function createExpense(req, res) {
  try {
    const label = String(req.body?.label || '').trim();
    const amount = Number(req.body?.amount);
    if (label.length < 2) return res.status(400).send('Escribe qué gasto es.');
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).send('Escribe un monto mayor a cero.');
    const created = await db.CreatePlatformExpense({
      label: label.slice(0, 80),
      amount: Math.round(amount * 100) / 100,
      note: String(req.body?.note || '').trim().slice(0, 200),
      month: db.aiMonthKey(),
      createdAt: new Date(),
    });
    return res.status(201).json({
      id: created.id,
      label: created.label,
      amount: Number(created.amount) || 0,
      note: created.note || '',
      month: created.month,
      createdAt: created.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude guardar el gasto.');
  }
}

async function deleteExpense(req, res) {
  try {
    const removed = await db.DeletePlatformExpense(req.params.id);
    if (!removed) return res.status(404).send('No encontré ese gasto.');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude quitar el gasto.');
  }
}

const STAFF_ROLES = ['platform_admin', 'platform_support'];
const STAFF_ROLE_NAMES = { platform_admin: 'Admin', platform_support: 'Soporte' };

function publicStaff(user) {
  if (!user) return null;
  const role = STAFF_ROLES.includes(user.role) ? user.role : 'platform_admin';
  return {
    id: user.id || String(user._id || ''),
    name: user.name || '',
    lastName: user.lastName || '',
    username: user.username || '',
    email: user.email || '',
    role,
    roleName: STAFF_ROLE_NAMES[role] || 'Admin',
    createdAt: user.createdAt || null,
  };
}

async function listStaff(req, res) {
  try {
    const users = await db.ListPlatformUsers();
    return res.status(200).json(users.map(publicStaff));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude cargar el equipo.');
  }
}

async function createStaff(req, res) {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = body.role === 'platform_support' ? 'platform_support' : 'platform_admin';
    if (name.length < 2) return res.status(400).send('Escribe el nombre.');
    if (!lastName) return res.status(400).send('Escribe el apellido.');
    if (!email.includes('@')) return res.status(400).send('Escribe un correo válido.');
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return res.status(400).send('El usuario debe tener 3 a 30 letras, números, punto o guion.');
    }
    if (password.length < 8) return res.status(400).send('La contraseña debe tener al menos 8 caracteres.');
    if (await db.FindUserByUsername(username)) return res.status(400).send('Ese usuario ya existe.');
    if (await db.FindUserByEmail(email)) return res.status(400).send('Ese correo ya está registrado.');

    const now = new Date();
    const result = await db.CreateUser({
      name,
      lastName,
      email,
      username,
      password: await hasher.hashPassword(password),
      cellphone: String(body.cellphone || '0000000000').replace(/\D/g, '').slice(0, 10) || '0000000000',
      role,
      tenantId: null,
      createdAt: now,
      updatedAt: now,
    });
    const created = await db.ListPlatformUsers();
    const fresh = created.find((user) => user.username === username) || {
      id: String(result.insertedId),
      name,
      lastName,
      username,
      email,
      role,
      createdAt: now,
    };
    return res.status(201).json(publicStaff(fresh));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude crear a esa persona.');
  }
}

async function deleteStaff(req, res) {
  try {
    const id = String(req.params.id || '');
    const users = await db.ListPlatformUsers();
    const target = users.find((user) => user.id === id);
    if (!target) return res.status(404).send('No encontré a esa persona.');
    if (target.username === req.user.username) {
      return res.status(400).send('No puedes quitarte a ti mismo.');
    }
    if (target.role === 'platform_admin') {
      const admins = await db.CountPlatformAdmins();
      if (admins <= 1) return res.status(400).send('Debe quedar al menos un admin.');
    }
    const removed = await db.DeleteUserById(id);
    if (!removed) return res.status(404).send('No encontré a esa persona.');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude quitar a esa persona.');
  }
}

module.exports = {
  listTenants,
  getTenant,
  updateTenant,
  clientMail,
  sendClientMail,
  inbox,
  suspend,
  reactivate,
  setPlan,
  overview,
  report,
  createExpense,
  deleteExpense,
  listStaff,
  createStaff,
  deleteStaff,
};
