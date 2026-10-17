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

test('si cambia la presentación se conservan los dos y se avisa', () => {
  const out = flagRepeats([row('Sabritas', 1, { packs: 8 }), row('Sabritas', 2, { packs: 3, packSize: 12 })]);
  assert.equal(out.items.length, 2);
  assert.equal(out.repeats[0].counted, 'both');
});

test('el mismo renglón repetido en la misma foto se cuenta una vez', () => {
  const out = flagRepeats([row('Sabritas', 1), row('Sabritas', 1)]);
  assert.equal(out.items.length, 1);
  assert.equal(out.repeats[0].counted, 'once');
});

test('misma presentación con otra cantidad se suma en un solo renglón', () => {
  const out = flagRepeats([row('Coca Cola 600 ml', 1, { packs: 10 }), row('Coca Cola 600 ml', 1, { packs: 5 })]);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].packs, 15);
  assert.equal(out.repeats[0].counted, 'merged');
});

test('sin repetidos no avisa nada', () => {
  const out = flagRepeats([row('Sabritas', 1), row('Coca Cola 600 ml', 1), row('Jabón Zote', 1)]);
  assert.equal(out.items.length, 3);
  assert.deepEqual(out.repeats, []);
});

const gem = require('../services/gemini.service');
const inv = require('../services/magic-inventory.service');

test('"1 pet de 4" son 4 piezas y "2 pets de 6" son 12', () => {
  const a = gem.parseLooseLine('coca 3L 1 pet de 4');
  assert.deepEqual([a.name, a.packs, a.packSize], ['Coca Cola 3 L', 1, 4]);
  const b = gem.parseLooseLine('2 pets de 6 coca 2L');
  assert.deepEqual([b.name, b.packs, b.packSize], ['Coca Cola 2 L', 2, 6]);
  assert.equal(inv.enrichItem(b).stockIn, 12);
});

test('el importe del renglón manda sobre un costo mal leído', () => {
  // La IA puso el importe (300) en cost aunque son 3 pets: cada pet cuesta 100
  const e = inv.enrichItem({ name: 'Coca Cola 3 L pet', packs: 3, packSize: 4, cost: 300, lineTotal: 300 });
  assert.equal(e.lineCost, 100);
  assert.equal(e.cost, 25);
  assert.equal(e.cost * e.stockIn, 300);
  assert.equal(e.costFixed, true);
});

test('si cost y lineTotal cuadran no se toca nada', () => {
  const e = inv.enrichItem({ name: 'Sabritas', packs: 10, packSize: 1, cost: 12, lineTotal: 120 });
  assert.equal(e.cost, 12);
  assert.equal(e.costFixed, false);
});
