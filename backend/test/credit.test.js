const test = require('node:test');
const assert = require('node:assert/strict');
const credit = require('../services/credit.service');

/** Base en memoria con las mismas reglas atómicas que database/credit.db.js. */
function fakeStore(customers) {
  const cust = new Map(customers.map((c) => [c.id, { balance: 0, ...c }]));
  const entries = [];
  let n = 0;
  return {
    cust, entries,
    async getCustomer(_t, id) { return cust.get(id) ? { ...cust.get(id) } : null; },
    async addEntry(e) {
      if ((e.type === 'charge' || e.type === 'void') && entries.some((x) => x.orderId === e.orderId && x.type === e.type)) {
        const err = new Error('dup'); err.code = 11000; throw err;
      }
      const row = { id: `e${++n}`, createdAt: e.createdAt || new Date(2026, 0, n), ...e };
      entries.push(row);
      return row;
    },
    async removeEntry(_t, { orderId, type }) {
      const i = entries.findIndex((x) => x.orderId === orderId && x.type === type);
      if (i >= 0) entries.splice(i, 1);
      return i >= 0;
    },
    async incBalance(_t, id, delta, { enforceLimit = false, requireOwed = 0 } = {}) {
      const c = cust.get(id);
      if (!c) return null;
      if (enforceLimit && !(c.creditLimit > 0 && c.balance + delta <= c.creditLimit)) return null;
      if (requireOwed && !(c.balance + 0.0049 >= requireOwed)) return null;
      c.balance = Math.round((c.balance + delta) * 100) / 100;
      return { ...c };
    },
  };
}
const ana = () => ({ id: 'c1', name: 'Doña Ana', creditLimit: 500 });

test('repartir una venta: anticipo opcional, nunca todo el total', () => {
  assert.deepEqual(credit.splitSale(300), { credit: 300, down: 0 });
  assert.deepEqual(credit.splitSale(300, 100), { credit: 200, down: 100 });
  assert.throws(() => credit.splitSale(300, 300), (e) => e.code === 'down_payment_too_high');
  assert.throws(() => credit.splitSale(300, -5), /negativo/);
  assert.throws(() => credit.splitSale(0), /mayor a 0/);
  assert.deepEqual(credit.splitSale(10.1, 0.1), { credit: 10, down: 0.1 }, 'sin errores de punto flotante');
});

test('fiar: sube el saldo, deja un cargo en el libro y respeta el límite', async () => {
  const s = fakeStore([ana()]);
  const r = await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 200, user: 'luis' });
  assert.equal(r.balance, 200);
  assert.equal(s.entries[0].type, 'charge');
  assert.equal(s.entries[0].createdBy, 'luis');
  await assert.rejects(
    credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o2', amount: 301 }),
    (e) => e.code === 'limit_exceeded' && /debe \$200\.00 de un límite de \$500\.00.*solo puede llevar \$300\.00 más/.test(e.message)
  );
  assert.equal(s.cust.get('c1').balance, 200, 'una venta rechazada no mueve el saldo');
  assert.equal(s.entries.length, 1, 'ni deja cargos huérfanos');
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o3', amount: 300 });
  assert.equal(s.cust.get('c1').balance, 500, 'justo en el límite sí');
});

test('un cliente sin límite autorizado no puede llevarse fiado', async () => {
  const s = fakeStore([{ id: 'c2', name: 'Pedro', creditLimit: 0 }]);
  await assert.rejects(
    credit.chargeSale(s, { tenantId: 't', customer: { id: 'c2', name: 'Pedro', creditLimit: 0 }, orderId: 'o1', amount: 10 }),
    (e) => e.code === 'no_credit' && /no tiene fiado autorizado/.test(e.message)
  );
});

test('reintentar la misma venta (red inestable, venta offline) no fía dos veces', async () => {
  const s = fakeStore([ana()]);
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 150 });
  const again = await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 150 });
  assert.equal(again.duplicated, true);
  assert.equal(s.cust.get('c1').balance, 150);
  assert.equal(s.entries.length, 1);
});

