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

test('liberar quita solo el candado: la sesión sigue abierta, se anota y otro equipo la retoma', async () => {
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
    assert.equal(s.status, 'open');
    assert.equal(s.deviceId, undefined);
    assert.ok(!s.closedBy);
    assert.ok(w.w.log.some((l) => l.type === 'register_released' && l.user === 'dueño'));
    // Una segunda liberación es inofensiva: la sesión sigue abierta y desbloqueada
    assert.equal((await w.call('POST', '/api/registers/2/release', null, admin)).status, 200);
    assert.equal(w.w.sessions.get(opened.body.id).status, 'open');
    // Otro equipo ya no choca con el candado y hace el cierre contado
    const closed = await w.call('POST', '/api/cash/session/close', { countedCash: 100 }, { ...cashier, 'x-register': '2', 'x-device': 'C' });
    assert.equal(closed.status, 200);
    assert.equal(w.w.sessions.get(opened.body.id).status, 'closed');
    // Cerrada: ya no hay nada que liberar
    assert.equal((await w.call('POST', '/api/registers/2/release', null, admin)).status, 404);
  } finally { await w.stop(); }
});

test('reducir cajas con una abierta por encima del nuevo total responde 409 register_open', async () => {
  const w = await start({ registers: TWO });
  try {
    await w.call('POST', '/api/cash/session/open', { openingFloat: 100 }, { ...cashier, 'x-register': '2', 'x-device': 'B', 'x-user': 'ana' });
    const r = await w.call('PUT', '/api/registers', { count: 1, names: [] }, admin);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'register_open');
    assert.match(r.body.message, /Caja 2 sigue abierta por ana/);
    // Con la caja 2 aún dentro del total sí se puede guardar
    assert.equal((await w.call('PUT', '/api/registers', { count: 2, names: [] }, admin)).status, 200);
    // Tras su corte ya se puede reducir
    await w.call('POST', '/api/cash/session/close', { countedCash: 100 }, { ...cashier, 'x-register': '2', 'x-device': 'B', 'x-user': 'ana' });
    assert.equal((await w.call('PUT', '/api/registers', { count: 1, names: [] }, admin)).status, 200);
  } finally { await w.stop(); }
});
