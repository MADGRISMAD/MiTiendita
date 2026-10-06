/**
 * Vendedores (referidos): alta, código de referencia, tiendas referidas y comisión por cada cobro.
 *
 * - Cada vendedor tiene un código único (MT-XXXXXX). La tienda lo captura al registrarse (o el admin lo asigna).
 * - Cada cobro de una tienda referida genera una comisión; la tasa sale de la escalera según las ventas cerradas.
 * - Un mismo cobro nunca paga dos veces (clave única) y los registros pagados no se tocan.
 */
const crypto = require('crypto');
const { ObjectId } = require('../utils/objectid');
const refDb = require('../database/referral.db');
const tiers = require('./referral.tiers');

class ReferralError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const CODE_PREFIX = 'MT-';
// Sin 0/O/1/I/L para que se pueda dictar por teléfono sin confusiones
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^MT-[A-Z0-9]{6}$/;

function normalizeCode(raw) {
  let s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('MT')) s = s.slice(2);
  return s ? `${CODE_PREFIX}${s}` : '';
}

function randomCode() {
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return CODE_PREFIX + s;
}

async function uniqueCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = randomCode();
    if (!(await refDb.GetReferrerByCode(code))) return code;
  }
  throw new ReferralError(500, 'No se pudo generar un código. Intenta de nuevo.');
}

function cleanText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function validateReferrer(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    out.name = cleanText(input.name, 80);
    if (out.name.length < 2) throw new ReferralError(400, 'Escribe el nombre del vendedor.');
  }
  if (!partial || input.email !== undefined) {
    out.email = cleanText(input.email, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new ReferralError(400, 'Escribe un correo válido.');
  }
  if (!partial || input.phone !== undefined) {
    out.phone = cleanText(input.phone, 20).replace(/[^\d+]/g, '');
  }
  if (!partial || input.state !== undefined) out.state = cleanText(input.state, 60);
  if (!partial || input.city !== undefined) out.city = cleanText(input.city, 60);
  if (!partial || input.notes !== undefined) out.notes = cleanText(input.notes, 300);
  // Datos para pagarle sus comisiones desde Mercado Pago o el banco
  if (!partial || input.payoutHolder !== undefined) out.payoutHolder = cleanText(input.payoutHolder, 80);
  if (!partial || input.payoutBank !== undefined) out.payoutBank = cleanText(input.payoutBank, 60);
  if (!partial || input.payoutClabe !== undefined) {
    out.payoutClabe = String(input.payoutClabe == null ? '' : input.payoutClabe).replace(/\D/g, '');
    if (out.payoutClabe && out.payoutClabe.length !== 18) throw new ReferralError(400, 'La CLABE lleva 18 dígitos.');
  }
  if (!partial || input.payoutMpEmail !== undefined) {
    out.payoutMpEmail = cleanText(input.payoutMpEmail, 120).toLowerCase();
    if (out.payoutMpEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.payoutMpEmail)) {
      throw new ReferralError(400, 'El correo de su cuenta de Mercado Pago no es válido.');
    }
  }
  if (input.status !== undefined) {
    if (!['active', 'paused', 'pending'].includes(input.status)) throw new ReferralError(400, 'Estado inválido.');
    out.status = input.status;
  }
  return out;
}

/**
 * Alta de vendedor. El admin lo crea activo; quien se postula desde la página queda `pending`
 * (su código no sirve hasta que lo aprueben).
 */
async function createReferrer(input, { status = 'active', source = 'admin' } = {}) {
  const data = validateReferrer({ ...input, status: undefined });
  if (await refDb.GetReferrerByEmail(data.email)) throw new ReferralError(409, 'Ya hay un vendedor con ese correo.');
  const now = new Date();
  try {
    return await refDb.CreateReferrer({ ...data, status, source, code: await uniqueCode(), createdAt: now, updatedAt: now });
  } catch (err) {
    if (err && err.code === 11000) throw new ReferralError(409, 'Código repetido, intenta de nuevo.');
    throw err;
  }
}

