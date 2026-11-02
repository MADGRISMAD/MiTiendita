const test = require('node:test');
const assert = require('node:assert/strict');
const dup = require('../services/duplicate-foods.service');

const food = (id, name, extra = {}) => ({ id, name, price: 15, cost: 10, stock: 0, barcode: '', ...extra });

test('encuentra el mismo producto con otras palabras y otro código de barras', () => {
  const pairs = dup.findPairs([
    food('1', 'Del Valle Durazno 237ml', { barcode: '7501055300075' }),
    food('2', 'Jugo Del Valle néctar durazno 237 ml', { barcode: '7501055300076' }),
    food('3', 'Coca-Cola 600 ml', { barcode: '7501055310111' }),
  ]);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a.id, pairs[0].b.id].sort(), ['1', '2']);
  assert.equal(pairs[0].reason, 'name');
});

test('no confunde variantes ni tamaños distintos, ni lo que ya marcaste como «no es duplicado»', () => {
  const foods = [
    food('1', 'Coca-Cola 600 ml'),
    food('2', 'Coca-Cola Zero 600 ml'),
    food('3', 'Coca-Cola 355 ml'),
    food('4', 'Sabritas Original 45 g'),
    food('5', 'Sabritas Adobadas 45 g'),
  ];
  assert.deepEqual(dup.findPairs(foods), []);
  const same = [food('7', 'Leche Lala 1 L'), food('8', 'Leche Lala Entera 1 L')];
  assert.equal(dup.findPairs(same).length, 1);
  assert.deepEqual(dup.findPairs([same[0], { ...same[1], notDupOf: ['7'] }]), []);
});

test('dos productos con el mismo código salen aunque se llamen distinto', () => {
  const pairs = dup.findPairs([food('1', 'Galletas Marías', { barcode: '7501000111111' }), food('2', 'Marias Gamesa', { sku: '07501000111111' })]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].reason, 'code');
});

test('marca si el código de barras es válido (dígito verificador) para saber cuál es el correcto', () => {
  const [p] = dup.findPairs([
    food('1', 'Del Valle Durazno 237ml', { barcode: '7501055300075' }),
    food('2', 'Jugo Del Valle néctar durazno 237 ml', { barcode: '7501055300071' }),
  ]);
  const byId = Object.fromEntries([p.a, p.b].map((s) => [s.id, s.codeStatus]));
  assert.equal(byId['1'], 'ok');
  assert.equal(byId['2'], 'digit');
});

function fakeDb(seed) {
  const foods = new Map(seed.map((f) => [f.id, { ...f }]));
  const calls = { lots: [], increments: [], deleted: [] };
  return {
    calls,
    foods,
    GetFoodById: async (id) => (foods.has(String(id)) ? { ...foods.get(String(id)) } : null),
    UpdateFood: async (id, patch) => Object.assign(foods.get(String(id)), patch),
    IncrementFoodStock: async (id, qty) => { foods.get(String(id)).stock += qty; calls.increments.push([id, qty]); },
    DeleteFood: async (id) => { foods.delete(String(id)); calls.deleted.push(String(id)); return { deletedCount: 1 }; },
    getCollection: () => ({ updateMany: async (f, u) => calls.lots.push([f.foodId, u.$set.foodId]) }),
  };
}

test('borrar el equivocado: se queda el correcto y, si lo pides, recibe las existencias y lotes', async () => {
  const db = fakeDb([food('1', 'A', { stock: 2, barcode: '111' }), food('2', 'A', { stock: 5, barcode: '222', tracksExpiry: true })]);
  const r = await dup.resolvePair(db, { tenantId: 't', action: 'delete', keepId: '1', removeId: '2', moveStock: true });
  assert.equal(r.movedStock, 5);
  assert.equal(db.foods.get('1').stock, 7);
  assert.equal(db.foods.get('1').tracksExpiry, true);
  assert.deepEqual(db.calls.lots, [['2', '1']]);
  assert.equal(db.foods.has('2'), false);
  // sin moveStock no se toca nada de existencias
  const db2 = fakeDb([food('1', 'A', { stock: 2 }), food('2', 'A', { stock: 5 })]);
  await dup.resolvePair(db2, { tenantId: 't', action: 'delete', keepId: '1', removeId: '2' });
  assert.equal(db2.foods.get('1').stock, 2);
  assert.deepEqual(db2.calls.lots, []);
});

test('mismo producto con dos códigos: el que se queda guarda los códigos del otro', async () => {
  const db = fakeDb([food('1', 'A', { barcode: '111', altCodes: ['999'] }), food('2', 'A', { barcode: '222', sku: '222', altCodes: ['333'] })]);
  const r = await dup.resolvePair(db, { tenantId: 't', action: 'keepCodes', keepId: '1', removeId: '2' });
  assert.deepEqual(db.foods.get('1').altCodes, ['999', '222', '333']);
  assert.deepEqual(r.codesAdded, ['222', '333']);
  assert.equal(db.foods.has('2'), false);
  // si el que se queda no tenía código, toma el del otro
  const db2 = fakeDb([food('1', 'A'), food('2', 'A', { barcode: '222' })]);
  await dup.resolvePair(db2, { tenantId: 't', action: 'keepCodes', keepId: '1', removeId: '2' });
  assert.equal(db2.foods.get('1').barcode, '222');
});

test('«no es duplicado» no borra nada y el par ya no vuelve a salir', async () => {
  const db = fakeDb([food('1', 'Leche Lala 1 L'), food('2', 'Leche Lala Entera 1 L')]);
  await dup.resolvePair(db, { tenantId: 't', action: 'notDuplicate', keepId: '1', removeId: '2' });
  assert.equal(db.foods.size, 2);
  assert.deepEqual(dup.findPairs([...db.foods.values()]), []);
});

test('rechaza acciones o productos que no sirven', async () => {
  const db = fakeDb([food('1', 'A')]);
  await assert.rejects(dup.resolvePair(db, { tenantId: 't', action: 'x', keepId: '1', removeId: '2' }), (e) => e.status === 400);
  await assert.rejects(dup.resolvePair(db, { tenantId: 't', action: 'delete', keepId: '1', removeId: '1' }), (e) => e.status === 400);
  await assert.rejects(dup.resolvePair(db, { tenantId: 't', action: 'delete', keepId: '1', removeId: '9' }), (e) => e.status === 404);
});
