const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers/money-harness');

const TWO = [{ number: 1 }, { number: 2 }];
const admin = { 'x-role': 'admin', 'x-user': 'dueño' };
const cashier = { 'x-role': 'cashier' };

test('el cajero no puede configurar ni liberar cajas', async () => {
  const w = await start({ registers: TWO });
  try {
    assert.equal((await w.call('PUT', '/api/registers', { count: 2, names: [] }, cashier)).status, 403);
    assert.equal((await w.call('POST', '/api/registers/1/release', null, cashier)).status, 403);
    assert.equal((await w.call('GET', '/api/registers', null, cashier)).status, 200);
  } finally { await w.stop(); }
});

test('plan básico: pedir 2 cajas responde 403 PLAN_LIMIT', async () => {
  const w = await start();
  try {
    const r = await w.call('PUT', '/api/registers', { count: 2, names: [] }, { ...admin, 'x-plan': 'basic' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PLAN_LIMIT');
  } finally { await w.stop(); }
});

test('GET marca quién tiene abierta cada caja y PUT devuelve la lista nueva', async () => {
  const w = await start({ registers: TWO });
  try {
    await w.call('POST', '/api/cash/session/open', { openingFloat: 100 }, { ...cashier, 'x-register': '2', 'x-device': 'B', 'x-user': 'ana' });
    const r = await w.call('GET', '/api/registers', null, admin);
    assert.equal(r.status, 200);
    const [one, two] = r.body.registers;
    assert.equal(one.openBy, null);
    assert.equal(two.openBy, 'ana');
    assert.ok(two.sessionId);
    assert.equal(r.body.plan, 'pro');
    const put = await w.call('PUT', '/api/registers', { count: 2, names: ['Mostrador', 'Barra'] }, admin);
    assert.equal(put.status, 200);
    assert.deepEqual(put.body.registers.map((x) => x.name), ['Mostrador', 'Barra']);
  } finally { await w.stop(); }
});

test('liberar una caja abierta en otro equipo la cierra, lo anota y se puede reabrir', async () => {
  const w = await start({ registers: TWO });
  try {
    const dev = { ...cashier, 'x-register': '2', 'x-device': 'B', 'x-user': 'ana' };
    const opened = await w.call('POST', '/api/cash/session/open', { openingFloat: 100 }, dev);
    assert.equal(opened.status, 201);
    assert.equal((await w.call('POST', '/api/registers/9/release', null, admin)).status, 404);
    // El dueño libera desde otro navegador sin que lo frene el candado
    const rel = await w.call('POST', '/api/registers/2/release', null, { ...admin, 'x-register': '2', 'x-device': 'OWNER' });
    assert.equal(rel.status, 200);
    const s = w.w.sessions.get(opened.body.id);
    assert.equal(s.status, 'closed');
    assert.equal(s.closedBy, 'dueño');
    assert.equal(s.notes, 'Liberada por el dueño');
    assert.ok(w.w.log.some((l) => l.type === 'register_released' && l.user === 'dueño'));
    const again = await w.call('POST', '/api/cash/session/open', { openingFloat: 50 }, { ...cashier, 'x-register': '2', 'x-device': 'C' });
    assert.equal(again.status, 201);
  } finally { await w.stop(); }
});