async function updateReferrer(id, input) {
  const current = await refDb.GetReferrerById(id);
  if (!current) throw new ReferralError(404, 'Vendedor no encontrado.');
  const patch = validateReferrer(input, { partial: true });
  if (patch.email && patch.email !== current.email) {
    const other = await refDb.GetReferrerByEmail(patch.email);
    if (other && other.id !== current.id) throw new ReferralError(409, 'Ya hay un vendedor con ese correo.');
  }
  return refDb.UpdateReferrer(id, patch);
}

/** Vendedor activo de ese código, o null. */
async function findActiveByCode(raw) {
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) return null;
  const ref = await refDb.GetReferrerByCode(code);
  return ref && ref.status === 'active' ? ref : null;
}

/** Para el registro: valida el código y que no sea el propio correo del vendedor. */
async function resolveForSignup(rawCode, { email } = {}) {
  if (!String(rawCode || '').trim()) return null;
  const ref = await findActiveByCode(rawCode);
  if (!ref) throw new ReferralError(400, 'El código de referido no es válido. Revísalo o déjalo vacío.');
  if (email && String(email).trim().toLowerCase() === ref.email) {
    throw new ReferralError(400, 'No puedes usar tu propio código de vendedor.');
  }
  return ref;
}

function referralFields(ref) {
  return { referrerId: ref.id, referralCode: ref.code, referredAt: new Date() };
}

// ───────── Comisiones ─────────
/**
 * Registra el cobro de una tienda referida y su comisión. Idempotente por `key`.
 * @returns la comisión creada, o null si la tienda no tiene vendedor / ya estaba registrado.
 */
async function recordPayment({ tenant, amount, source, key, mpPaymentId = null, note = '' }) {
  const value = tiers.round2(amount);
  if (!tenant?.referrerId || !(value > 0) || !key) return null;
  const referrer = await refDb.GetReferrerById(tenant.referrerId);
  if (!referrer) return null;

  if (await refDb.FindCommissionByKey(key)) return null;

  // El primer cobro puede llegar como «activación» y luego como pago autorizado: es el mismo dinero
  if (source === 'authorized_payment') {
    const earlier = (await refDb.ListCommissions({ tenantId: tenant.id, limit: 5 })).find(
      (c) =>
        c.source === 'activation' &&
        c.status !== 'void' &&
        !c.mpPaymentId &&
        Date.now() - new Date(c.createdAt).getTime() < 7 * 24 * 3600 * 1000
    );
    if (earlier) {
      await refDb.UpdateCommission(earlier.id, { mpPaymentId: String(mpPaymentId || ''), adoptedKey: key });
      return null;
    }
  }

  const alreadyClosed = (await refDb.ListPayingTenantIds(referrer.id)).includes(String(tenant.id));
  const closedBefore = await refDb.CountClosedTenants(referrer.id);
  const closed = alreadyClosed ? closedBefore : closedBefore + 1;
  const { rate, commission } = tiers.commissionFor(value, closed);

  return refDb.InsertCommission({
    referrerId: referrer.id,
    referrerCode: referrer.code,
    tenantId: String(tenant.id),
    businessName: tenant.name || '',
    key,
    source,
    mpPaymentId: mpPaymentId ? String(mpPaymentId) : null,
    amount: value,
    rate,
    tier: tiers.tierIndexFor(closed),
    closedSales: closed,
    commission,
    status: 'pending',
    note: cleanText(note, 200),
    createdAt: new Date(),
  });
}

async function voidCommission(id, { reason = '' } = {}) {
  const current = await refDb.GetCommission(id);
  if (!current) throw new ReferralError(404, 'Comisión no encontrada.');
  if (current.status === 'paid') throw new ReferralError(409, 'Esa comisión ya se pagó; no se puede anular.');
  if (current.status === 'void') return current;
  return refDb.UpdateCommission(id, { status: 'void', voidedAt: new Date(), voidReason: cleanText(reason, 200) }, 'pending');
}

/** Liquida todo lo pendiente del vendedor en un solo pago. */
async function payOut(referrerId, { by = '', note = '' } = {}) {
  const referrer = await refDb.GetReferrerById(referrerId);
  if (!referrer) throw new ReferralError(404, 'Vendedor no encontrado.');
  const payoutId = new ObjectId();
  const paidAt = new Date();
  const paid = await refDb.MarkPendingPaid(referrer.id, payoutId, paidAt);
  if (!paid.length) throw new ReferralError(409, 'No hay comisiones pendientes por pagar.');
  const total = tiers.round2(paid.reduce((sum, c) => sum + Number(c.commission || 0), 0));
  return refDb.CreatePayout({
    _id: payoutId,
    referrerId: referrer.id,
    total,
    count: paid.length,
    commissionIds: paid.map((c) => c.id),
    paidAt,
    by: cleanText(by, 60),
    note: cleanText(note, 200),
  });
}

