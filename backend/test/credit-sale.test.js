process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');

/* ───── Base simulada: pedidos, caja y clientes ───── */
const orders = [];
const session = { id: 'cs1', cashRefunds: 0 };
let reserveFails = false;
const dbStub = {
  async GetOrderByClientSaleId(id) { return orders.find((o) => o.clientSaleId === id) || null; },
  async GetOrderById(id) { return orders.find((o) => o.id === id) || null; },
  async CreateOrder(o) { const row = { ...o, id: `o${orders.length + 1}`, paymentStatus: 'pending' }; orders.push(row); return row; },
  async DeleteOrder(id) { orders.splice(orders.findIndex((o) => o.id === id), 1); },
  async GetOpenCashSession() { return session; },
  async UpdateCashSession(_id, patch) { Object.assign(session, patch); },
  async GetSettings() { return { inventoryEnabled: true }; },
  async GetFoodById() { return { cost: 5 }; },
  async ReserveSaleStock() {
    if (reserveFails) { const e = new Error('Sin existencias de Coca'); e.status = 409; throw e; }
    return { shortages: [] };
  },
  async ConsumeSaleLots() { return []; },
  async RestoreSaleStock() {},
  async UpdateOrder(id, patch) { return Object.assign(orders.find((o) => o.id === id), patch); },
};
const mongoPath = require.resolve('../database/mongodb');
require.cache[mongoPath] = { id: mongoPath, filename: mongoPath, loaded: true, exports: dbStub };

/* Clientes y libro en memoria, con las mismas reglas atómicas que credit.db.js */
const customers = new Map([
  ['c1', { id: 'c1', name: 'Doña Ana', creditLimit: 500, balance: 0 }],
  ['c2', { id: 'c2', name: 'Pedro', creditLimit: 0, balance: 0 }],
]);
const entries = [];
const creditStub = {
  async getCustomer(_t, id) { return customers.get(id) ? { ...customers.get(id) } : null; },
  async addEntry(e) {
    if ((e.type === 'charge' || e.type === 'void') && entries.some((x) => x.orderId === e.orderId && x.type === e.type)) { const err = new Error('dup'); err.code = 11000; throw err; }
    entries.push({ ...e, createdAt: new Date() });
  },
  async removeEntry(_t, { orderId, type }) { const i = entries.findIndex((x) => x.orderId === orderId && x.type === type); if (i >= 0) entries.splice(i, 1); return i >= 0; },
  async incBalance(_t, id, delta, { enforceLimit = false, requireOwed = 0 } = {}) {
    const c = customers.get(id);
    if (!c) return null;
    if (enforceLimit && !(c.creditLimit > 0 && c.balance + delta <= c.creditLimit)) return null;
    if (requireOwed && !(c.balance + 0.0049 >= requireOwed)) return null;
    c.balance = Math.round((c.balance + delta) * 100) / 100;
    return { ...c };
  },
  async paymentsBySession() { return []; },
};
const creditPath = require.resolve('../database/credit.db');
require.cache[creditPath] = { id: creditPath, filename: creditPath, loaded: true, exports: creditStub };

const { sale, voidSale } = require('../controllers/orders.controller');

const reply = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
async function post(body) {
  const res = reply();
  await sale({ tenantId: 't1', user: { username: 'luis' }, body }, res);
  return res;
}
const base = (extra) => ({
  clientSaleId: `venta-${Math.random().toString(36).slice(2, 10)}`,
  items: [{ foodId: 'f1', name: 'Coca', price: 100, quantity: 2 }],
  taxRate: 0,
  ...extra,
});

test('fiar una venta: queda pagada al cliente, sube su saldo y no cuenta como efectivo', async () => {
  const r = await post(base({ paymentMethod: 'credit', customerId: 'c1' }));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.paymentMethod, 'credit');
  assert.equal(r.body.creditAmount, 200);
  assert.equal(r.body.downPayment, 0);
  assert.equal(r.body.creditCustomerName, 'Doña Ana');
  assert.equal(customers.get('c1').balance, 200);
});

