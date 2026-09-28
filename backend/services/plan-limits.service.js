const { planLimits, getPlan } = require('./plans.catalog');
const db = require('../database/mongodb');

const PLAN_NAMES = { basic: 'Básico', growth: 'Crecimiento', pro: 'Pro', perpetual: 'Perpetua' };

function limitError(kind, used, max, plan) {
  const name = PLAN_NAMES[plan] || 'Básico';
  const next = plan === 'basic' ? 'Crecimiento' : 'Pro';
  const messages = {
    users: `El plan ${name} incluye ${max} usuario(s). Pasa a ${next} para invitar a más.`,
    products: `El plan ${name} admite ${max} productos. Pasa a ${next} para ampliar el catálogo.`,
  };
  const err = new Error(messages[kind] || 'Límite del plan alcanzado');
  err.status = 403;
  err.payload = {
    code: 'PLAN_LIMIT',
    limit: kind,
    used,
    max,
    plan,
    message: err.message,
  };
  return err;
}

async function usageFor(tenantId, planId) {
  const limits = planLimits(planId);
  const [users, pending, products] = await Promise.all([
    db.CountUsersByTenant(tenantId),
    db.CountPendingInvites(tenantId),
    db.CountFoods(tenantId),
  ]);
  return {
    users: { used: users, pending, max: limits.users },
    products: { used: products, max: limits.products },
  };
}

async function assertUserRoom(tenantId, planId, extra = 1, { includePending = false } = {}) {
  const limits = planLimits(planId);
  if (limits.users == null) return;
  const used = await db.CountUsersByTenant(tenantId);
  const pending = includePending ? await db.CountPendingInvites(tenantId) : 0;
  const taken = used + pending;
  if (taken + extra > limits.users) {
    throw limitError('users', taken, limits.users, planId);
  }
}

async function assertProductRoom(tenantId, planId, extra = 1) {
  const limits = planLimits(planId);
  if (limits.products == null) return;
  const used = await db.CountFoods(tenantId);
  if (used + extra > limits.products) {
    throw limitError('products', used, limits.products, planId);
  }
}

function sendLimit(res, err) {
  if (err?.payload?.code === 'PLAN_LIMIT') {
    return res.status(403).json(err.payload);
  }
  return null;
}

function planName(planId) {
  return getPlan(planId)?.name || PLAN_NAMES[planId] || planId;
}

module.exports = {
  usageFor,
  assertUserRoom,
  assertProductRoom,
  sendLimit,
  planName,
};
