const test = require('node:test');
const assert = require('node:assert/strict');
const { start, saleBody } = require('./helpers/money-harness');

const COKE = { foodId: '000000000000000000000a01', name: 'Coca', price: 20 };
const BREAD = { foodId: '000000000000000000000a02', name: 'Pan', price: 10 };

async function openCash(w, float = 500) {
  const r = await w.call('POST', '/cash/open', { openingFloat: float });
  assert.equal(r.status, 201);
  return r.body;
}
async function sell(w, items, extra) {
  const r = await w.call('POST', '/orders/sale', saleBody(items, extra));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function closeCash(w, counted) {
  const r = await w.call('POST', '/cash/close', { countedCash: counted });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.session;
}

test('cobrar en efectivo y cerrar la caja: el corte cuadra', async () => {
  const w = await start();
  try {
    await openCash(w);
    const order = await sell(w, [{ ...COKE, quantity: 2 }]);
    assert.equal(order.paymentStatus, 'paid');
    assert.equal(order.total, 40);
    const s = await closeCash(w, 540);
    assert.equal(s.expectedCash, 540);
    assert.equal(s.difference, 0);
  } finally { await w.stop(); }
});

test('la misma venta enviada dos veces no se duplica', async () => {
  const w = await start();
  try {
    await openCash(w);
    const body = saleBody([{ ...COKE, quantity: 1 }], { clientSaleId: 'repetida-0001' });
    const a = await w.call('POST', '/orders/sale', body);
    const b = await w.call('POST', '/orders/sale', body);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.id, b.body.id);
    assert.equal(w.w.orders.size, 1);
  } finally { await w.stop(); }
});

test('sin existencias: 409, no queda venta a medias y el inventario no cambia', async () => {
  const w = await start({ inventory: true, foods: [{ id: COKE.foodId, name: 'Coca', stock: 1 }] });
  try {
    await openCash(w);
    const r = await w.call('POST', '/orders/sale', saleBody([{ ...COKE, quantity: 2 }]));
    assert.equal(r.status, 409);
    assert.equal(w.w.foods.get(COKE.foodId).stock, 1);
    assert.equal([...w.w.orders.values()].filter((o) => o.paymentStatus === 'paid').length, 0);
  } finally { await w.stop(); }
});

test('anular una venta cobrada regresa las existencias y queda en la bitácora', async () => {
  const w = await start({ inventory: true, foods: [{ id: COKE.foodId, name: 'Coca', stock: 5 }] });
  try {
    await openCash(w);
    const order = await sell(w, [{ ...COKE, quantity: 2 }]);
    assert.equal(w.w.foods.get(COKE.foodId).stock, 3);
    const r = await w.call('PUT', `/orders/${order.id}/void`, { reason: 'se arrepintió' });
    assert.equal(r.status, 200);
    assert.equal(w.w.foods.get(COKE.foodId).stock, 5);
    assert.ok(w.w.log.some((e) => e.type === 'sale_voided' && e.meta.reason === 'se arrepintió'));
  } finally { await w.stop(); }
});

