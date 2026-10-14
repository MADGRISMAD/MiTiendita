const test = require('node:test');
const assert = require('node:assert/strict');
const { planReturn, refundSplit, blockReason, allocationsToRestore } = require('../services/returns.service');
const { normalizeOrder } = require('../models/order.model');

/** Una venta real armada con el mismo código que la caja. */
function sale(extra = {}, items = [
  { name: 'Coca', price: 20, quantity: 3, priceIncludesTax: true, foodId: 'a' },
  { name: 'Pan', price: 10, quantity: 2, priceIncludesTax: true, foodId: 'b' },
], body = {}) {
  const o = normalizeOrder({ items, ...body });
  return { id: 'o1', ...o, paymentStatus: 'paid', paymentMethod: 'cash', ...extra };
}

test('devolver una pieza: reembolsa el precio con IVA de esa pieza', () => {
  const o = sale(); // 3×20 + 2×10 = 80
  assert.equal(o.total, 80);
  const p = planReturn(o, [{ index: 0, quantity: 1 }]);
  assert.equal(p.amount, 20);
  assert.equal(p.completes, false);
  assert.equal(p.lines[0].restock, true);
  assert.equal(p.tax, Number((20 - 20 / 1.16).toFixed(2)));
});

test('con descuento del ticket, la devolución lleva el mismo descuento', () => {
  const o = sale({}, undefined, { discountPercent: 10 }); // 80 - 8 = 72
  assert.equal(o.total, 72);
  assert.equal(planReturn(o, [{ index: 0, quantity: 1 }]).amount, 18);
});

test('devolver todo en partes suma exactamente el total cobrado (sin centavos de diferencia)', () => {
  let o = sale({}, [{ name: 'X', price: 3.33, quantity: 3, priceIncludesTax: true }], { discountPercent: 7 });
  const original = o.total;
  let refunded = 0;
  for (let i = 0; i < 3; i++) {
    const p = planReturn(o, [{ index: 0, quantity: 1 }]);
    refunded = Number((refunded + p.amount).toFixed(2));
    o = { ...o, total: Number((o.total - p.amount).toFixed(2)), tax: Number((o.tax - p.tax).toFixed(2)), returns: [...(o.returns || []), { lines: p.lines }] };
    assert.equal(p.completes, i === 2);
  }
  assert.equal(refunded, original);
  assert.equal(o.total, 0);
});

test('no se puede devolver más de lo vendido ni dos veces lo mismo', () => {
  const o = sale({ returns: [{ lines: [{ index: 0, quantity: 2 }] }] });
  assert.throws(() => planReturn(o, [{ index: 0, quantity: 2 }]), /solo quedan 1/);
  assert.throws(() => planReturn(o, [{ index: 0, quantity: 0 }]), /Indica cuántas/);
  assert.throws(() => planReturn(o, [{ index: 9, quantity: 1 }]), /inválido/);
  assert.throws(() => planReturn(o, [{ index: 1, quantity: 1 }, { index: 1, quantity: 1 }]), /dos veces/);
  assert.throws(() => planReturn(o, []), /Elige qué/);
});

test('granel: acepta fracciones de kilo', () => {
  const o = sale({}, [{ name: 'Tomate', price: 28, quantity: 1.5, priceIncludesTax: true, saleUnit: 'kg' }]); // 42
  const p = planReturn(o, [{ index: 0, quantity: 0.5 }]);
  assert.equal(p.amount, 14);
});

test('comisión de tarjeta: se devuelve en proporción', () => {
  const base = sale();
  const o = { ...base, paymentMethod: 'card', cardExtraTax: 8, total: 88 };
  const p = planReturn(o, [{ index: 1, quantity: 1 }]); // 10 de 80
  assert.equal(p.cardFee, 1);
  assert.equal(p.amount, 11);
});

test('no se permite: sin cobrar, fiado, terminal, facturada', () => {
  assert.ok(blockReason(sale({ paymentStatus: 'unpaid' })));
  assert.match(blockReason(sale({ paymentMethod: 'credit' })), /fiado/);
  assert.match(blockReason(sale({ pointChargeId: 'p1' })), /terminal/);
  assert.match(blockReason(sale({ invoice: { rfc: 'X' } })), /factura/);
  assert.equal(blockReason(sale()), null);
});

test('dinero: efectivo sale de la caja; tarjeta/transferencia se devuelve fuera; mixto se reparte', () => {
  assert.deepEqual(refundSplit(sale(), 20), { cash: 20, manual: 0, method: 'cash' });
  assert.deepEqual(refundSplit(sale({ paymentMethod: 'transfer' }), 20), { cash: 0, manual: 20, method: 'transfer' });
  const mixed = sale({ paymentMethod: 'split', cardAmount: 30 }); // 80 total: 50 efectivo + 30 tarjeta
  assert.deepEqual(refundSplit(mixed, 40), { cash: 25, manual: 15, method: 'split' });
});

test('lotes: regresa solo lo no regresado antes', () => {
  const item = { quantity: 5, lotAllocations: [{ lotId: 'L1', qty: 2 }, { lotId: 'L2', qty: 3 }] };
  assert.deepEqual(allocationsToRestore(item, 0, 3), [{ lotId: 'L1', qty: 2 }, { lotId: 'L2', qty: 1 }]);
  assert.deepEqual(allocationsToRestore(item, 3, 2), [{ lotId: 'L2', qty: 2 }]);
  assert.deepEqual(allocationsToRestore({ quantity: 2 }, 0, 2), []);
});
