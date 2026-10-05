/**
 * Portal de socios (vendedores/proveedores de Mi Tiendita).
 *
 * Tres niveles separados: plataforma → socio → tienda.
 * - partner_admin: dueño del socio. Ve todas sus tiendas, el dinero (comisiones) y maneja a su equipo.
 * - partner_staff: trabajador del socio. Ve y atiende las tiendas del socio, sin dinero ni equipo.
 * Un socio solo ve las tiendas que llegaron con su código (tenant.referrerId === partnerId).
 */
const db = require('../database/mongodb');
const pdb = require('../database/partner.db');
const refDb = require('../database/referral.db');
const referrals = require('./referral.service');
const limits = require('./plan-limits.service');
const sessions = require('./session.service');
const hasher = require('../utils/bcrypt.utils');
const { passwordProblem } = require('../utils/password-policy');
const { PARTNER_ROLES } = require('../models/tenant.model');
const { planName } = limits;

class PartnerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ROLE_NAMES = { partner_admin: 'Dueño', partner_staff: 'Asesor' };
const STATUS_NAMES = { trialing: 'Prueba', active: 'Activo', past_due: 'Pago atrasado', suspended: 'Suspendido' };
const DAY = 86400000;

const isAdmin = (user) => user?.role === 'partner_admin';
const fullName = (u) => `${u?.name || ''} ${u?.lastName || ''}`.trim() || u?.username || '';
const toTime = (v) => (v ? new Date(v).getTime() : 0);

async function partnerOf(user) {
  const partner = user?.partnerId ? await refDb.GetReferrerById(user.partnerId) : null;
  if (!partner) throw new PartnerError(403, 'Tu cuenta ya no está ligada a un socio. Escribe a Mi Tiendita.');
  return partner;
}

