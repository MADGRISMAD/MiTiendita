const test = require('node:test');
const assert = require('node:assert/strict');
const recode = require('../services/catalog-recode.service');
const { sameProduct } = require('../services/product-signature');

const item = (key, name, presentation, code, extra = {}) => ({ catalog: 'abarrotes', key, section: 'S', name, presentation, code, unit: 'pz', plu: false, verified: false, ...extra });
const food = (id, name, barcode, extra = {}) => ({ id, name, barcode, sku: barcode, tenantId: 'chona', ...extra });

function fakeDb(items, foods) {
  return {
    items,
    async ListCatalogItems(c) { return items.filter((i) => i.catalog === c); },
    async GetCatalogItem(c, key) { return items.find((i) => i.catalog === c && i.key === String(key)) || null; },
    async UpsertCatalogItem(c, key, data) { const row = items.find((i) => i.catalog === c && i.key === String(key)); return Object.assign(row, data); },
    async GetFoods() { return foods; },
  };
}

test('mismo producto: tolera más o menos texto y otro orden, pero no mezcla variantes, medidas ni marcas', () => {
  assert.equal(sameProduct('Queso Panela Lala 200 gr', 'QUESO PANELA LALA 200 GR.'), true);
  assert.equal(sameProduct('Emperador Chocolate 109 g', 'GALLETA EMPERADOR CHOCOLATE GAMESA 109 GR'), true);
  assert.equal(sameProduct('Pan Blanco Chico Bimbo 360 g', 'PAN BIMBO BLANCO CHICO 360 GR'), true);
  assert.equal(sameProduct('Coca-Cola 600 ml', 'REFRESCO COCA COLA LIGHT 600 ML'), false, 'light es otra variante');
  assert.equal(sameProduct('Cheetos Torciditos 240 g', 'CHEETOS TORCIDITOS 145GR'), false, 'otra presentación');
  assert.equal(sameProduct('Papas Sabritas Limón 170 g', 'PAPAS LIMON BARCEL 170GR'), false, 'otra marca');
  assert.equal(sameProduct('Chips Barcel Fuego 170 g', 'PAPAS CHIPS FUEGO BARCEL 170 GR'), false, 'palabra de más que distingue');
});

const base = () => ({
  items: [
    item('1', 'Queso Panela Lala', '200 gr', '7501020501202'), // mismo producto que el de la tienda → recibe el código de la tienda
    item('2', 'Queso Oaxaca Lala', '200 gr', '7501020512571'), // ya trae un código de la tienda → no cambia
    item('3', 'Galletas Marías', '170 g', '7501000111117'), // sin pareja en la tienda → se le quita el código
    item('4', 'Jitomate', '', 'PLU-3001', { plu: true }), // PLU: no es código de barras
    item('5', 'Producto sin código', '', ''),
    item('6', 'Cheetos Torciditos', '240 g', '7501011103014'), // la tienda solo tiene otra presentación → sin pareja
  ],
  foods: [
    food('f1', 'QUESO PANELA LALA 200 GR.', '7501020512304'),
    food('f2', 'QUESO OAXACA LALA 200 GR.', '7501020512571'),
    food('f3', 'CHEETOS TORCIDITOS 145GR', '7501011130975'),
    food('f4', 'ALGO SIN CODIGO', ''),
  ],
});

test('vista previa: cuenta lo que cambiaría y no toca nada', async () => {
  const { items, foods } = base();
  const db = fakeDb(items, foods);
  const p = await recode.preview(db, 'abarrotes', 'chona');
  assert.deepEqual([p.counts.recode, p.counts.same, p.counts.clear, p.counts.kept], [1, 1, 2, 1]);
  assert.deepEqual(p.recode.map((c) => [c.key, c.from, c.to]), [['1', '7501020501202', '7501020512304']]);
  assert.deepEqual(p.clear.map((c) => c.key).sort(), ['3', '6']);
  assert.equal(items[0].code, '7501020501202', 'la vista previa no cambia nada');
});

test('aplicar: pone el código de la tienda, quita el resto (menos PLU y claves propias) y deja el que ya coincide', async () => {
  const { items, foods } = base();
  const db = fakeDb(items, foods);
  const r = await recode.apply(db, 'abarrotes', 'chona');
  assert.deepEqual([r.recoded, r.cleared, r.errors.length], [1, 2, 0]);
  const code = (k) => items.find((i) => i.key === k).code;
  assert.deepEqual(['1', '2', '3', '4', '5', '6'].map(code), ['7501020512304', '7501020512571', '', 'PLU-3001', '', '']);
  assert.equal(items.find((i) => i.key === '1').key, '1', 'la identidad del producto no cambia');
});

test('sin quitar los demás: solo reemplaza los que tienen pareja en la tienda', async () => {
  const { items, foods } = base();
  const db = fakeDb(items, foods);
  const r = await recode.apply(db, 'abarrotes', 'chona', { clearOthers: false });
  assert.deepEqual([r.recoded, r.cleared], [1, 0]);
  assert.equal(items.find((i) => i.key === '3').code, '7501000111117');
});

test('estricto: dos del maestro para el mismo de la tienda, o un código que ya usa otro, no se tocan', async () => {
  const items = [
    item('a', 'Queso Panela Lala', '200 g', '7501020501202'),
    item('b', 'Queso Panela Lala', '200 gr', '7501020999991'), // repetido de «a»: los dos dicen ser el mismo de la tienda → ambiguo
    item('c', 'Leche Nito', '236 ml', '7501000188017'),
    item('d', 'Otro producto', '', '7501030418412'), // ya usa el código que la tienda le da a «c»
  ];
  const foods = [food('f1', 'QUESO PANELA LALA 200 GR', '7501020512304'), food('f2', 'LECHE NITO BIMBO 236ML.', '7501030418412')];
  const { counts, changes } = await recode.plan(fakeDb(items, foods), 'abarrotes', 'chona', { clearOthers: false });
  assert.deepEqual([counts.ambiguous, counts.conflict, counts.recode], [2, 1, 0]);
  assert.deepEqual(changes, []);
});

test('errores claros: catálogo inexistente, sin tienda o tienda sin códigos', async () => {
  const db = fakeDb([], [food('f', 'X', '')]);
  await assert.rejects(recode.preview(db, 'nada', 'chona'), (e) => e.status === 404);
  await assert.rejects(recode.preview(db, 'abarrotes', ''), (e) => e.status === 400);
  await assert.rejects(recode.preview(db, 'abarrotes', 'chona'), (e) => e.status === 400);
});
