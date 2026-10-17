const test = require('node:test');
const assert = require('node:assert/strict');
const { overlayMatrix } = require('../database/mongodb');
const { blockedByPlan } = require('../services/branch-plan');
const { isSubscriptionActive } = require('../models/tenant.model');

const future = new Date(Date.now() + 864e5 * 20);
const matrixOf = (plan, extra = {}) => ({ plan, billingStatus: 'active', currentPeriodEnd: future, ...extra });
const branch = { isBranch: true, createdAt: new Date(2026, 0, 1) };
const effective = (matrix, kids, mine) => overlayMatrix(mine, matrix, { overPlan: blockedByPlan(kids.map((k, i) => ({ ...k, id: String(i) })), matrix.plan).has(String(kids.indexOf(mine))) });

test('matriz con licencia sin sucursales (Básico, Crecimiento, Perpetua): todas sus sucursales quedan sin acceso', () => {
  for (const plan of ['basic', 'growth', 'perpetual']) {
    const mine = { ...branch };
    const eff = effective(matrixOf(plan), [mine], mine);
    assert.equal(isSubscriptionActive(eff), false, plan);
    assert.equal(eff.overPlan, true);
    assert.match(eff.suspendedReason, /ya no incluye esta sucursal/);
  }
});

test('matriz Pro: sus sucursales entran normal', () => {
  const mine = { ...branch };
  const eff = effective(matrixOf('pro'), [mine], mine);
  assert.equal(isSubscriptionActive(eff), true);
  assert.equal(eff.overPlan, false);
});

test('si la matriz pierde la suscripción, las sucursales también', () => {
  const mine = { ...branch };
  assert.equal(isSubscriptionActive(effective(matrixOf('pro', { billingStatus: 'suspended' }), [mine], mine)), false);
});

test('vuelve a Pro y la sucursal recupera el acceso sin tocar sus datos', () => {
  const mine = { ...branch, name: 'Centro' };
  assert.equal(isSubscriptionActive(effective(matrixOf('basic'), [mine], mine)), false);
  const back = effective(matrixOf('pro'), [mine], mine);
  assert.equal(isSubscriptionActive(back), true);
  assert.equal(back.name, 'Centro');
});
