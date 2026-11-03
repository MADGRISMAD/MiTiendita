process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/cash-cuts.service');

function makeStore({ orders = [], abonos = [], users = ['ana', 'beto'] } = {}) {
  const cuts = [];
  return {
    orders, abonos, cuts,
    async cutsBySession(t, s) { return cuts.filter((c) => c.tenantId === t && c.sessionId === s); },
    async insertCut(c) { const x = { ...c, id: `c${cuts.length + 1}` }; cuts.push(x); return x; },
    async getCut(t, id) { return cuts.find((c) => c.id === id && c.tenantId === t) || null; },
    async updateCut(t, id, patch, from) {
      const c = cuts.find((x) => x.id === id && x.tenantId === t && (!from || x.status === from));
      return c ? Object.assign(c, patch) : null;
    },
    async pendingFor(t, u) { return cuts.filter((c) => c.tenantId === t && c.toUser === u && c.status === 'pending'); },
    async listCuts(t, f = {}) { return cuts.filter((c) => c.tenantId === t && (!f.status || c.status === f.status)); },
    async findUser(t, u) { return t === 't1' && users.includes(u) ? { username: u } : null; },
    async ordersBySession() { return orders; },
    async abonosBySession() { return abonos; },
  };
}
const sale = (total, at, user = 'ana') => ({ paymentStatus: 'paid', paymentMethod: 'cash', total, createdAt: new Date(at), user });
const session = { id: 's1', status: 'open', closedAt: null, registerId: 2, openingFloat: 500, cashRefunds: 0, openedAt: new Date('2026-01-01T08:00:00Z') };
const T = (h) => `2026-01-01T${h}:00:00Z`;

test('tramo 1: fondo + ventas, diferencia, y el tramo 2 arranca en lo contado', async () => {
  const st = makeStore({ orders: [sale(300, T('09:00'))] });
  const e = await svc.expectedSince(st, { tenantId: 't1', session });
  assert.equal(e.expected, 800);
  const cut = await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 790 });
  assert.equal(cut.status, 'pending');
  assert.equal(cut.difference, -10);
  assert.equal(cut.registerId, 2);
  st.orders.push(sale(100, new Date(Date.now() + 5000)));
  const e2 = await svc.expectedSince(st, { tenantId: 't1', session });
  assert.equal(e2.baseline, 790);
  assert.equal(e2.cash, 100);
  assert.equal(e2.expected, 890);
});

test('0 ventas y contado 0: diferencia = -fondo', async () => {
  const st = makeStore();
  const cut = await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 0 });
  assert.equal(cut.difference, -500);
});

test('abonos en efectivo suman solo los del tramo', async () => {
  const st = makeStore({ abonos: [{ type: 'payment', method: 'cash', amount: 50, createdAt: new Date(T('09:00')) }] });
  await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 550 });
  st.abonos.push({ type: 'payment', method: 'cash', amount: 20, createdAt: new Date(Date.now() + 5000) });
  const e = await svc.expectedSince(st, { tenantId: 't1', session });
  assert.equal(e.abonosCash, 20);
  assert.equal(e.expected, 570);
});

test('reembolsos en efectivo posteriores al corte se restan solo en el tramo siguiente', async () => {
  const st = makeStore();
  const s1 = { ...session, cashRefunds: 30 };
  const c1 = await svc.createCut(st, { tenantId: 't1', session: s1, fromUser: 'ana', toUser: 'beto', countedCash: 470 });
  assert.equal(c1.expectedCash, 470);
  assert.equal(c1.difference, 0);
  const s2 = { ...session, cashRefunds: 50 };
  const e = await svc.expectedSince(st, { tenantId: 't1', session: s2 });
  assert.equal(e.refunds, 20);
  assert.equal(e.expected, 450);
});

test('validaciones de createCut', async () => {
  const st = makeStore();
  const go = (toUser, extra = {}) => svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser, countedCash: 10, ...extra });
  await assert.rejects(go('ana'), { status: 400 });
  await assert.rejects(go('nadie'), { status: 400 });
  await assert.rejects(svc.createCut(st, { tenantId: 't2', session, fromUser: 'ana', toUser: 'beto', countedCash: 10 }), { status: 400 });
  await assert.rejects(go('beto', { session: null }), { status: 400 });
  await assert.rejects(go('beto', { countedCash: -1 }), { status: 400 });
});

