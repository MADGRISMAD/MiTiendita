const test = require('node:test');
const assert = require('node:assert/strict');
const { start, saleBody } = require('./helpers/money-harness');

const COKE = { foodId: '000000000000000000000a01', name: 'Coca', price: 20 };
const TWO = [{ number: 1 }, { number: 2 }];
const CUSTOMER = { id: 'c1', name: 'Doña Mari', balance: 100, creditLimit: 500 };

/** Encabezados de la computadora: qué caja es y qué navegador. */
const pc = (register, device) => ({ ...(register ? { 'x-register': String(register) } : {}), ...(device ? { 'x-device': device } : {}) });

const open = (w, h, float = 500) => w.call('POST', '/api/cash/session/open', { openingFloat: float }, h);
const sell = (w, h, items = [{ ...COKE, quantity: 1 }]) => w.call('POST', '/api/orders/sale', saleBody(items), h);
const close = (w, h, counted) => w.call('POST', '/api/cash/session/close', { countedCash: counted }, h);

test('candado por navegador: otro navegador no vende, no cierra ni reabre la caja; el que la abrió sí', async () => {
  const w = await start({ registers: TWO });
  try {
    const a = pc(1, 'A');
    const b = pc(1, 'B');
    assert.equal((await open(w, a)).status, 201);
    for (const r of [await sell(w, b), await close(w, b, 500), await open(w, b)]) {
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'register_in_use');
      assert.equal(r.body.openedBy, 'caja1');
    }
    const seen = await w.call('GET', '/api/cash/session', null, b);
    assert.equal(seen.status, 200, 'verla sí se puede');
    assert.equal(seen.body.open, true);
    assert.equal((await sell(w, a)).status, 200);
    assert.equal((await close(w, a, 520)).status, 200);
  } finally { await w.stop(); }
});

test('sin X-Device, una caja abierta por un navegador queda bloqueada (se trata como otro equipo)', async () => {
  const w = await start();
  try {
    assert.equal((await open(w, pc(null, 'A'))).status, 201);
    const r = await sell(w, {});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'register_in_use');
  } finally { await w.stop(); }
});

test('una sesión vieja sin deviceId ni registerId no se bloquea y es de la Caja 1', async () => {
  const w = await start({ registers: TWO });
  try {
    w.w.sessions.set('old', { id: 'old', tenantId: 'tenant1', status: 'open', openingFloat: 100, openedBy: 'dueño' });
    const r = await sell(w, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.cashSessionId, 'old');
    const again = await sell(w, pc(1, 'B'));
    assert.equal(again.body.cashSessionId, 'old', 'X-Register: 1 también la encuentra');
    const s = await w.call('GET', '/api/cash/session', null, {});
    assert.equal(s.body.session.id, 'old');
  } finally { await w.stop(); }
});

test('dos cajas abiertas a la vez: cada venta cae en el corte de su caja', async () => {
  const w = await start({ registers: TWO });
  try {
    const one = pc(1, 'A');
    const two = pc(2, 'B');
    const [s1, s2] = await Promise.all([open(w, one, 500), open(w, two, 300)]);
    assert.equal(s1.status, 201);
    assert.equal(s2.status, 201);
    assert.equal(s1.body.registerId, 1);
    assert.equal(s2.body.registerId, 2);
    assert.equal(s1.body.deviceId, 'A');
    assert.equal((await sell(w, one, [{ ...COKE, quantity: 2 }])).body.cashSessionId, s1.body.id);
    assert.equal((await sell(w, two, [{ ...COKE, quantity: 1 }])).body.cashSessionId, s2.body.id);
    const c1 = await close(w, one, 540);
    const c2 = await close(w, two, 320);
    assert.equal(c1.body.session.expectedCash, 540);
    assert.equal(c2.body.session.expectedCash, 320);
    assert.equal(c1.body.session.difference, 0);
    assert.equal(c2.body.session.difference, 0);
  } finally { await w.stop(); }
});

test('abrir una caja ya abierta (mismo navegador) devuelve 409 con quién la tiene', async () => {
  const w = await start();
  try {
    assert.equal((await open(w, pc(1, 'A'))).status, 201);
    const r = await open(w, pc(1, 'A'));
    assert.equal(r.status, 409);
    assert.equal(r.body.openedBy, 'caja1');
  } finally { await w.stop(); }
});

