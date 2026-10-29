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

test('dígito verificador que le toca a un código', () => {
  assert.equal(audit.checkDigitOf('750105530007'), 5);
  assert.equal(audit.checkDigitOf('7501055'), 3);
});

test('sugerencias: dígito corregido y confirmado, sin confirmar, y por nombre con los de México primero', async () => {
  const lookup = require('../services/barcode-lookup.service');
  const realFetch = global.fetch;
  const db = fakeDb([
    row('a', 'Coca-Cola', '7501055300076', { presentation: '355 ml' }), // dígito malo: el bueno es ...075
    row('b', 'Galletas Marías Gamesa', '7501000111101'), // dígito malo, el corregido no está en ninguna base
    row('c', 'Cheetos Torciditos', '7501011100013'), // válido y ya usado por otro producto
    row('d', 'Coca-Cola Light', '7501011100013'),
  ]);
  const json = (b, status = 200) => ({ ok: status < 400, status, json: async () => b });
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/api/v2/product/7501055300075')) return json({ status: 1, product: { product_name: 'Coca-Cola Original', quantity: '355 ml' } });
    if (u.includes('/cgi/search.pl') && u.includes('openfoodfacts') && u.includes('Coca-Cola')) {
      return json({ products: [
        { code: '7441003518483', product_name: 'Coca-Cola 355 ml', brands: 'Coca', countries_tags: ['en:panama'] },
        { code: '7501055300075', product_name: 'Coca-Cola Original', quantity: '355 ml', brands: 'Coca-Cola', countries_tags: ['en:mexico'] },
        { code: '7501011100013', product_name: 'Coca-Cola 355 ml', countries_tags: ['en:mexico'] }, // ya lo usa otro producto
        { code: '9999999999999', product_name: 'Cable USB' },
      ] });
    }
    return json({ status: 0, products: [] }, 404);
  };
  try {
    lookup.clearCache();
    const { suggestions } = await audit.suggest(db, 'abarrotes', ['a', 'b']);
    assert.equal(suggestions.a[0].code, '7501055300075');
    assert.equal(suggestions.a[0].confidence, 'confirmed');
    assert.equal(suggestions.a.filter((c) => c.code === '7501055300075').length, 1, 'sin repetir');
    assert.ok(!suggestions.a.some((c) => c.code === '7501011100013'), 'no propone un código que ya usa otro producto');
    assert.ok(!suggestions.a.some((c) => c.code === '9999999999999'), 'descarta lo que no se parece');
    const panama = suggestions.a.findIndex((c) => c.code === '7441003518483');
    assert.ok(panama === -1 || panama > 0, 'el de México no queda detrás del de Panamá');
    assert.deepEqual(suggestions.b.map((c) => [c.code, c.confidence]), [['7501000111107', 'check_digit']]);
    // un código válido que las bases atribuyen a otro producto: dice a cuál y propone el que sí es
    const wrong = fakeDb([row('w', 'Coca-Cola', '7501055300075', { presentation: '355 ml' }), row('z', 'Jabón Zote', '036000291452')]);
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/v2/product/7501055300075')) return json({ status: 1, product: { product_name: 'Papel higiénico Kleenex' } });
      if (u.includes('/api/v2/product/036000291452')) return json({ status: 1, product: { product_name: 'Jabón Zote', brands: 'Zote' } });
      if (u.includes('/cgi/search.pl') && u.includes('openfoodfacts')) return json({ products: [{ code: '7501055363070', product_name: 'Coca-Cola Original', quantity: '355 ml', countries_tags: ['en:mexico'] }] });
      return json({ status: 0, products: [] }, 404);
    };
    lookup.clearCache();
    const other = await audit.suggest(wrong, 'abarrotes', ['w', 'z']);
    assert.equal(other.registered.w.same, false);
    assert.equal(other.registered.w.name, 'Papel higiénico Kleenex');
    assert.equal(other.suggestions.w[0].code, '7501055363070');
    assert.equal(other.registered.z.same, true);
    assert.deepEqual(other.suggestions.z, [], 'si el código ya es de este producto no se propone cambiarlo');
    await assert.rejects(audit.suggest(db, 'abarrotes', ['a', 'b', 'c', 'd', 'a']), (e) => e.status === 400);
  } finally {
    global.fetch = realFetch;
    lookup.clearCache();
  }
});

