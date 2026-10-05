const db = require('../database/mongodb');
const { passwordProblem } = require('../utils/password-policy');
const { PLANS, BILLING_STATUSES, trialEndsFrom } = require('../models/tenant.model');
const { planAiQuota, planPrice, PLAN_CATALOG, isPerpetual, hasAiFeatures } = require('../services/plans.catalog');
const mp = require('../services/mercadopago.service');
const supportMail = require('../services/support-mail.service');
const { ownerMonthlyReport } = require('../utils/mail-templates');
const hasher = require('../utils/bcrypt.utils');
const audit = require('../services/platform-audit.service');
const limits = require('../services/plan-limits.service');
const sessions = require('../services/session.service');
const referrals = require('../services/referral.service');
const partners = require('../services/partner.service');
const promoSvc = require('../services/promo.service');
const refTiers = require('../services/referral.tiers');

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

/**
 * Ficha de un cliente. `pre` trae lo ya leído en lote (lista de clientes) para no hacer
 * tres consultas por tienda.
 */
async function clientCard(tenant, { withUsers = false, pre = null } = {}) {
  const [settings, users, aiUsed] = pre
    ? [pre.settings.get(tenant.id) || null, pre.users.get(tenant.id) || [], pre.ai.get(tenant.id) || 0]
    : await Promise.all([db.GetSettings(tenant.id), db.ListUsersByTenant(tenant.id), db.GetAiUsage(tenant.id)]);
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
    lastSeenAt: users.reduce((latest, user) => {
      const at = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
      return at && (!latest || at > latest) ? at : latest;
    }, null),
    usersCount: users.length,
    ownerName: owner ? `${owner.name || ''} ${owner.lastName || ''}`.trim() : '',
    ownerEmail: owner?.email || '',
    ownerUsername: owner?.username || '',
    ownerPhone: owner?.cellphone || '',
    aiUsed: hasAiFeatures(plan) ? aiUsed : 0,
    aiLimit: hasAiFeatures(plan) ? planAiQuota(plan) : 0,
    aiEnabled: hasAiFeatures(plan),
    isPerpetual: isPerpetual(plan),
    referrerId: tenant.referrerId || null,
    referralCode: tenant.referralCode || '',
  };
  if (withUsers) card.users = users;
  return card;
}

async function listTenants(req, res) {
  try {
    const staffEmail = await currentStaffEmail(req);
    const [tenants, inbox] = await Promise.all([db.ListTenants(), supportMail.waitingInbox(staffEmail)]);
    const waiting = new Map();
    for (const item of inbox.items || []) {
      const current = waiting.get(item.tenantId) || { count: 0, at: null };
      current.count += 1;
      if (!current.at || new Date(item.updatedAt || 0) > new Date(current.at)) current.at = item.updatedAt;
      waiting.set(item.tenantId, current);
    }
    const ids = tenants.map((t) => t.id);
    const [settings, users, ai] = await Promise.all([
      db.GetSettingsMany(ids),
      db.ListUsersByTenants(ids),
      db.ListAiUsage(db.aiMonthKey()),
    ]);
    const pre = { settings, users, ai: new Map(ai.map((row) => [row.tenantId, row.count])) };
    const enriched = await Promise.all(tenants.map(async (tenant) => {
      const card = await clientCard(tenant, { pre });
      const open = waiting.get(tenant.id) || { count: 0, at: null };
      return { ...card, waiting: open.count, waitingAt: open.at };
    }));
    return res.status(200).json(enriched);
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'No pude cargar los clientes.');
  }
}

async function getTenant(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    const [card, usage, referrer] = await Promise.all([
      clientCard(tenant, { withUsers: true }),
      limits.usageFor(tenant.id, tenant.plan || 'basic').catch(() => null),
      referrals.brief(tenant.referrerId).catch(() => null),
    ]);
    return res.status(200).json({ ...card, usage, referrer });
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
    const changes = audit.describeChanges(tenant, { ...tenant, ...patch }, { plan: PLAN_NAMES, status: STATUS_NAMES });
    if (changes.length) {
      await audit.record(req, {
        tenantId: tenant.id,
        type: 'tenant_updated',
        message: `Cambió ${changes.join(', ')}`,
        meta: { changes },
      });
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
    const staffEmail = await currentStaffEmail(req);
    return res.status(200).json(await supportMail.threadFor(tenant.id, { staffEmail }));
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'No pude cargar los correos.');
  }
}