test('dos aperturas simultáneas de la misma caja: una gana y la otra recibe 409', async () => {
  const w = await start({ registers: TWO });
  try {
    const rs = await Promise.all([open(w, pc(2, 'A')), open(w, pc(2, 'A'))]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
    assert.equal(rs.find((r) => r.status === 409).body.openedBy, 'caja1');
    assert.equal([...w.w.sessions.values()].filter((s) => s.status === 'open').length, 1);
  } finally { await w.stop(); }
});

test('una caja que no existe: 409 register_unknown', async () => {
  const w = await start({ registers: TWO });
  try {
    for (const r of [await open(w, pc(9, 'A')), await sell(w, pc(3, 'A')), await w.call('GET', '/api/cash/session', null, pc(9, 'A'))]) {
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'register_unknown');
    }
  } finally { await w.stop(); }
});

test('sin encabezados funciona como la Caja 1', async () => {
  const w = await start();
  try {
    const s = await open(w, {});
    assert.equal(s.status, 201);
    assert.equal(s.body.registerId, 1);
    assert.equal(s.body.deviceId, null);
    assert.equal((await sell(w, {})).body.cashSessionId, s.body.id);
    assert.equal((await close(w, {}, 520)).status, 200);
  } finally { await w.stop(); }
});

test('venta en una caja sin sesión no toma la sesión de otra caja', async () => {
  const w = await start({ registers: TWO });
  try {
    assert.equal((await open(w, pc(1, 'A'))).status, 201);
    const r = await sell(w, pc(2, 'B'));
    assert.equal(r.status, 200);
    assert.equal(r.body.cashSessionId, null);
    const s = await w.call('GET', '/api/cash/session', null, pc(2, 'B'));
    assert.equal(s.body.open, false);
  } finally { await w.stop(); }
});

test('el abono en efectivo suma al corte de la caja que lo recibió', async () => {
  const w = await start({ registers: TWO, customers: [CUSTOMER] });
  try {
    const one = pc(1, 'A');
    const two = pc(2, 'B');
    await open(w, one, 500);
    await open(w, two, 300);
    const r = await w.call('POST', `/api/customers/${CUSTOMER.id}/payments`, { amount: 60, method: 'cash' }, two);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await close(w, one, 500)).body.session.expectedCash, 500);
    assert.equal((await close(w, two, 360)).body.session.expectedCash, 360);
  } finally { await w.stop(); }
});

test('abono desde otro navegador en una caja abierta: 409 register_in_use', async () => {
  const w = await start({ customers: [CUSTOMER] });
  try {
    await open(w, pc(1, 'A'));
    const r = await w.call('POST', `/api/customers/${CUSTOMER.id}/payments`, { amount: 60, method: 'cash' }, pc(1, 'B'));
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'register_in_use');
    assert.equal(w.w.customers.get(CUSTOMER.id).balance, 100);
  } finally { await w.stop(); }
});

test('devolución y anulación en efectivo de un turno cerrado: las descuenta la caja que las hizo', async () => {
  const w = await start({ registers: TWO });
  try {
    const one = pc(1, 'A');
    const two = pc(2, 'B');
    await open(w, one, 500);
    const a = (await sell(w, one, [{ ...COKE, quantity: 2 }])).body; // 40
    const b = (await sell(w, one, [{ ...COKE, quantity: 1 }])).body; // 20
    assert.equal((await close(w, one, 560)).status, 200);
    await open(w, one, 100);
    await open(w, two, 300);
    const ret = await w.call('POST', `/api/orders/${a.id}/return`, { lines: [{ index: 0, quantity: 1 }] }, two);
    assert.equal(ret.status, 200, JSON.stringify(ret.body));
    const voided = await w.call('PUT', `/api/orders/${b.id}/void`, { reason: 'error' }, two);
    assert.equal(voided.status, 200, JSON.stringify(voided.body));
    assert.equal((await close(w, one, 100)).body.session.expectedCash, 100, 'la Caja 1 no devolvió nada');
    assert.equal((await close(w, two, 260)).body.session.expectedCash, 260, '300 − 20 − 20');
  } finally { await w.stop(); }
});

