const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeRemovedLines, removedLineEntry, voidEntry, MAX_LINES } = require('../services/sale-audit.service');

test('renglones quitados: se limpian, se descartan los vacíos y se topa la cantidad', () => {
  const lines = sanitizeRemovedLines([
    { name: ' Coca 600 ', foodId: 'a1', quantity: 2, price: 18, reason: 'cleared', at: '2026-10-14T10:00:00Z' },
    { name: '', quantity: 1, price: 5 },
    { name: 'Sin cantidad', quantity: 0, price: 5 },
    { name: 'Motivo raro', quantity: 1, price: 5, reason: 'hack' },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].name, 'Coca 600');
  assert.equal(lines[0].reason, 'cleared');
  assert.equal(lines[1].reason, 'removed');
  assert.deepEqual(sanitizeRemovedLines('no es lista'), []);
  assert.equal(sanitizeRemovedLines(Array.from({ length: 200 }, () => ({ name: 'x', quantity: 1 }))).length, MAX_LINES);
});

test('bitácora de un producto quitado: quién, qué y cuánto', () => {
  const [line] = sanitizeRemovedLines([{ name: 'Leche', foodId: 'f9', quantity: 3, price: 25, reason: 'removed' }]);
  const e = removedLineEntry({ tenantId: 't1', user: 'caja1', line, orderId: 'o7' });
  assert.equal(e.type, 'order_line_removed');
  assert.equal(e.user, 'caja1');
  assert.match(e.message, /3 × Leche \(\$75\.00\)/);
  assert.equal(e.meta.orderId, 'o7');
});

test('bitácora de una anulación: devolución vs cancelación, con motivo', () => {
  const order = { id: 'o1', folio: 12, total: 150, paymentMethod: 'cash', items: [{ name: 'Pan', quantity: 2, price: 75 }] };
  const dev = voidEntry({ tenantId: 't1', user: 'caja1', order, reason: 'Cliente se arrepintió', refunded: true });
  assert.equal(dev.type, 'sale_voided');
  assert.match(dev.message, /Devolución de la venta #12 por \$150\.00/);
  assert.equal(dev.meta.reason, 'Cliente se arrepintió');
  const can = voidEntry({ tenantId: 't1', user: 'caja1', order, refunded: false });
  assert.match(can.message, /Cancelación/);
});

test('cambio de precio y costo: solo lo que cambió, con antes y después', () => {
  const before = { id: 'f1', name: 'Coca 600', price: 18, cost: 12 };
  const e = require('../services/sale-audit.service').priceChangeEntries({ tenantId: 't1', user: 'dueño', before, after: { price: 20, cost: 12 } });
  assert.equal(e.length, 1);
  assert.equal(e[0].type, 'price_changed');
  assert.match(e[0].message, /Coca 600: \$18\.00 → \$20\.00/);
  assert.equal(e[0].meta.to, 20);
  const none = require('../services/sale-audit.service').priceChangeEntries({ tenantId: 't1', before, after: { name: 'otro', price: 18 } });
  assert.equal(none.length, 0);
});

test('bitácora de caja: apertura y corte con faltante/sobrante', () => {
  const { cashOpenEntry, cashCloseEntry } = require('../services/sale-audit.service');
  assert.match(cashOpenEntry({ tenantId: 't1', user: 'u', session: { id: 's1', openingFloat: 500 } }).message, /\$500\.00/);
  const falta = cashCloseEntry({ tenantId: 't1', user: 'u', session: { id: 's1', expectedCash: 1000, countedCash: 940, difference: -60 } });
  assert.match(falta.message, /faltante de \$60\.00/);
  assert.match(cashCloseEntry({ tenantId: 't1', user: 'u', session: { difference: 25 } }).message, /sobrante de \$25\.00/);
  assert.match(cashCloseEntry({ tenantId: 't1', user: 'u', session: { difference: 0 } }).message, /cuadró/);
});

test('descuento grande: se registra desde 20 %, debajo no', () => {
  const { bigDiscountEntry } = require('../services/sale-audit.service');
  assert.equal(bigDiscountEntry({ tenantId: 't1', user: 'u', order: { discountPercent: 10, total: 90 } }), null);
  const e = bigDiscountEntry({ tenantId: 't1', user: 'u', order: { id: 'o1', discountPercent: 25, total: 75, discountAmount: 25 } });
  assert.equal(e.type, 'discount_applied');
  assert.match(e.message, /25% en venta por \$75\.00/);
});

test('catálogo: alta, cambios de datos, baja con respaldo de lo que tenía y categorías', () => {
  const { foodCreatedEntry, foodChangeEntries, foodDeletedEntry, menuEntry } = require('../services/sale-audit.service');
  const created = foodCreatedEntry({ tenantId: 't1', user: 'dueño', food: { id: 'f1', name: 'Coca', price: 18, barcode: '750' } });
  assert.equal(created.type, 'product_created');
  assert.match(created.message, /Coca a \$18\.00/);

  const before = { id: 'f1', name: 'Coca', barcode: '750', saleUnit: 'pz', menuId: 'm1', priceIncludesTax: true };
  const changes = foodChangeEntries({ tenantId: 't1', user: 'dueño', before, after: { name: 'Coca 600', barcode: '750', saleUnit: 'pz', price: 20 } });
  assert.equal(changes.length, 1); // solo cambió el nombre; el precio tiene su propio registro
  assert.match(changes[0].message, /Nombre de Coca: «Coca» → «Coca 600»/);
  assert.equal(foodChangeEntries({ tenantId: 't1', before, after: { name: 'Coca' } }).length, 0);

  const del = foodDeletedEntry({ tenantId: 't1', user: 'dueño', food: { id: 'f1', name: 'Coca', price: 18, cost: 12, stock: 7, barcode: '750', menuId: 'm1' } });
  assert.equal(del.type, 'product_deleted');
  assert.match(del.message, /7 en existencia/);
  assert.deepEqual([del.meta.price, del.meta.cost, del.meta.stock, del.meta.barcode], [18, 12, 7, '750']);

  assert.equal(menuEntry({ tenantId: 't1', kind: 'created', menu: { id: 'm1', name: 'Bebidas' } }).type, 'category_created');
  assert.match(menuEntry({ tenantId: 't1', kind: 'renamed', menu: { id: 'm1', name: 'Refrescos' }, from: { id: 'm1', name: 'Bebidas' } }).message, /«Bebidas» → «Refrescos»/);
  assert.match(menuEntry({ tenantId: 't1', kind: 'deleted', menu: { id: 'm1', name: 'Bebidas' }, productCount: 12 }).message, /tenía 12 productos/);
});
