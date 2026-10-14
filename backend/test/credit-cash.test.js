process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
const test = require('node:test');
const assert = require('node:assert/strict');

let session = { id: 'cs1', openingFloat: 200, cashRefunds: 10 };
let closedPatch = null;
const orders = [
  { paymentStatus: 'paid', paymentMethod: 'cash', total: 100 },
  { paymentStatus: 'paid', paymentMethod: 'card', total: 50 },
  { paymentStatus: 'paid', paymentMethod: 'credit', total: 300, downPayment: 100, creditAmount: 200 }, // 100 en efectivo, 200 fiados
  { paymentStatus: 'paid', paymentMethod: 'credit', total: 80, downPayment: 0, creditAmount: 80 },
  { paymentStatus: 'refunded', paymentMethod: 'credit', total: 999, creditAmount: 999 }, // anulada: no cuenta
];
const abonos = [
  { type: 'payment', method: 'cash', amount: 60 },
  { type: 'payment', method: 'transfer', amount: 25 },
];
require.cache[require.resolve('../database/mongodb')] = {
  id: 'm', filename: 'm', loaded: true,
  exports: {
    async GetOpenCashSession() { return session; },
    async GetOrdersByCashSession() { return orders; },
    async UpdateCashSession(_id, patch) { closedPatch = patch; return { ...session, ...patch }; },
  },
};
require.cache[require.resolve('../database/credit.db')] = {
  id: 'c', filename: 'c', loaded: true,
  exports: { async paymentsBySession() { return abonos; } },
};
const cash = require('../controllers/cash.controller');
const reply = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });

test('el corte separa el fiado del dinero cobrado: solo el anticipo es efectivo', async () => {
  const res = reply();
  await cash.current({ tenantId: 't1' }, res);
  const t = res.body.totals;
  assert.equal(t.cash, 200, '100 de la venta en efectivo + 100 de anticipo');
  assert.equal(t.card, 50);
  assert.equal(t.credit, 280, '200 + 80 quedaron a deber');
  assert.equal(t.total, 530, 'el total vendido incluye lo fiado');
  assert.deepEqual(res.body.totals.abonos, { cash: 60, card: 0, transfer: 25, total: 85, count: 2 });
});

test('cerrar caja: el efectivo esperado suma los abonos en efectivo y resta devoluciones', async () => {
  const res = reply();
  await cash.close({ tenantId: 't1', user: { username: 'luis' }, body: { countedCash: 450 } }, res);
  // 200 de fondo + 200 de ventas en efectivo + 60 de abonos − 10 de devoluciones = 450
  assert.equal(closedPatch.expectedCash, 450);
  assert.equal(closedPatch.difference, 0);
  assert.equal(closedPatch.expectedCredit, 280);
  assert.equal(closedPatch.abonos.transfer, 25);
});
