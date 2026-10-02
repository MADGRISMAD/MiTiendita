const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartTotals, lineBreakdown } = require('../utils/tax');
const { normalizeOrder } = require('../models/order.model');
const { roundQty, saleUnitOf } = require('../utils/units');

let bulk;
test.before(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/bulk.js'), 'utf8');
  bulk = await import(`data:text/javascript,${encodeURIComponent(src)}`);
});

test('0.750 kg × $180.00/kg = $135.00', () => {
  const b = lineBreakdown(180, 0.75, true, 0.16);
  assert.equal(b.unitGross, 180);
  assert.equal(b.gross, 135);
  assert.equal(bulk.formatQtyUnit(0.75, 'kg'), '0.750 kg');
  assert.equal(bulk.perUnit('kg'), '/kg');
  assert.equal(bulk.perUnit('pz'), '');
});

test('$20 de jitomate a $28/kg: el peso más cercano sin pasarse en empate', () => {
  const q = bulk.qtyForAmount(20, 28, 'kg');
  assert.equal(q, 0.714);
  assert.equal(lineBreakdown(28, q, true, 0.16).gross, 19.99);
  // Importe exacto cuando se puede
  assert.equal(bulk.qtyForAmount(135, 180, 'kg'), 0.75);
  assert.equal(bulk.qtyForAmount(5, 0.2, 'g'), 25);
  assert.equal(bulk.qtyForAmount(0, 28, 'kg'), 0);
});

test('unidad de venta: pieza por omisión, granel con 3 decimales', () => {
  assert.equal(bulk.unitOf({}), 'pz');
  assert.equal(bulk.unitOf({ saleUnit: 'kg' }), 'kg');
  assert.equal(bulk.unitOf({ saleUnit: 'tonelada' }), 'pz');
  assert.equal(bulk.isBulk({ saleUnit: 'l' }), true);
  assert.equal(bulk.roundQty(0.12345, 'kg'), 0.123);
  assert.equal(bulk.roundQty(250.4, 'g'), 250);
  assert.equal(saleUnitOf('kg'), 'kg');
  assert.equal(saleUnitOf('x'), 'pz');
  assert.equal(roundQty('1.23456'), 1.235);
});

test('código de báscula: peso o importe embebido, con dígito verificador', () => {
  assert.deepEqual(bulk.parseScaleBarcode('2000123007502', 'weight'), { plu: '00123', grams: 750 });
  assert.deepEqual(bulk.parseScaleBarcode('2000123135007', 'price'), { plu: '00123', amount: 135 });
  assert.equal(bulk.parseScaleBarcode('2000123007503'), null, 'verificador malo');
  assert.equal(bulk.parseScaleBarcode('7501055300075'), null, 'EAN normal');
  assert.deepEqual(bulk.pluKeys('00123'), ['00123', '123']);
  assert.equal(bulk.qtyFromGrams(750, 'kg'), 0.75);
  assert.equal(bulk.qtyFromGrams(750, 'g'), 750);
});

test('el pedido guarda la unidad y cantidades con decimales; el total cuadra', () => {
  const order = normalizeOrder({
    items: [
      { foodId: 'a', name: 'Queso Oaxaca', price: 180, quantity: 0.7504, priceIncludesTax: true, saleUnit: 'kg' },
      { foodId: 'b', name: 'Coca 600', price: 18, quantity: 2, priceIncludesTax: true },
    ],
  });
  assert.equal(order.items[0].quantity, 0.75);
  assert.equal(order.items[0].saleUnit, 'kg');
  assert.equal(order.items[1].saleUnit, 'pz');
  assert.equal(order.total, 171);
  assert.equal(order.total, cartTotals(order.items).total);
});