test('abonar: baja el saldo, queda en la caja abierta y no acepta más de lo que debe', async () => {
  const s = fakeStore([ana()]);
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 200 });
  const r = await credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 80.5, method: 'cash', cashSessionId: 'caja1', user: 'luis' });
  assert.equal(r.balance, 119.5);
  assert.equal(r.entry.cashSessionId, 'caja1');
  await assert.rejects(credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 200, method: 'cash', cashSessionId: 'caja1' }), (e) => e.code === 'overpay' && /solo debe \$119\.50/.test(e.message));
  await assert.rejects(credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 10, method: 'cash', cashSessionId: null }), (e) => e.code === 'cash_closed');
  await assert.rejects(credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 0, method: 'cash', cashSessionId: 'x' }), /mayor a 0/);
  await assert.rejects(credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 5, method: 'bitcoin', cashSessionId: 'x' }), /inválida/);
  await credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 119.5, method: 'transfer', cashSessionId: 'caja1' });
  assert.equal(s.cust.get('c1').balance, 0);
  await assert.rejects(credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 1, method: 'cash', cashSessionId: 'x' }), (e) => e.code === 'no_balance');
});

test('dos abonos a la vez que juntos pasan el saldo: solo uno se acepta', async () => {
  const s = fakeStore([ana()]);
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 100 });
  const a = credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 80, method: 'cash', cashSessionId: 'x' });
  const b = credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 80, method: 'cash', cashSessionId: 'x' });
  const results = await Promise.allSettled([a, b]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(s.cust.get('c1').balance, 20);
});

test('anular una venta fiada devuelve el saldo, una sola vez', async () => {
  const s = fakeStore([ana()]);
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 200 });
  await credit.reverseSale(s, { tenantId: 't', customerId: 'c1', orderId: 'o1', amount: 200 });
  assert.equal(s.cust.get('c1').balance, 0);
  const again = await credit.reverseSale(s, { tenantId: 't', customerId: 'c1', orderId: 'o1', amount: 200 });
  assert.equal(again.duplicated, true);
  assert.equal(s.cust.get('c1').balance, 0);
});

test('anular una venta ya abonada deja saldo a favor del cliente (negativo), sin perder dinero', async () => {
  const s = fakeStore([ana()]);
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 200 });
  await credit.registerPayment(s, { tenantId: 't', customerId: 'c1', amount: 150, method: 'cash', cashSessionId: 'x' });
  await credit.reverseSale(s, { tenantId: 't', customerId: 'c1', orderId: 'o1', amount: 200 });
  assert.equal(s.cust.get('c1').balance, -150, 'le debemos los 150 que ya había abonado');
});

test('antigüedad: los abonos pagan primero lo más viejo', () => {
  const d = (m, day) => new Date(2026, m, day);
  const entries = [
    { type: 'charge', amount: 100, createdAt: d(0, 1) },
    { type: 'charge', amount: 100, createdAt: d(1, 1) },
    { type: 'payment', amount: 120, createdAt: d(1, 10) },
  ];
  const a = credit.agingOf(entries, d(1, 21));
  assert.equal(a.since.getTime(), d(1, 1).getTime(), 'el de enero ya quedó cubierto; el de febrero tiene 80 pendientes');
  assert.equal(a.days, 20);
  assert.deepEqual(credit.agingOf([{ type: 'charge', amount: 50, createdAt: d(0, 1) }, { type: 'payment', amount: 50, createdAt: d(0, 2) }], d(2, 1)), { since: null, days: 0 });
});

test('totales de abonos de una caja por forma de pago', () => {
  const t = credit.paymentTotals([
    { type: 'payment', method: 'cash', amount: 50.25 },
    { type: 'payment', method: 'cash', amount: 10 },
    { type: 'payment', method: 'card', amount: 20 },
    { type: 'charge', amount: 999 },
  ]);
  assert.deepEqual(t, { cash: 60.25, card: 20, transfer: 0, total: 80.25, count: 3 });
});

test('si la venta fiada falla después de cargarse, el cargo se deshace sin dejar rastro y se puede reintentar', async () => {
  const s = fakeStore([ana()]);
  await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 120 });
  await credit.undoCharge(s, { tenantId: 't', customerId: 'c1', orderId: 'o1', amount: 120 });
  assert.equal(s.cust.get('c1').balance, 0);
  assert.equal(s.entries.length, 0);
  const again = await credit.undoCharge(s, { tenantId: 't', customerId: 'c1', orderId: 'o1', amount: 120 });
  assert.equal(again.skipped, true, 'deshacer dos veces no resta de más');
  assert.equal(s.cust.get('c1').balance, 0);
  const retry = await credit.chargeSale(s, { tenantId: 't', customer: ana(), orderId: 'o1', amount: 120 });
  assert.equal(retry.balance, 120);
});