test('fiado con anticipo: el anticipo es efectivo y el resto queda a deber', async () => {
  customers.get('c1').balance = 0;
  const r = await post(base({ paymentMethod: 'credit', customerId: 'c1', downPayment: 50 }));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.creditAmount, 150);
  assert.equal(r.body.downPayment, 50);
  assert.equal(customers.get('c1').balance, 150);
});

test('fiado sin cliente, con cliente inexistente o sin límite autorizado se rechaza y no deja pedido huérfano', async () => {
  const before = orders.length;
  const sinCliente = await post(base({ paymentMethod: 'credit' }));
  assert.equal(sinCliente.code, 400);
  const fantasma = await post(base({ paymentMethod: 'credit', customerId: 'zzz' }));
  assert.equal(fantasma.code, 404);
  const sinLimite = await post(base({ paymentMethod: 'credit', customerId: 'c2' }));
  assert.equal(sinLimite.code, 409);
  assert.match(sinLimite.body, /no tiene fiado autorizado/);
  assert.equal(orders.length, before);
});

test('fiado que rebasa el límite se rechaza con el motivo y no mueve el saldo', async () => {
  customers.get('c1').balance = 400;
  const before = orders.length;
  const r = await post(base({ paymentMethod: 'credit', customerId: 'c1' })); // 200 más → 600 > 500
  assert.equal(r.code, 409);
  assert.match(r.body, /debe \$400\.00 de un límite de \$500\.00/);
  assert.equal(customers.get('c1').balance, 400);
  assert.equal(orders.length, before);
});

test('fiado que no puede hacerse sin pagar todo: pagar todo como fiado se rechaza', async () => {
  customers.get('c1').balance = 0;
  const r = await post(base({ paymentMethod: 'credit', customerId: 'c1', downPayment: 200 }));
  assert.equal(r.code, 400);
  assert.match(r.body, /cóbralo como efectivo/);
  assert.equal(customers.get('c1').balance, 0);
});

test('si falla el descuento de existencias después de fiar, el cargo se deshace por completo', async () => {
  customers.get('c1').balance = 0;
  entries.length = 0;
  reserveFails = true;
  const r = await post(base({ paymentMethod: 'credit', customerId: 'c1' }));
  reserveFails = false;
  assert.equal(r.code, 409);
  assert.equal(customers.get('c1').balance, 0, 'el saldo no queda inflado');
  assert.equal(entries.length, 0, 'ni queda un cargo huérfano en el libro');
});

test('reenviar la misma venta fiada (venta offline o red inestable) no fía dos veces', async () => {
  customers.get('c1').balance = 0;
  const body = base({ paymentMethod: 'credit', customerId: 'c1' });
  await post(body);
  const again = await post(body);
  assert.equal(again.code, 200);
  assert.equal(customers.get('c1').balance, 200);
});

test('anular una venta fiada devuelve el saldo y reembolsa el anticipo si la caja es otra', async () => {
  customers.get('c1').balance = 0;
  const r = await post(base({ paymentMethod: 'credit', customerId: 'c1', downPayment: 40 }));
  assert.equal(customers.get('c1').balance, 160);
  session.cashRefunds = 0;
  const order = orders.find((o) => o.id === r.body.id);
  order.cashSessionId = 'otra-caja'; // la venta se hizo en un turno anterior
  const res = reply();
  await voidSale({ tenantId: 't1', params: { id: order.id }, user: { username: 'luis' } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(customers.get('c1').balance, 0, 'se cancela lo que debía');
  assert.equal(session.cashRefunds, 40, 'solo se devuelve en efectivo el anticipo, no lo fiado');
  assert.equal(res.body.paymentStatus, 'refunded');
  const again = reply();
  await voidSale({ tenantId: 't1', params: { id: order.id }, user: { username: 'luis' } }, again);
  assert.equal(again.code, 400, 'anular dos veces se rechaza');
  assert.equal(customers.get('c1').balance, 0);
});