async function sendClientMail(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    const staffEmail = await currentStaffEmail(req);
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
      staffEmail,
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
    const staffEmail = await currentStaffEmail(req);
    return res.status(200).json(await supportMail.unmatchedInbox(staffEmail));
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'No pude leer la bandeja.');
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
    await audit.record(req, {
      tenantId: req.params.id,
      type: 'tenant_suspended',
      message: `Suspendió la tienda (${reason})`,
      meta: { reason },
    });
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
    await audit.record(req, {
      tenantId: req.params.id,
      type: 'tenant_reactivated',
      message: mode === 'trial' ? 'Reactivó la tienda con una prueba nueva' : 'Reactivó la tienda',
      meta: { mode },
    });
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
    await audit.record(req, {
      tenantId: req.params.id,
      type: 'tenant_plan_changed',
      message: `Cambió el plan ${PLAN_NAMES[tenant.plan] || tenant.plan} → ${PLAN_NAMES[plan] || plan}`,
      meta: { from: tenant.plan, to: plan },
    });
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
  // Mientras dura la promoción de lanzamiento se cobra el precio promocional
  if (!yearly && tenant.promo?.state === 'active') return promoSvc.currentMonthly(tenant);
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
    const settingsMap = await db.GetSettingsMany(tenants.map((tenant) => tenant.id));
    const settingsList = tenants.map((tenant) => settingsMap.get(tenant.id) || null);
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
    // Aprovecha la visita del admin para subir al precio normal las promociones que ya vencieron
    promoSvc.sweepAll().catch(() => {});
    const staffEmail = await currentStaffEmail(req);
    const [books, inbox] = await Promise.all([buildBooks(), supportMail.waitingInbox(staffEmail)]);
    return res.status(200).json({
      ...books,
      waiting: inbox.items || [],
      inboxError: inbox.inboxError || '',
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'No pude armar el resumen.');
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
    await audit.record(req, {
      type: 'expense_created',
      message: `Anotó el gasto «${created.label}» por $${Number(created.amount).toFixed(2)}`,
      meta: { id: created.id, amount: created.amount },
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
    await audit.record(req, { type: 'expense_deleted', message: 'Quitó un gasto', meta: { id: req.params.id } });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude quitar el gasto.');
  }
}

const STAFF_ROLES = ['platform_admin', 'platform_support'];
const STAFF_ROLE_NAMES = { platform_admin: 'Admin', platform_support: 'Soporte' };

async function currentStaffEmail(req) {
  const user = await db.FindUserByUsername(req.user.username);
  const email = String(user?.email || req.user.email || '').trim().toLowerCase();
  if (!email.includes('@')) {
    const err = new Error('Tu usuario no tiene un correo asignado.');
    err.status = 400;
    throw err;
  }
  return email;
}

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
    lastLoginAt: user.lastLoginAt || null,
    mfaEnabled: Boolean(user.mfaEnabled),
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
    const weak = passwordProblem(password, { email, username, name });
    if (weak) return res.status(400).send(weak);
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
    await audit.record(req, {
      type: 'staff_created',
      message: `Agregó a ${name} ${lastName} al equipo como ${STAFF_ROLE_NAMES[role]}`,
      meta: { username, role },
    });
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
    sessions.forgetUser(target.username);
    await audit.record(req, {
      type: 'staff_removed',
      message: `Quitó a ${target.name} ${target.lastName} del equipo`,
      meta: { username: target.username, role: target.role },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude quitar a esa persona.');
  }
}

/** Bandeja de soporte: tickets de todos los clientes que le tocan a quien pregunta. */
async function support(req, res) {
  try {
    const staffEmail = await currentStaffEmail(req);
    const status = ['open', 'answered'].includes(req.query.status) ? req.query.status : 'all';
    return res.status(200).json(
      await supportMail.ticketBoard(staffEmail, { status, q: req.query.q, limit: req.query.limit })
    );
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'No pude cargar la bandeja de soporte.');
  }
}

/** Historia de un cliente: pagos y licencias (billing_events) junto con lo que hizo el equipo. */
async function tenantActivity(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    const [events, actions] = await Promise.all([
      db.ListBillingEvents(tenant.id, 40),
      db.ListPlatformAudit({ tenantId: tenant.id, limit: 40 }),
    ]);
    const items = [
      ...events.map((e) => ({
        id: `b${e.id || e._id || e.at}`,
        source: 'billing',
        type: e.type,
        message: e.note || e.type,
        amount: e.amount ?? null,
        actor: '',
        at: e.at || e.createdAt || null,
      })),
      ...actions.map((a) => ({
        id: `a${a.id}`,
        source: 'team',
        type: a.type,
        message: a.message,
        amount: null,
        actor: a.actor || '',
        at: a.createdAt,
      })),
    ]
      .filter((i) => i.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 60);
    return res.status(200).json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude leer la actividad.');
  }
}

