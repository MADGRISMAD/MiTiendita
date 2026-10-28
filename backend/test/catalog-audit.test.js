const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../services/catalog-audit.service');

const row = (key, name, code, extra = {}) => ({ catalog: 'abarrotes', key, section: 'S', name, presentation: '', code, unit: 'pz', plu: false, verified: false, ...extra });
const fakeDb = (items) => ({
  async ListCatalogItems(c) { return items.filter((i) => i.catalog === c); },
  async GetCatalogItem(c, key) { return items.find((i) => i.catalog === c && i.key === String(key)) || null; },
});

test('dígito verificador: EAN-13, EAN-8, UPC-A, longitud rara, claves propias y vacíos', () => {
  assert.equal(audit.gtinStatus('7501055300075'), 'ok');
  assert.equal(audit.gtinStatus('7501055300076'), 'digit');
  assert.equal(audit.gtinStatus('96385074'), 'ok'); // EAN-8
  assert.equal(audit.gtinStatus('036000291452'), 'ok'); // UPC-A
  assert.equal(audit.gtinStatus('75010554'), 'digit');
  assert.equal(audit.gtinStatus('123456789'), 'length');
  assert.equal(audit.gtinStatus('PLU-3001'), 'internal');
  assert.equal(audit.gtinStatus(''), 'missing');
});

test('revisión local: marca dígito malo, longitud, sin código y repetidos (aunque uno traiga ceros de más)', async () => {
  const db = fakeDb([
    row('a', 'Coca-Cola 600 ml', '7501055300075'),
    row('b', 'Coca-Cola repetida', '07501055300075'),
    row('c', 'Con dígito malo', '7501055300076'),
    row('d', 'Código corto', '12345'),
    row('e', 'Sin código', ''),
    row('f', 'Jitomate', 'PLU-3001', { plu: true }),
    row('g', 'Clave propia', 'MT-0001'),
    row('h', 'Bueno', '036000291452'),
  ]);
  const { counts, problems } = await audit.localReport(db, 'abarrotes');
  const by = Object.fromEntries(problems.map((p) => [p.key, p.issues]));
  assert.deepEqual(by, { a: ['duplicate'], b: ['duplicate'], c: ['digit'], d: ['length'], e: ['missing'] });
  assert.equal(counts.total, 8);
  assert.equal(counts.internal, 2);
  assert.deepEqual(problems.find((p) => p.key === 'a').sharedWith, ['Coca-Cola repetida']);
});

test('comparación de nombres: ignora acentos, medidas y palabras sueltas; detecta tamaño distinto', () => {
  assert.equal(audit.sameProduct('Coca-Cola Original 600 ml', 'Coca-Cola Refresco de cola 355 ml'), true);
  assert.equal(audit.sameProduct('Jabón Zote 400 g', 'Cable USB-C 1 m'), false);
  assert.equal(audit.sameProduct('Galletas Marías Gamesa', 'Gamesa Galletas Marias'), true);
  assert.equal(audit.sizeDiffers('Coca-Cola 600 ml', 'Coca-Cola 355 ml'), true);
  assert.equal(audit.sizeDiffers('Coca-Cola 600 ml', 'Coca-Cola'), false);
});

test('lista de productos a comparar en línea: solo con código válido, sin PLU y (si se pide) sin verificar', async () => {
  const db = fakeDb([row('a', 'A', '7501055300075'), row('b', 'B', '7501055300075', { verified: true }), row('c', 'C', '123'), row('d', 'D', 'PLU-1', { plu: true })]);
  assert.deepEqual(await audit.onlineKeys(db, 'abarrotes'), ['a']);
  assert.deepEqual(await audit.onlineKeys(db, 'abarrotes', { onlyUnverified: false }), ['a', 'b']);
});

test('comparación en línea: igual, distinto, no encontrado y sin servicio; no acepta tandas enormes', async () => {
  const lookup = require('../services/barcode-lookup.service');
  const realFetch = global.fetch;
  const db = fakeDb([
    row('a', 'Coca-Cola', '7501055300075', { presentation: '600 ml' }),
    row('b', 'Jabón Zote', '036000291452'),
    row('c', 'Algo raro', '96385074'),
    row('d', 'Sin servicio', '4006381333931'),
  ]);
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('openfoodfacts') && u.includes('7501055300075')) return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Coca-Cola Sabor Original', quantity: '355 ml' } }) };
    if (u.includes('openfoodfacts') && u.includes('036000291452')) return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Papel higiénico Kleenex' } }) };
    if (u.includes('4006381333931')) throw new Error('timeout');
    return { ok: false, status: 404, json: async () => ({ status: 0 }) };
  };
  try {
    lookup.clearCache();
    const { results } = await audit.checkOnline(db, 'abarrotes', ['a', 'b', 'c', 'd', 'zzz']);
    const by = Object.fromEntries(results.map((r) => [r.key, r]));
    assert.equal(by.a.status, 'same');
    assert.equal(by.a.sizeDiffers, true);
    assert.equal(by.b.status, 'different');
    assert.equal(by.b.online.name, 'Papel higiénico Kleenex');
    assert.equal(by.c.status, 'notfound');
    assert.equal(by.d.status, 'unavailable');
    assert.equal(by.zzz.status, 'skipped');
    await assert.rejects(audit.checkOnline(db, 'abarrotes', Array(9).fill('a')), (e) => e.status === 400);
    await assert.rejects(audit.localReport(db, 'nada'), (e) => e.status === 404);
  } finally {
    global.fetch = realFetch;
    lookup.clearCache();
  }
});
