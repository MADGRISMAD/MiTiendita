const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizePriceRows, MAX_ROWS } = require('../services/bulk-prices.service');

const A = '64b7f0a1c2d3e4f5a6b7c8d9';
const B = '64b7f0a1c2d3e4f5a6b7c8da';

test('precios en lote: acepta precio y costo, redondea a centavos', () => {
  const { rows, rejected } = sanitizePriceRows([{ id: A, price: '18.504', cost: '12' }, { id: B, price: 25 }]);
  assert.deepEqual(rows, [{ id: A, price: 18.5, cost: 12 }, { id: B, price: 25 }]);
  assert.equal(rejected.length, 0);
});

test('precios en lote: rechaza precio 0, negativo, texto, ids inválidos y costo negativo', () => {
  const { rows, rejected } = sanitizePriceRows([
    { id: A, price: 0 },
    { id: B, price: -3 },
    { id: 'xyz', price: 10 },
    { id: A, price: 'abc' },
    { id: B, price: 10, cost: -1 },
  ]);
  assert.equal(rows.length, 0);
  assert.equal(rejected.length, 5);
});

test('precios en lote: un id repetido se queda con el último; tope por envío; entrada que no es lista', () => {
  assert.deepEqual(sanitizePriceRows([{ id: A, price: 10 }, { id: A, price: 12 }]).rows, [{ id: A, price: 12 }]);
  const many = Array.from({ length: MAX_ROWS + 50 }, () => ({ id: A, price: 1 }));
  assert.ok(sanitizePriceRows(many).rows.length <= 1);
  assert.deepEqual(sanitizePriceRows('no').rows, []);
});