test('confirmar: solo el receptor; igual -> confirmed; distinto -> disputed', async () => {
  const st = makeStore();
  const mk = () => svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 500 });
  const a = await mk();
  await assert.rejects(svc.confirmCut(st, { tenantId: 't1', cutId: a.id, user: 'ana' }), { status: 403 });
  const ok = await svc.confirmCut(st, { tenantId: 't1', cutId: a.id, user: 'beto' });
  assert.equal(ok.status, 'confirmed');
  assert.equal(ok.confirmedCash, 500);
  await assert.rejects(svc.confirmCut(st, { tenantId: 't1', cutId: a.id, user: 'beto' }), { status: 409 });
  const b = await mk();
  const d = await svc.confirmCut(st, { tenantId: 't1', cutId: b.id, user: 'beto', confirmedCash: 480 });
  assert.equal(d.status, 'disputed');
  assert.equal(d.confirmedCash, 480);
  assert.equal((await svc.pendingFor(st, 't1', 'beto')).length, 0);
});

test('el punto de partida es lo contado aunque esté en disputa', async () => {
  const st = makeStore();
  const c = await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 500 });
  await svc.confirmCut(st, { tenantId: 't1', cutId: c.id, user: 'beto', confirmedCash: 400 });
  assert.equal((await svc.expectedSince(st, { tenantId: 't1', session })).baseline, 500);
});

test('segmentsOf agrupa por cajero', () => {
  const rows = svc.segmentsOf([sale(100, T('09:00'), 'ana'), sale(50, T('10:00'), 'beto'), sale(25, T('11:00'), 'ana')], []);
  assert.deepEqual(rows.find((r) => r.user === 'ana'), { user: 'ana', cash: 125, card: 0, total: 125, count: 2 });
  assert.equal(rows.find((r) => r.user === 'beto').cash, 50);
});

test('anulación en la misma sesión tras el corte baja el tramo siguiente', async () => {
  const o = sale(100, T('09:00'));
  const st = makeStore({ orders: [o] });
  const c = await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 600 });
  assert.equal(c.expectedCash, 600);
  o.paymentStatus = 'refunded';
  const e = await svc.expectedSince(st, { tenantId: 't1', session });
  assert.equal(e.expected, 500);
});

test('devolución parcial en la misma sesión tras el corte baja el tramo siguiente', async () => {
  const o = sale(100, T('09:00'));
  const st = makeStore({ orders: [o] });
  await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 600 });
  o.total = 70;
  const e = await svc.expectedSince(st, { tenantId: 't1', session });
  assert.equal(e.expected, 570);
});

test('una venta con el mismo createdAt que el corte cuenta en un solo tramo', async () => {
  const st = makeStore({ orders: [sale(100, T('09:00'))] });
  const c = await svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 600 });
  st.orders.push(sale(40, c.createdAt));
  const e = await svc.expectedSince(st, { tenantId: 't1', session });
  assert.equal(e.cash, 40);
  assert.equal(e.expected, 640);
  assert.equal(c.expectedCash, 600);
});

test('createCut exige caja abierta y un monto numérico válido', async () => {
  const st = makeStore();
  const go = (extra) => svc.createCut(st, { tenantId: 't1', session, fromUser: 'ana', toUser: 'beto', countedCash: 10, ...extra });
  await assert.rejects(go({ session: { ...session, status: 'closed' } }), (e) => e.status === 400 && e.code === 'cash_closed');
  await assert.rejects(go({ session: { ...session, closedAt: new Date() } }), (e) => e.code === 'cash_closed');
  for (const bad of ['  ', true, null, NaN, -5, 'abc', undefined]) await assert.rejects(go({ countedCash: bad }), { status: 400 });
  assert.equal((await go({ countedCash: ' 12.5 ' })).countedCash, 12.5);
});
