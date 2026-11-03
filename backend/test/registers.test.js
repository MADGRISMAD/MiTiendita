const test = require('node:test');
const assert = require('node:assert/strict');
const registers = require('../services/registers.service');
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
    assert.equal(err.message, 'El plan Crecimiento incluye 2 caja(s). Pasa a Pro para usar más.');
    return true;
  });
  assert.doesNotThrow(() => assertRegisterCount('pro', 4));
  assert.doesNotThrow(() => assertRegisterCount('growth', 2));
});

/** Base en memoria con la misma interfaz que database/registers.db.js. */
function fakeStore(rows = []) {
  let data = rows.map((r) => ({ ...r }));
  return {
    async ListRegisters() { return data.map((r) => ({ ...r })); },
    async ReplaceRegisters(_t, next) { data = next.map((r) => ({ ...r })); },
    get data() { return data; },
  };
}

test('tienda sin filas: solo Caja 1', async () => {
  const list = await registers.listRegisters(fakeStore(), 't1', 'growth');
  assert.equal(list.length, 1);
  assert.equal(list[0].number, 1);
  assert.equal(list[0].name, 'Caja 1');
  assert.equal(list[0].active, true);
});

test('plan basic no permite 2 cajas', async () => {
  await assert.rejects(registers.saveRegisters(fakeStore(), 't1', 'basic', { count: 2, names: [] }), (e) => e.payload?.code === 'PLAN_LIMIT');
});

test('growth crea 2 cajas con nombres por defecto', async () => {
  const store = fakeStore();
  const saved = await registers.saveRegisters(store, 't1', 'growth', { count: 2, names: [] });
  assert.deepEqual(saved.map((r) => r.name), ['Caja 1', 'Caja 2']);
  assert.equal(store.data.length, 2);
});

test('bajar a 1 caja desactiva la 2 sin borrar su terminal', async () => {
  const store = fakeStore();
  await registers.saveRegisters(store, 't1', 'growth', { count: 2, names: [] });
  store.data[1].terminalId = 'term-9';
  store.data[1].terminalLabel = 'Terminal 9';
  const saved = await registers.saveRegisters(store, 't1', 'growth', { count: 1, names: [] });
  assert.equal(saved.length, 1);
  const two = store.data.find((r) => r.number === 2);
  assert.equal(two.active, false);
  assert.equal(two.terminalId, 'term-9');
  // y al volver a 2 conserva la terminal
  await registers.saveRegisters(store, 't1', 'growth', { count: 2, names: [] });
  assert.equal(store.data.find((r) => r.number === 2).terminalId, 'term-9');
});

test('al bajar de plan, listRegisters oculta la caja 2 aunque siga activa', async () => {
  const store = fakeStore();
  await registers.saveRegisters(store, 't1', 'growth', { count: 2, names: [] });
  const list = await registers.listRegisters(store, 't1', 'basic');
  assert.deepEqual(list.map((r) => r.number), [1]);
  assert.equal(registers.isOverPlan(store.data[1], 'basic'), true);
  assert.equal(registers.isOverPlan(store.data[0], 'basic'), false);
});

test('nombre vacío usa «Caja N»; nombre largo se rechaza', async () => {
  const store = fakeStore();
  const saved = await registers.saveRegisters(store, 't1', 'growth', { count: 2, names: ['Mostrador', '  '] });
  assert.deepEqual(saved.map((r) => r.name), ['Mostrador', 'Caja 2']);
  await assert.rejects(registers.saveRegisters(store, 't1', 'growth', { count: 1, names: ['x'.repeat(31)] }), (e) => e.status === 400);
});

test('count inválido se rechaza', async () => {
  await assert.rejects(registers.saveRegisters(fakeStore(), 't1', 'pro', { count: 0, names: [] }), (e) => e.status === 400);
});