// ───────── Tiendas ─────────
async function cardFor(tenant, { assignees = new Map(), lastNotes = new Map() } = {}) {
  const [settings, users] = await Promise.all([db.GetSettings(tenant.id), db.ListUsersByTenant(tenant.id)]);
  const owner = users.find((u) => u.role === 'admin') || users[0] || null;
  const lastSeenAt = users.reduce((latest, u) => {
    const at = u.lastLoginAt ? new Date(u.lastLoginAt) : null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  const status = tenant.billingStatus || 'trialing';
  return {
    id: tenant.id,
    businessName: settings?.businessName || tenant.name || 'Sin nombre',
    plan: tenant.plan || 'basic',
    planName: planName(tenant.plan || 'basic'),
    billingStatus: status,
    billingStatusName: STATUS_NAMES[status] || 'Prueba',
    isPerpetual: tenant.plan === 'perpetual',
    trialEndsAt: tenant.trialEndsAt || null,
    currentPeriodEnd: tenant.currentPeriodEnd || null,
    createdAt: tenant.createdAt || null,
    referredAt: tenant.referredAt || tenant.createdAt || null,
    lastSeenAt,
    usersCount: users.filter((u) => !u.disabled).length,
    ownerName: owner ? fullName(owner) : '',
    ownerEmail: owner?.email || '',
    ownerPhone: owner?.cellphone || settings?.phone || '',
    address: settings?.address || '',
    businessType: settings?.businessType || '',
    setupCompleted: Boolean(settings?.setupCompleted),
    assignee: tenant.partnerAssignee || null,
    assigneeName: tenant.partnerAssignee ? assignees.get(tenant.partnerAssignee) || tenant.partnerAssignee : '',
    lastNoteAt: lastNotes.get(tenant.id) || null,
  };
}

/** Lo que pide atención del socio, de lo más urgente a lo menos. */
function attentionFor(card, now = Date.now()) {
  if (card.billingStatus === 'suspended') return { tone: 'bad', label: 'Suspendida' };
  if (card.billingStatus === 'past_due') return { tone: 'bad', label: 'Pago atrasado' };
  if (card.billingStatus === 'trialing' && card.trialEndsAt) {
    const left = Math.ceil((toTime(card.trialEndsAt) - now) / DAY);
    if (left < 0) return { tone: 'bad', label: 'La prueba ya venció' };
    if (left <= 3) return { tone: 'warn', label: left === 0 ? 'La prueba vence hoy' : `La prueba vence en ${left} ${left === 1 ? 'día' : 'días'}` };
  }
  if (!card.lastSeenAt) return { tone: 'warn', label: 'Nunca ha entrado' };
  if (now - toTime(card.lastSeenAt) > 14 * DAY) return { tone: 'warn', label: 'Lleva más de 2 semanas sin entrar' };
  if (!card.setupCompleted) return { tone: 'info', label: 'No ha terminado de configurar' };
  return null;
}

async function assigneeNames(partnerId) {
  const team = await pdb.ListPartnerUsers(partnerId);
  return new Map(team.map((u) => [u.username, fullName(u)]));
}

async function listClients(user) {
  const partner = await partnerOf(user);
  const [tenants, assignees, lastNotes] = await Promise.all([
    refDb.ListTenantsByReferrer(partner.id),
    assigneeNames(partner.id),
    pdb.LastNotes(partner.id),
  ]);
  const cards = [];
  for (const t of tenants) {
    const card = await cardFor(t, { assignees, lastNotes });
    cards.push({ ...card, attention: attentionFor(card) });
  }
  return cards;
}

async function clientDetail(user, tenantId) {
  const partner = await partnerOf(user);
  const tenant = await pdb.GetPartnerTenant(tenantId, partner.id);
  if (!tenant) throw new PartnerError(404, 'Esa tienda no es de tus clientes.');
  const [assignees, lastNotes] = await Promise.all([assigneeNames(partner.id), pdb.LastNotes(partner.id)]);
  const [card, usage, users, events, notes, commissions] = await Promise.all([
    cardFor(tenant, { assignees, lastNotes }),
    limits.usageFor(tenant.id, tenant.plan || 'basic').catch(() => null),
    db.ListUsersByTenant(tenant.id),
    db.ListBillingEvents(tenant.id, 30).catch(() => []),
    pdb.ListNotes(partner.id, tenant.id),
    isAdmin(user) ? refDb.ListCommissions({ referrerId: partner.id, tenantId: tenant.id, limit: 60 }) : Promise.resolve(null),
  ]);
  return {
    ...card,
    attention: attentionFor(card),
    usage,
    // Del equipo de la tienda solo lo necesario para atenderla
    people: users.map((u) => ({
      id: u.id,
      name: fullName(u),
      role: u.role === 'admin' ? 'Dueño' : 'Cajero',
      email: u.email,
      disabled: u.disabled,
      lastLoginAt: u.lastLoginAt,
    })),
    history: events.map((e) => ({ id: e.id, type: e.type, note: e.note, amount: isAdmin(user) ? e.amount : undefined, at: e.at })),
    notes,
    commissions: commissions
      ? commissions.map((c) => ({ id: c.id, amount: c.amount, rate: c.rate, commission: c.commission, status: c.status, source: c.source, createdAt: c.createdAt }))
      : null,
  };
}

async function addNote(user, tenantId, text) {
  const partner = await partnerOf(user);
  const clean = String(text || '').trim().slice(0, 1000);
  if (clean.length < 2) throw new PartnerError(400, 'Escribe la nota.');
  if (!(await pdb.GetPartnerTenant(tenantId, partner.id))) throw new PartnerError(404, 'Esa tienda no es de tus clientes.');
  return pdb.CreateNote({
    partnerId: partner.id,
    tenantId: String(tenantId),
    text: clean,
    author: user.username,
    authorName: user.displayName || user.username,
    createdAt: new Date(),
  });
}

async function assign(user, tenantId, username) {
  if (!isAdmin(user)) throw new PartnerError(403, 'Solo el dueño reparte las tiendas.');
  const partner = await partnerOf(user);
  if (username) {
    const member = await pdb.FindPartnerUserByUsername(username, partner.id);
    if (!member || member.disabled) throw new PartnerError(400, 'Esa persona no está activa en tu equipo.');
  }
  const ok = await pdb.SetTenantAssignee(tenantId, partner.id, username || null);
  if (!ok) throw new PartnerError(404, 'Esa tienda no es de tus clientes.');
  return { assignee: username || null };
}

// ───────── Inicio ─────────
async function home(user) {
  const partner = await partnerOf(user);
  const clients = await listClients(user);
  const counts = {
    total: clients.length,
    active: clients.filter((c) => c.billingStatus === 'active').length,
    trialing: clients.filter((c) => c.billingStatus === 'trialing').length,
    atRisk: clients.filter((c) => c.attention && c.attention.tone === 'bad').length,
    mine: clients.filter((c) => c.assignee === user.username).length,
  };
  const order = { bad: 0, warn: 1, info: 2 };
  const attention = clients
    .filter((c) => c.attention && (isAdmin(user) || !c.assignee || c.assignee === user.username))
    .sort((a, b) => order[a.attention.tone] - order[b.attention.tone] || toTime(a.trialEndsAt) - toTime(b.trialEndsAt))
    .slice(0, 12)
    .map((c) => ({ id: c.id, businessName: c.businessName, attention: c.attention, ownerName: c.ownerName, ownerPhone: c.ownerPhone, assigneeName: c.assigneeName }));
  const out = {
    partner: { id: partner.id, name: partner.name, code: partner.code, status: partner.status },
    counts,
    attention,
    newest: [...clients].sort((a, b) => toTime(b.referredAt) - toTime(a.referredAt)).slice(0, 5),
  };
  if (isAdmin(user)) {
    const d = await referrals.detail(partner.id);
    out.money = {
      rate: d.rate,
      closedSales: d.closedSales,
      next: d.next,
      ladder: d.ladder,
      pending: d.pending,
      paid: d.paid,
      earned: d.earned,
    };
  }
  return out;
}

async function commissions(user) {
  if (!isAdmin(user)) throw new PartnerError(403, 'Solo el dueño ve las comisiones.');
  const partner = await partnerOf(user);
  const d = await referrals.detail(partner.id);
  return {
    code: d.code,
    rate: d.rate,
    closedSales: d.closedSales,
    next: d.next,
    ladder: d.ladder,
    pending: d.pending,
    pendingCount: d.pendingCount,
    paid: d.paid,
    earned: d.earned,
    commissions: d.commissions.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      businessName: c.businessName,
      source: c.source,
      amount: c.amount,
      rate: c.rate,
      commission: c.commission,
      status: c.status,
      createdAt: c.createdAt,
      paidAt: c.paidAt || null,
    })),
    payouts: d.payouts.map((p) => ({ id: p.id, total: p.total, count: p.count, paidAt: p.paidAt, note: p.note || '' })),
  };
}