test('devolución parcial en efectivo en el mismo turno: baja el total, regresa existencias y el corte cuadra', async () => {
  const w = await start({ inventory: true, foods: [{ id: COKE.foodId, name: 'Coca', stock: 5 }, { id: BREAD.foodId, name: 'Pan', stock: 5 }] });
  try {
    await openCash(w, 500);
    const order = await sell(w, [{ ...COKE, quantity: 2 }, { ...BREAD, quantity: 1 }]); // 50
    assert.equal(order.total, 50);
    const r = await w.call('POST', `/orders/${order.id}/return`, { lines: [{ index: 0, quantity: 1 }], reason: 'dañado' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.refund.amount, 20);
    assert.equal(r.body.refund.cash, 20);
    assert.equal(r.body.order.total, 30);
    assert.equal(r.body.order.originalTotal, 50);
    assert.equal(w.w.foods.get(COKE.foodId).stock, 4); // 5 − 2 + 1
    assert.ok(w.w.log.some((e) => e.type === 'order_partial_return'));
    const s = await closeCash(w, 530); // 500 + 30
    assert.equal(s.expectedCash, 530);
    assert.equal(s.difference, 0);
  } finally { await w.stop(); }
});

test('devolución marcada como merma no regresa al inventario', async () => {
  const w = await start({ inventory: true, foods: [{ id: COKE.foodId, name: 'Coca', stock: 5 }] });
  try {
    await openCash(w);
    const order = await sell(w, [{ ...COKE, quantity: 2 }]);
    await w.call('POST', `/orders/${order.id}/return`, { lines: [{ index: 0, quantity: 1, restock: false }] });
    assert.equal(w.w.foods.get(COKE.foodId).stock, 3); // 5 − 2, la devuelta se perdió
  } finally { await w.stop(); }
});

test('devolución parcial de una venta de otro turno: la descuenta el corte de hoy', async () => {
  const w = await start();
  try {
    await openCash(w, 500);
    const order = await sell(w, [{ ...COKE, quantity: 2 }]);
    await closeCash(w, 540);
    await openCash(w, 100);
    const r = await w.call('POST', `/orders/${order.id}/return`, { lines: [{ index: 0, quantity: 1 }] });
    assert.equal(r.status, 200);
    const s = await closeCash(w, 80); // 100 − 20
    assert.equal(s.expectedCash, 80);
    assert.equal(s.difference, 0);
  } finally { await w.stop(); }
});

test('devolver efectivo sin caja abierta: 400 y la venta no cambia', async () => {
  const w = await start();
  try {
    await openCash(w);
    const order = await sell(w, [{ ...COKE, quantity: 2 }]);
    await closeCash(w, 540);
    const r = await w.call('POST', `/orders/${order.id}/return`, { lines: [{ index: 0, quantity: 1 }] });
    assert.equal(r.status, 400);
    assert.equal(w.w.orders.get(order.id).total, 40);
  } finally { await w.stop(); }
});

test('dos devoluciones simultáneas de lo mismo: solo una procede y nunca se reembolsa de más', async () => {
  const w = await start();
  try {
    await openCash(w);
    const order = await sell(w, [{ ...COKE, quantity: 2 }]); // 40
    const body = { lines: [{ index: 0, quantity: 2 }] };
    const [a, b] = await Promise.all([w.call('POST', `/orders/${order.id}/return`, body), w.call('POST', `/orders/${order.id}/return`, body)]);
    assert.equal([a.status, b.status].filter((s) => s === 200).length, 1);
    const final = w.w.orders.get(order.id);
    assert.equal(final.total, 0);
    assert.equal(final.returnedAmount, 40);
  } finally { await w.stop(); }
});

test('anular después de una devolución parcial regresa solo lo que sigue vendido', async () => {
  const w = await start({ inventory: true, foods: [{ id: COKE.foodId, name: 'Coca', stock: 5 }] });
  try {
    await openCash(w);
    const order = await sell(w, [{ ...COKE, quantity: 3 }]); // stock 2
    await w.call('POST', `/orders/${order.id}/return`, { lines: [{ index: 0, quantity: 1 }] }); // stock 3
    const r = await w.call('PUT', `/orders/${order.id}/void`, {});
    assert.equal(r.status, 200);
    assert.equal(w.w.foods.get(COKE.foodId).stock, 5); // 3 + las 2 que seguían vendidas
  } finally { await w.stop(); }
});

test('pago con tarjeta: la devolución se registra para hacerse fuera del sistema y no toca la caja', async () => {
  const w = await start();
  try {
    await openCash(w, 500);
    const order = await sell(w, [{ ...COKE, quantity: 2 }], { paymentMethod: 'card', cashReceived: undefined });
    const r = await w.call('POST', `/orders/${order.id}/return`, { lines: [{ index: 0, quantity: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.refund.cash, 0);
    assert.equal(r.body.refund.manual, 20);
    const s = await closeCash(w, 500);
    assert.equal(s.expectedCash, 500);
    assert.equal(s.expectedCard, 20);
  } finally { await w.stop(); }
});