/** Últimos movimientos del equipo en toda la plataforma (solo admin). */
async function activity(req, res) {
  try {
    const rows = await db.ListPlatformAudit({ limit: Number(req.query.limit) || 60 });
    const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter(Boolean))];
    const names = new Map();
    const [tenantRows, settingsMap] = await Promise.all([db.ListTenants(), db.GetSettingsMany(tenantIds)]);
    const tenantMap = new Map(tenantRows.map((t) => [String(t.id), t]));
    for (const id of tenantIds) {
      names.set(id, settingsMap.get(id)?.businessName || tenantMap.get(id)?.name || 'Cliente');
    }
    return res.status(200).json({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        actor: r.actor || '',
        tenantId: r.tenantId || null,
        businessName: r.tenantId ? names.get(r.tenantId) || 'Cliente' : '',
        at: r.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude leer la actividad.');
  }
}

/**
 * Restablece la verificación en dos pasos de alguien del equipo que perdió su celular y sus
 * códigos. Cierra sus sesiones y, al volver a entrar, tiene que activarla de nuevo.
 */
async function resetStaffMfa(req, res) {
  try {
    const target = (await db.ListPlatformUsers()).find((user) => user.id === String(req.params.id || ''));
    if (!target) return res.status(404).send('No encontré a esa persona.');
    if (target.username === req.user.username) {
      return res.status(400).send('Para cambiar tu propia verificación, hazlo desde Configuración.');
    }
    const user = await db.FindUserById(target.id);
    await db.UpdateUserById(target.id, {
      mfaEnabled: false,
      mfaSecretEnc: null,
      mfaPendingEnc: null,
      mfaRecovery: [],
      mfaLastStep: null,
    });
    await sessions.revokeAll(user, 'mfa_reset');
    await audit.record(req, {
      type: 'staff_mfa_reset',
      message: `Restableció la verificación en dos pasos de ${target.name} ${target.lastName}`,
      meta: { username: target.username },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'No pude restablecer la verificación.');
  }
}


// ───────── Vendedores (referidos) ─────────
const refFail = (res, err) => {
  if (err instanceof referrals.ReferralError) return res.status(err.status).send(err.message);
  console.error(err);
  return res.status(500).send(err.message || 'No pude completar la acción.');
};

async function listReferrers(req, res) {
  try {
    const items = await referrals.listSummaries();
    return res.status(200).json({
      items,
      ladder: refTiers.LADDER,
      totals: {
        sellers: items.length,
        clients: items.reduce((n, r) => n + r.clients, 0),
        pending: Math.round(items.reduce((n, r) => n + r.pending, 0) * 100) / 100,
        paid: Math.round(items.reduce((n, r) => n + r.paid, 0) * 100) / 100,
      },
    });
  } catch (err) {
    return refFail(res, err);
  }
}

async function getReferrer(req, res) {
  try {
    return res.status(200).json(await referrals.detail(req.params.id));
  } catch (err) {
    return refFail(res, err);
  }
}

async function createReferrer(req, res) {
  try {
    const created = await referrals.createReferrer(req.body || {});
    await audit.record(req, {
      type: 'referrer_created',
      message: `Dio de alta al vendedor ${created.name} (${created.code})`,
      meta: { referrerId: created.id },
    });
    return res.status(201).json(await referrals.detail(created.id));
  } catch (err) {
    return refFail(res, err);
  }
}

async function updateReferrer(req, res) {
  try {
    const updated = await referrals.updateReferrer(req.params.id, req.body || {});
    const paused = req.body?.status === 'paused';
    await audit.record(req, {
      type: paused ? 'referrer_paused' : 'referrer_updated',
      message: paused ? `Pausó al vendedor ${updated.name}` : `Actualizó al vendedor ${updated.name}`,
      meta: { referrerId: updated.id },
    });
    return res.status(200).json(await referrals.detail(updated.id));
  } catch (err) {
    return refFail(res, err);
  }
}

async function payReferrer(req, res) {
  try {
    const payout = await referrals.payOut(req.params.id, {
      by: req.user?.username,
      note: req.body?.note,
    });
    await audit.record(req, {
      type: 'referrer_paid',
      message: `Liquidó $${Number(payout.total).toFixed(2)} en comisiones (${payout.count} cobros)`,
      meta: { referrerId: req.params.id, payoutId: payout.id, total: payout.total },
    });
    return res.status(201).json(await referrals.detail(req.params.id));
  } catch (err) {
    return refFail(res, err);
  }
}

async function voidCommission(req, res) {
  try {
    const updated = await referrals.voidCommission(req.params.id, { reason: req.body?.reason });
    await audit.record(req, {
      tenantId: updated.tenantId,
      type: 'commission_voided',
      message: `Anuló una comisión de $${Number(updated.commission).toFixed(2)}`,
      meta: { commissionId: updated.id },
    });
    return res.status(200).json(updated);
  } catch (err) {
    return refFail(res, err);
  }
}

// Accesos al portal de socios que da el admin de la plataforma
async function referrerUsers(req, res) {
  try {
    return res.status(200).json(await partners.listTeam(req.params.id));
  } catch (err) {
    return refFail(res, err);
  }
}

async function createReferrerUser(req, res) {
  try {
    const created = await partners.createMember(req.params.id, req.body || {});
    await audit.record(req, {
      type: 'partner_user_created',
      message: `Dio acceso al portal de socios a ${created.username} (${created.roleName})`,
      meta: { referrerId: req.params.id, userId: created.id },
    });
    return res.status(201).json(created);
  } catch (err) {
    if (err instanceof partners.PartnerError) return res.status(err.status).send(err.message);
    return refFail(res, err);
  }
}

async function setReferrerUserActive(req, res) {
  try {
    const active = req.body?.active !== false;
    await partners.setActive(req.params.id, req.params.userId, active, null);
    await audit.record(req, {
      type: active ? 'partner_user_reactivated' : 'partner_user_disabled',
      message: `${active ? 'Reactivó' : 'Desactivó'} un acceso al portal de socios`,
      meta: { referrerId: req.params.id, userId: req.params.userId },
    });
    return res.status(200).json(await partners.listTeam(req.params.id));
  } catch (err) {
    if (err instanceof partners.PartnerError) return res.status(err.status).send(err.message);
    return refFail(res, err);
  }
}

/** Asigna (o quita) el vendedor de una tienda que ya existe. */
async function setTenantReferrer(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    const raw = req.body?.code;
    if (raw === null || raw === '') {
      await db.UpdateTenant(tenant.id, { referrerId: null, referralCode: '', referredAt: null });
      await audit.record(req, { tenantId: tenant.id, type: 'referrer_removed', message: 'Quitó el vendedor de esta tienda' });
      return res.status(200).json({ referrerId: null, referralCode: '' });
    }
    const referrer = await referrals.findActiveByCode(raw);
    if (!referrer) return res.status(400).send('Ese código no existe o el vendedor está pausado.');
    const fields = referrals.referralFields(referrer);
    await db.UpdateTenant(tenant.id, fields);
    await audit.record(req, {
      tenantId: tenant.id,
      type: 'referrer_assigned',
      message: `Asignó la tienda al vendedor ${referrer.name} (${referrer.code})`,
      meta: { referrerId: referrer.id },
    });
    return res.status(200).json({ referrerId: referrer.id, referralCode: referrer.code, seller: referrer.name });
  } catch (err) {
    return refFail(res, err);
  }
}

