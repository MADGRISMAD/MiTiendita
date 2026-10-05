process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');

const orders = [];
const consumed = [];
const dbStub = {
  async GetOrderByClientSaleId(id) {
    return orders.find((o) => o.clientSaleId === id) || null;
  },
  async CreateOrder(o) {
    const row = { ...o, id: `o${orders.length + 1}`, paymentStatus: 'pending' };
    orders.push(row);
    return row;
  },
  async DeleteOrder(id) {
    orders.splice(orders.findIndex((o) => o.id === id), 1);
  },
  async GetOpenCashSession() {
    return { id: 'cs1' };
  },
  async GetSettings() {
    return { inventoryEnabled: false };
  },
  async GetFoodById() {
    return { cost: 5 };
  },
  async UpdateOrder(id, patch) {
    return Object.assign(orders.find((o) => o.id === id), patch);
  },
};
const mongoPath = require.resolve('../database/mongodb');
require.cache[mongoPath] = { id: mongoPath, filename: mongoPath, loaded: true, exports: dbStub };

const chargesPath = require.resolve('../services/point.charges.service');
require.cache[chargesPath] = {
  id: chargesPath,
  filename: chargesPath,
  loaded: true,
  exports: {
    async consumeCharge(tenantId, chargeId, { clientSaleId, total }) {
      consumed.push({ tenantId, chargeId, clientSaleId, total });
      if (chargeId === 'bad') {
        const e = new Error('El total de la venta no coincide con lo cobrado en la terminal');
        e.status = 409;
        throw e;
      }
      return { id: chargeId };
    },
  },
};

const { sale } = require('../controllers/orders.controller');

async function post(body) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  await sale({ tenantId: 't1', body }, res);
  return res;
}
const base = (extra) => ({
  clientSaleId: `venta-${Math.random().toString(36).slice(2, 10)}`,
  items: [{ foodId: 'f1', name: 'Coca', price: 100, quantity: 1 }],
  taxRate: 0,
  ...extra,
});

test('pago mixto: la terminal cobra solo la parte de tarjeta', async () => {
  consumed.length = 0;
  const r = await post(base({ paymentMethod: 'split', cardAmount: 60, cashReceived: 40, pointChargeId: 'c1' }));
  assert.equal(r.code, 200, String(r.body));
  assert.equal(consumed[0].total, 60);
  assert.equal(r.body.pointChargeId, 'c1');
});

test('tarjeta completa: la terminal cobra el total', async () => {
  consumed.length = 0;
  const r = await post(base({ paymentMethod: 'card', pointChargeId: 'c2' }));
  assert.equal(r.code, 200);
  assert.equal(consumed[0].total, 100);
});

test('un cobro de terminal con efectivo se rechaza y no deja pedido huérfano', async () => {
  const before = orders.length;
  const r = await post(base({ paymentMethod: 'cash', cashReceived: 100, pointChargeId: 'c3' }));
  assert.equal(r.code, 400);
  assert.equal(orders.length, before);
});

test('mixto sin parte de tarjeta válida se rechaza', async () => {
  for (const cardAmount of [0, 100, 150]) {
    const r = await post(base({ paymentMethod: 'split', cardAmount, cashReceived: 100, pointChargeId: 'c4' }));
    assert.equal(r.code, 400, `cardAmount ${cardAmount}`);
  }
});

test('si el monto cobrado no coincide, la venta no se registra', async () => {
  const before = orders.length;
  const r = await post(base({ paymentMethod: 'split', cardAmount: 60, cashReceived: 40, pointChargeId: 'bad' }));
  assert.equal(r.code, 409);
  assert.equal(orders.length, before);
});
