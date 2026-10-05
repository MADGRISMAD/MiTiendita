/**
 * Promoción de lanzamiento (solo clientes NUEVOS, aparte de los 14 días de prueba):
 * los primeros 3 cobros MENSUALES a 1/3 del precio; después, precio normal.
 *
 * Estado en tenant.promo:
 *   pending → se contrató con promoción pero aún no hay un cobro
 *   active  → ya pagó al menos una vez a precio promocional
 *   ended   → ya se subió al precio normal (no se puede repetir)
 * El precio normal se pone al terminar el 3er cobro (aviso de Mercado Pago) o, si ese aviso no llega,
 * por tiempo: unos días después de la fecha del 3er cobro, antes del 4º.
 */
const db = require('../database/mongodb');
const mp = require('./mercadopago.service');
const { PROMO, promoPrice, PLANS, planPrice, isPerpetual } = require('./plans.catalog');

const DAY = 86400000;
const SAME_PAYMENT_MS = 7 * DAY;
const GRACE_DAYS = 2;

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** ¿Esta tienda puede contratar con promoción? Nueva, no la ha usado y plan mensual. */
function isEligible(tenant, plan, interval) {
  if (!tenant || tenant.promoEligible !== true) return false;
  if (tenant.promo && tenant.promo.state && tenant.promo.state !== 'pending') return false;
  if (interval !== 'month' || isPerpetual(tenant.plan)) return false;
  return PLANS.includes(plan);
}

/** Lo que paga hoy la tienda por mes (promoción vigente o precio normal). */
function currentMonthly(tenant) {
  if (tenant?.promo?.state === 'active' && tenant.promo.amount) return Number(tenant.promo.amount);
  return planPrice(tenant?.plan || 'basic', tenant?.billingInterval === 'year' ? 'year' : 'month');
}

/** Datos de la promoción para mostrar en pantalla. */
function describe(tenant) {
  const promo = tenant?.promo || null;
  const active = promo?.state === 'active';
  const paid = Number(promo?.paymentsDone) || 0;
  return {
    eligible: isEligible(tenant, tenant?.plan || 'basic', 'month'),
    months: PROMO.months,
    active,
    monthsLeft: active ? Math.max(0, PROMO.months - paid) : null,
    amount: active ? Number(promo.amount) : null,
    fullAmount: active ? Number(promo.fullAmount) : null,
    endsAt: active && promo.endsAt ? promo.endsAt : null,
    prices: Object.fromEntries(PLANS.map((id) => [id, { promo: promoPrice(id), full: planPrice(id, 'month') }])),
  };
}

/** Al crear la suscripción: deja anotados los términos para que el cobro y el fin sean consistentes. */
async function onCheckout(tenant, plan, interval) {
  if (!isEligible(tenant, plan, interval)) {
    if (tenant?.promo?.state === 'pending') await db.UpdateTenant(tenant.id, { promo: null });
    return null;
  }
  const promo = {
    state: 'pending',
    plan,
    amount: promoPrice(plan),
    fullAmount: planPrice(plan, 'month'),
    paymentsDone: 0,
    startedAt: null,
    endsAt: null,
    paidKeys: [],
  };
  await db.UpdateTenant(tenant.id, { promo });
  return promo;
}

async function endPromo(tenant) {
  const promo = tenant.promo;
  if (!promo || promo.state !== 'active') return null;
  if (tenant.mpPreapprovalId) {
    // Si Mercado Pago falla, se queda «active» y se reintenta en la siguiente revisión
    await mp.updatePreapprovalAmount(tenant.mpPreapprovalId, promo.fullAmount);
  }
  const next = { ...promo, state: 'ended', endedAt: new Date() };
  await db.UpdateTenant(tenant.id, { promo: next, promoEligible: false });
  await db
    .CreateBillingEvent({
      tenantId: tenant.id,
      type: 'promo_ended',
      plan: tenant.plan,
      interval: 'month',
      amount: promo.fullAmount,
      note: `Terminó la promoción: desde el siguiente cobro, $${promo.fullAmount} al mes`,
    })
    .catch(() => {});
  return next;
}

/**
 * Registra un cobro de la suscripción. `key` evita contarlo dos veces; la activación y el primer pago
 * avisado por Mercado Pago son el mismo dinero.
 * @returns el estado de la promoción después del cobro (o null si la tienda no tiene)
 */
async function onPayment(tenant, { key, source }) {
  const promo = tenant?.promo;
  if (!promo || !['pending', 'active'].includes(promo.state)) return null;
  const keys = Array.isArray(promo.paidKeys) ? promo.paidKeys : [];
  if (key && keys.includes(key)) return promo;

  const now = new Date();
  let next = { ...promo, paidKeys: [...keys, key].filter(Boolean).slice(-12) };
  const sameAsActivation =
    source === 'authorized_payment' &&
    promo.activationOnly &&
    promo.startedAt &&
    now.getTime() - new Date(promo.startedAt).getTime() < SAME_PAYMENT_MS;

  if (sameAsActivation) {
    next.activationOnly = false;
  } else {
    next.paymentsDone = (Number(promo.paymentsDone) || 0) + 1;
    if (next.paymentsDone === 1) {
      next.state = 'active';
      next.startedAt = now;
      next.endsAt = addMonths(now, PROMO.months - 1);
      next.endsAt.setDate(next.endsAt.getDate() + GRACE_DAYS);
      next.activationOnly = source === 'activation';
    }
  }
  await db.UpdateTenant(tenant.id, { promo: next });
  const updated = { ...tenant, promo: next };
  if (next.state === 'active' && next.paymentsDone >= PROMO.months) await endPromo(updated).catch((e) => console.warn('[promo]', e.message));
  return next;
}

/** Revisión por tiempo: si ya pasó la fecha del 3er cobro, sube al precio normal. */
async function sweepTenant(tenant) {
  const promo = tenant?.promo;
  if (!promo || promo.state !== 'active' || !promo.endsAt) return false;
  if (Date.now() < new Date(promo.endsAt).getTime()) return false;
  try {
    return Boolean(await endPromo(tenant));
  } catch (err) {
    console.warn('[promo] no se pudo terminar la promoción de', tenant.id, err.message);
    return false;
  }
}

async function sweepAll() {
  const tenants = await db.ListTenants();
  let ended = 0;
  for (const t of tenants) if (await sweepTenant(t)) ended += 1;
  return ended;
}

module.exports = { isEligible, currentMonthly, describe, onCheckout, onPayment, sweepTenant, sweepAll, endPromo };