/** Un cobro que no pasó por Mercado Pago (efectivo, transferencia, licencia perpetua): también paga comisión. */
async function manualPayment(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré ese cliente.');
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).send('Escribe un monto mayor a cero.');
    const note = String(req.body?.note || '').trim().slice(0, 200) || 'Cobro registrado a mano';
    await db.CreateBillingEvent({
      tenantId: tenant.id,
      type: 'payment',
      plan: tenant.plan,
      interval: tenant.billingInterval,
      amount,
      note,
    });
    let commission = null;
    if (tenant.referrerId) {
      commission = await referrals.recordPayment({
        tenant,
        amount,
        source: 'manual',
        key: `manual:${tenant.id}:${Date.now()}`,
        note,
      });
    }
    await audit.record(req, {
      tenantId: tenant.id,
      type: 'manual_payment',
      message: `Registró un cobro de $${amount.toFixed(2)}${commission ? ` (comisión $${commission.commission.toFixed(2)})` : ''}`,
      meta: { amount },
    });
    return res.status(201).json({ ok: true, commission });
  } catch (err) {
    return refFail(res, err);
  }
}

module.exports = {
  referrerUsers,
  createReferrerUser,
  setReferrerUserActive,
  listReferrers,
  getReferrer,
  createReferrer,
  updateReferrer,
  payReferrer,
  voidCommission,
  setTenantReferrer,
  manualPayment,
  support,
  tenantActivity,
  activity,
  resetStaffMfa,
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