/** Datos mínimos del vendedor de una tienda (para la ficha del cliente). */
async function brief(id) {
  if (!id) return null;
  const r = await refDb.GetReferrerById(id);
  return r ? { id: r.id, name: r.name, code: r.code, status: r.status } : null;
}

// ───────── Resúmenes ─────────
function emptyMoney() {
  return { pending: 0, paid: 0, pendingCount: 0, paidCount: 0 };
}

function summarize(referrer, { tenants = [], sums = [], closed = 0 }) {
  const money = emptyMoney();
  for (const s of sums) {
    if (s.referrerId !== referrer.id) continue;
    if (s.status === 'pending') Object.assign(money, { pending: tiers.round2(s.total), pendingCount: s.count });
    if (s.status === 'paid') Object.assign(money, { paid: tiers.round2(s.total), paidCount: s.count });
  }
  return {
    id: referrer.id,
    name: referrer.name,
    email: referrer.email,
    phone: referrer.phone || '',
    state: referrer.state || '',
    city: referrer.city || '',
    notes: referrer.notes || '',
    payoutHolder: referrer.payoutHolder || '',
    payoutBank: referrer.payoutBank || '',
    payoutClabe: referrer.payoutClabe || '',
    payoutMpEmail: referrer.payoutMpEmail || '',
    code: referrer.code,
    status: referrer.status,
    source: referrer.source || 'admin',
    createdAt: referrer.createdAt,
    clients: tenants.length,
    activeClients: tenants.filter((t) => t.billingStatus === 'active').length,
    trialClients: tenants.filter((t) => (t.billingStatus || 'trialing') === 'trialing').length,
    closedSales: closed,
    rate: tiers.rateFor(closed),
    tier: tiers.tierIndexFor(closed),
    next: tiers.nextTierFor(closed),
    ...money,
    earned: tiers.round2(money.pending + money.paid),
  };
}

async function listSummaries() {
  const [referrers, referred, sums] = await Promise.all([refDb.ListReferrers(), refDb.ListReferredTenants(), refDb.SumCommissions()]);
  const out = [];
  for (const r of referrers) {
    const tenants = referred.filter((t) => t.referrerId === r.id);
    out.push(summarize(r, { tenants, sums, closed: await refDb.CountClosedTenants(r.id) }));
  }
  return out;
}

async function detail(id) {
  const referrer = await refDb.GetReferrerById(id);
  if (!referrer) throw new ReferralError(404, 'Vendedor no encontrado.');
  const [tenants, sums, closed, commissions, payouts] = await Promise.all([
    refDb.ListTenantsByReferrer(referrer.id),
    refDb.SumCommissions(),
    refDb.CountClosedTenants(referrer.id),
    refDb.ListCommissions({ referrerId: referrer.id, limit: 200 }),
    refDb.ListPayouts(referrer.id),
  ]);
  const paidByTenant = new Map();
  for (const c of commissions) {
    if (c.status === 'void') continue;
    paidByTenant.set(c.tenantId, tiers.round2((paidByTenant.get(c.tenantId) || 0) + c.amount));
  }
  return {
    ...summarize(referrer, { tenants, sums, closed }),
    ladder: tiers.LADDER,
    clientsList: tenants.map((t) => ({
      id: t.id,
      businessName: t.name,
      plan: t.plan,
      billingStatus: t.billingStatus || 'trialing',
      referredAt: t.referredAt || t.createdAt,
      createdAt: t.createdAt,
      billed: paidByTenant.get(t.id) || 0,
    })),
    commissions,
    payouts,
  };
}

module.exports = {
  ReferralError,
  normalizeCode,
  CODE_RE,
  createReferrer,
  updateReferrer,
  findActiveByCode,
  resolveForSignup,
  referralFields,
  recordPayment,
  brief,
  voidCommission,
  payOut,
  listSummaries,
  detail,
};
