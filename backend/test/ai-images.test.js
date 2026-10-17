const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanImages } = require('../controllers/ai.controller');

const img = (n = 10) => ({ imageBase64: 'A'.repeat(n), mimeType: 'image/jpeg' });

test('acepta varias fotos de una misma nota', () => {
  assert.equal(cleanImages({ images: [img(), img(), img()] }).length, 3);
});

test('sigue aceptando la foto única de antes', () => {
  const out = cleanImages({ imageBase64: 'AAAA', mimeType: 'image/png' });
  assert.deepEqual(out, [{ imageBase64: 'AAAA', mimeType: 'image/png' }]);
});

test('sin fotos devuelve lista vacía', () => {
  assert.deepEqual(cleanImages({ text: 'hola' }), []);
});

test('rechaza más de 4 fotos y tipos no permitidos', () => {
  assert.throws(() => cleanImages({ images: [img(), img(), img(), img(), img()] }), /Máximo 4/);
  assert.throws(() => cleanImages({ images: [{ imageBase64: 'AAAA', mimeType: 'application/pdf' }] }), /JPG, PNG o WebP/);
});

test('rechaza si el total es demasiado pesado', () => {
  const big = () => img(4_000_000);
  assert.throws(() => cleanImages({ images: [big(), big(), big()] }), /pesan demasiado/);
});

const { flagRepeats } = require('../services/gemini.service');
const row = (name, photo, extra = {}) => ({ name, photo, packs: 1, packSize: 1, cost: 0, price: 0, ...extra });

test('un producto igual en dos fotos se cuenta una vez y se avisa', () => {
  const out = flagRepeats([row('Coca Cola 600 ml', 1, { packs: 15 }), row('Sabritas', 1), row('coca cola 600ml', 2, { packs: 15 })]);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.repeats, [{ name: 'Coca Cola 600 ml', photos: [1, 2], packs: [15, 15], counted: 'once' }]);
});

test('si cambia la cantidad se conservan los dos y se avisa', () => {
  const out = flagRepeats([row('Sabritas', 1, { packs: 8 }), row('Sabritas', 2, { packs: 3 })]);
  assert.equal(out.items.length, 2);
  assert.equal(out.repeats[0].counted, 'both');
});

test('el mismo producto en la misma foto no es repetido', () => {
  const out = flagRepeats([row('Sabritas', 1), row('Sabritas', 1)]);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.repeats, []);
});
