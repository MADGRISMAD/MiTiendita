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
