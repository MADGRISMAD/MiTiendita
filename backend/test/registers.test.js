const test = require('node:test');
const assert = require('node:assert/strict');
const { registerLimitOf } = require('../services/plans.catalog');
const { assertRegisterCount } = require('../services/plan-limits.service');

test('registerLimitOf: cajas por plan', () => {
  assert.equal(registerLimitOf('basic'), 1);
  assert.equal(registerLimitOf('growth'), 2);
  assert.equal(registerLimitOf('pro'), 4);
  assert.equal(registerLimitOf('perpetual'), 1);
  assert.equal(registerLimitOf('x'), 1);
});

test('assertRegisterCount: lanza al pasar el límite', () => {
  assert.throws(() => assertRegisterCount('growth', 3), (err) => {
    assert.equal(err.payload.code, 'PLAN_LIMIT');
    assert.equal(err.payload.limit, 'registers');
    assert.equal(err.payload.max, 2);
    return true;
  });
  assert.doesNotThrow(() => assertRegisterCount('pro', 4));
});