test('devolver o anular efectivo de una venta de otra caja que sigue abierta: 409 y nada cambia', async () => {
  const w = await start({ registers: TWO });
  try {
    const one = pc(1, 'A');
    const two = pc(2, 'B');
    await open(w, one, 500);
    await open(w, two, 300);
    const a = (await sell(w, one, [{ ...COKE, quantity: 2 }])).body; // 40
    const ret = await w.call('POST', `/api/orders/${a.id}/return`, { lines: [{ index: 0, quantity: 1 }] }, two);
    assert.equal(ret.status, 409);
    assert.equal(ret.body.code, 'sale_register_open');
    const voided = await w.call('PUT', `/api/orders/${a.id}/void`, { reason: 'error' }, two);
    assert.equal(voided.status, 409);
    assert.equal(voided.body.code, 'sale_register_open');
    const order = w.w.orders.get(a.id);
    assert.equal(order.total, 40);
    assert.equal(order.paymentStatus, 'paid');
    const c1 = (await close(w, one, 540)).body.session;
    const c2 = (await close(w, two, 300)).body.session;
    assert.equal(c1.difference, 0);
    assert.equal(c2.difference, 0);
  } finally { await w.stop(); }
});

test('reintento de una venta ya cobrada desde otro navegador: 200 idempotente (no se pierde al sincronizar)', async () => {
  const w = await start();
  try {
    await open(w, pc(1, 'A'));
    const body = saleBody([{ ...COKE, quantity: 1 }]);
    const first = await w.call('POST', '/api/orders/sale', body, pc(1, 'A'));
    assert.equal(first.status, 200);
    const retry = await w.call('POST', '/api/orders/sale', body, pc(1, 'B'));
    assert.equal(retry.status, 200);
    assert.equal(retry.body.id, first.body.id);
    assert.equal(w.w.orders.size, 1);
    const other = await w.call('POST', '/api/orders/sale', saleBody([{ ...COKE, quantity: 1 }]), pc(1, 'B'));
    assert.equal(other.status, 409, 'una venta nueva desde otro navegador sigue bloqueada');
  } finally { await w.stop(); }
});

test('apertura simultánea que pasa los chequeos previos: el índice único deja entrar solo una', async () => {
  const w = await start({ registers: TWO });
  const db = require('../database/mongodb');
  const real = db.GetOpenCashSession;
  let calls = 0;
  // Las 4 primeras consultas (candado + chequeo previo de cada petición) no ven ninguna sesión abierta
  db.GetOpenCashSession = async (...args) => (++calls <= 4 ? null : real(...args));
  try {
    const rs = await Promise.all([open(w, pc(2, 'A')), open(w, pc(2, 'A'))]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
    assert.equal(calls, 5, 'la que perdió volvió a consultar tras el error de índice');
    assert.equal(rs.find((r) => r.status === 409).body.openedBy, 'caja1');
    assert.equal([...w.w.sessions.values()].filter((s) => s.status === 'open').length, 1);
  } finally { db.GetOpenCashSession = real; await w.stop(); }
});

test('caja fuera del plan con sesión abierta: no vende ni cobra, sí hace el corte y luego desaparece', async () => {
  const THREE = [{ number: 1 }, { number: 2 }, { number: 3 }];
  const w = await start({ registers: THREE, customers: [CUSTOMER] });
  try {
    const one = pc(1, 'A');
    const three = pc(3, 'C');
    assert.equal((await open(w, three, 200)).status, 201);
    const sold = (await sell(w, three)).body;
    const down = { ...three, 'x-plan': 'basic' };
    const blocked = [
      await sell(w, down),
      await w.call('PUT', `/api/orders/${sold.id}/pay`, { method: 'cash' }, down),
      await w.call('POST', `/api/orders/${sold.id}/return`, { lines: [{ index: 0, quantity: 1 }] }, down),
      await w.call('PUT', `/api/orders/${sold.id}/void`, { reason: 'error' }, down),
      await w.call('POST', '/api/customers/c1/payments', { amount: 10, method: 'cash' }, down),
    ];
    for (const r of blocked) {
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'register_over_plan');
      assert.equal(r.body.message, 'Tu plan ya no incluye esta caja. Haz su corte para cerrarla.');
    }
    assert.equal((await w.call('GET', '/api/cash/session', null, down)).body.open, true);
    const listed = await w.call('GET', '/api/registers', null, { ...one, 'x-plan': 'basic' });
    assert.deepEqual(listed.body.registers.map((r) => r.number), [1]);
    assert.equal((await close(w, down, 220)).status, 200);
    // ya cerrada y fuera del plan: no existe más
    assert.equal((await w.call('GET', '/api/cash/session', null, down)).status, 409);
    assert.equal((await sell(w, down)).body.code, 'register_unknown');
    // la caja 1 sigue vendiendo
    assert.equal((await open(w, { ...one, 'x-plan': 'basic' })).status, 201);
    assert.equal((await sell(w, { ...one, 'x-plan': 'basic' })).status, 200);
  } finally { await w.stop(); }
});