test('comparación estricta: una variante o una medida distinta no cuenta como el mismo producto', () => {
  assert.equal(audit.sameProduct('Coca-Cola Original 600 ml', 'Coca-Cola Zero 600 ml'), false);
  assert.equal(audit.sameProduct('Coca-Cola 600 ml', 'Coca-Cola Light'), false);
  assert.equal(audit.sameProduct('Sabritas Sal 45 g', 'Sabritas'), true);
  assert.equal(audit.sameProduct('Sabritas Sal 45 g', 'Gamesa Marías'), false);
  assert.equal(audit.sameProduct('Coca-Cola Original 600 ml', 'Coca'), false, 'una sola palabra de coincidencia en un nombre largo no basta');
  // medidas pegadas, con decimales y en otra unidad
  assert.equal(audit.sizeDiffers('Coca-Cola 600ml', 'Coca-Cola 600 ml'), false);
  assert.equal(audit.sizeDiffers('Azúcar 1 kg', 'Azúcar 1000 g'), false);
  assert.equal(audit.sizeDiffers('Azúcar 1 kg', 'Azúcar 500 g'), true);
  assert.equal(audit.sizeDiffers('Aceite 1,5 l', 'Aceite 1500 ml'), false);
  assert.equal(audit.sizeDiffers('Donitas 7p 52.5g', 'Donitas 4p 52.5g'), true);
});

test('revisión local: avisa de productos con el mismo nombre y presentación pero otro código', async () => {
  const db = fakeDb([
    row('a', 'Coca-Cola Original', '7501055300075', { presentation: '600 ml' }),
    row('b', 'COCA COLA original', '036000291452', { presentation: '600ml' }),
    row('c', 'Coca-Cola Original', '7501055363070', { presentation: '355 ml' }), // otra presentación: no es repetido
    row('d', 'Coca-Cola Zero', '7501055370009', { presentation: '600 ml' }), // otra variante: no es repetido
  ]);
  const { counts, problems } = await audit.localReport(db, 'abarrotes');
  assert.deepEqual(problems.map((p) => [p.key, p.issues]), [['a', ['sameName']], ['b', ['sameName']]]);
  assert.equal(counts.sameName, 2);
  assert.match(problems[0].sameNameAs[0], /036000291452/);
});

test('IA: solo propone un código si hay páginas, medida igual y otra fuente que lo confirme', async () => {
  const gemini = require('../services/gemini.service');
  const lookup = require('../services/barcode-lookup.service');
  const realFetch = global.fetch;
  const realFind = gemini.findBarcode;
  const realHas = gemini.hasGeminiConfig;
  const db = fakeDb([row('a', 'Coca-Cola Original', '', { presentation: '600 ml' })]);
  const json = (b, status = 200) => ({ ok: status < 400, status, json: async () => b, text: async () => '' });
  let answer;
  gemini.hasGeminiConfig = () => true;
  gemini.findBarcode = async () => answer;
  const good = { found: true, code: '7501055300075', name: 'Coca-Cola Original', presentation: '600 ml', confidence: 'alta', grounded: true, sources: ['https://tienda.test/p1'] };
  const run = async () => (await audit.suggest(db, 'abarrotes', ['a'])).suggestions.a;
  try {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/v2/product/7501055300075')) return json({ status: 1, product: { product_name: 'Coca-Cola Original', quantity: '600 ml' } });
      return json({ status: 0, products: [] }, 404);
    };
    // 1) una base pública confirma el mismo producto
    lookup.clearCache(); answer = good;
    assert.deepEqual((await run()).map((c) => [c.code, c.confidence]), [['7501055300075', 'ai_confirmed']]);
    // 2) la base pública lo atribuye a otro producto: se descarta
    global.fetch = async (url) => (String(url).includes('/api/v2/product/7501055300075') ? json({ status: 1, product: { product_name: 'Papel higiénico' } }) : json({ status: 0, products: [] }, 404));
    lookup.clearCache();
    assert.deepEqual(await run(), []);
    // 3) ninguna base lo tiene: solo vale si una página citada muestra el código
    global.fetch = async (url) => (String(url).includes('tienda.test') ? { ok: true, status: 200, text: async () => '<p>Código 7501055300075</p>' } : json({ status: 0, products: [] }, 404));
    lookup.clearCache();
    assert.deepEqual((await run()).map((c) => c.confidence), ['ai_page']);
    global.fetch = async (url) => (String(url).includes('tienda.test') ? { ok: true, status: 200, text: async () => '<p>sin código</p>' } : json({ status: 0, products: [] }, 404));
    lookup.clearCache();
    assert.deepEqual(await run(), [], 'sin otra fuente que lo muestre no se ofrece');
    // 4) respuestas que no cumplen: confianza media, sin páginas, otra medida, dígito malo
    for (const bad of [{ confidence: 'media' }, { grounded: false, sources: [] }, { presentation: '355 ml' }, { code: '7501055300076' }]) {
      answer = { ...good, ...bad };
      global.fetch = async (url) => (String(url).includes('/api/v2/product/') ? json({ status: 1, product: { product_name: 'Coca-Cola Original', quantity: '600 ml' } }) : json({ status: 0, products: [] }, 404));
      lookup.clearCache();
      assert.deepEqual(await run(), [], JSON.stringify(bad));
    }
  } finally {
    global.fetch = realFetch;
    gemini.findBarcode = realFind;
    gemini.hasGeminiConfig = realHas;
    lookup.clearCache();
  }
});