// ───────── Equipo del socio ─────────
function validMember(input) {
  const out = {
    name: String(input.name || '').trim().slice(0, 60),
    lastName: String(input.lastName || '').trim().slice(0, 60),
    email: String(input.email || '').trim().toLowerCase().slice(0, 120),
    username: String(input.username || '').trim().toLowerCase().slice(0, 40),
    cellphone: String(input.cellphone || '').replace(/\D/g, '').slice(0, 10),
    role: PARTNER_ROLES.includes(input.role) ? input.role : 'partner_staff',
  };
  if (out.name.length < 2) throw new PartnerError(400, 'Escribe el nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new PartnerError(400, 'Escribe un correo válido.');
  if (!/^[a-z0-9._-]{3,40}$/.test(out.username)) throw new PartnerError(400, 'El usuario lleva de 3 a 40 letras, números, punto o guion.');
  return out;
}

/**
 * Crea una cuenta del socio. La usan el dueño del socio (para su equipo) y el admin de la plataforma
 * (para dar el primer acceso). Entra con la contraseña inicial y activa la 2FA al primer ingreso.
 */
/** Revisa los datos de una cuenta nueva (sin crearla). */
async function checkMember(input) {
  const data = validMember(input);
  const weak = passwordProblem(input.password, { email: data.email, username: data.username, name: data.name });
  if (weak) throw new PartnerError(400, weak);
  if (await db.FindUserByUsername(data.username)) throw new PartnerError(409, 'Ese usuario ya existe. Prueba con otro.');
  if (await db.FindUserByEmail(data.email)) throw new PartnerError(409, 'Ya hay una cuenta con ese correo.');
  return data;
}

async function createMember(partnerId, input) {
  const partner = await refDb.GetReferrerById(partnerId);
  if (!partner) throw new PartnerError(404, 'Socio no encontrado.');
  const data = await checkMember(input);
  await db.CreateUser({
    ...data,
    password: await hasher.hashPassword(String(input.password)),
    partnerId: partner.id,
    tenantId: null,
    tokenVersion: 0,
    createdAt: new Date(),
  });
  const created = await db.FindUserByUsername(data.username);
  return { id: String(created._id), ...data, roleName: ROLE_NAMES[data.role] };
}

async function listTeam(partnerId) {
  const team = await pdb.ListPartnerUsers(partnerId);
  return team.map((u) => ({ ...u, roleName: ROLE_NAMES[u.role] || u.role }));
}

async function loadMember(partnerId, id, actor) {
  const target = await pdb.FindPartnerUser(id, partnerId);
  if (!target) throw new PartnerError(404, 'Esa persona no es de tu equipo.');
  if (actor && target.username === actor.username) throw new PartnerError(400, 'No puedes cambiar tu propia cuenta desde aquí.');
  return target;
}

/**
 * Alguien se postula desde la página para ser proveedor oficial: se crea el socio en revisión
 * y su cuenta de dueño. Puede entrar a su portal (activa la 2FA), pero su código no sirve
 * hasta que la plataforma lo apruebe.
 */
async function apply(input) {
  const member = { ...input, role: 'partner_admin' };
  await checkMember(member);
  const fullNameText = `${String(input.name || '').trim()} ${String(input.lastName || '').trim()}`.trim();
  const state = String(input.state || '').trim();
  if (state.length < 2) throw new PartnerError(400, 'Escribe tu estado.');
  let partner;
  try {
    partner = await referrals.createReferrer(
      {
        name: fullNameText,
        email: input.email,
        phone: input.cellphone,
        state,
        city: input.city,
        notes: input.notes,
      },
      { status: 'pending', source: 'signup' }
    );
  } catch (err) {
    if (err instanceof referrals.ReferralError) throw new PartnerError(err.status, err.message);
    throw err;
  }
  try {
    const user = await createMember(partner.id, member);
    return { partner, user };
  } catch (err) {
    // No dejar un socio sin cuenta si algo falló al crearla
    await refDb.DeleteReferrer(partner.id).catch(() => {});
    throw err;
  }
}

/** Cambio que puede dejar al socio sin dueño activo: se vuelve a contar y se deshace si quedó en cero. */
async function guarded(partnerId, target, patch, undo) {
  const losesAdmin = target.role === 'partner_admin' && !target.disabled;
  if (losesAdmin && (await pdb.CountActivePartnerAdmins(partnerId)) <= 1) {
    throw new PartnerError(400, 'Debe quedar al menos un dueño activo.');
  }
  await db.UpdateUserById(String(target._id), patch);
  if (losesAdmin && (await pdb.CountActivePartnerAdmins(partnerId)) < 1) {
    await db.UpdateUserById(String(target._id), undo);
    throw new PartnerError(409, 'Otro cambio al mismo tiempo dejaba al socio sin dueño. No se aplicó.');
  }
}

async function setActive(partnerId, id, active, actor) {
  const target = await loadMember(partnerId, id, actor);
  if (active) {
    if (!target.disabled) return { ok: true };
    await db.UpdateUserById(String(target._id), { disabled: false, disabledAt: null, failedLogins: 0, lockedUntil: null });
  } else {
    if (target.disabled) return { ok: true };
    await guarded(partnerId, target, { disabled: true, disabledAt: new Date() }, { disabled: false, disabledAt: null });
    await pdb.ClearAssignee(partnerId, target.username);
  }
  await sessions.revokeAll(target, active ? 'reactivated' : 'disabled');
  return { ok: true };
}

async function changeRole(partnerId, id, role, actor) {
  if (!PARTNER_ROLES.includes(role)) throw new PartnerError(400, 'Rol inválido.');
  const target = await loadMember(partnerId, id, actor);
  if (target.role === role) return { ok: true };
  if (target.role === 'partner_admin') await guarded(partnerId, target, { role }, { role: target.role });
  else await db.UpdateUserById(String(target._id), { role });
  await sessions.revokeAll(target, 'role_change');
  return { ok: true, role };
}

module.exports = {
  PartnerError,
  ROLE_NAMES,
  isAdmin,
  attentionFor,
  listClients,
  clientDetail,
  addNote,
  assign,
  home,
  commissions,
  checkMember,
  createMember,
  apply,
  listTeam,
  setActive,
  changeRole,
};
