const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../services/gemini.service');

const CATS = ['Limpieza', 'Botanas', 'Electrónica'];

test('lee el JSON aunque venga con ```json o texto alrededor, y deja los datos limpios', () => {
  const out = gemini.parseIdentify('Claro:\n```json\n{"found":true,"name":"Steren  Removedor de polvo","brand":"Steren","presentation":"300 ml","unit":"PZ","category":"limpieza","confidence":"alta"}\n```', { categories: CATS });
  assert.equal(out.name, 'Steren Removedor de polvo');
  assert.equal(out.unit, 'pz');
  assert.equal(out.category, 'Limpieza', 'usa la categoría de la tienda tal como está escrita');
  assert.equal(out.categoryExists, true);
});

test('categoría que no existe en la tienda se marca como nueva; unidad rara cae a pieza; sin confianza es baja', () => {
  const out = gemini.parseIdentify('{"found":true,"name":"X","unit":"caja","category":"Papelería"}', { categories: CATS });
  assert.deepEqual([out.category, out.categoryExists, out.unit, out.confidence], ['Papelería', false, 'pz', 'baja']);
  assert.throws(() => gemini.parseIdentify('no sé'), (e) => e.code === 'GEMINI_PARSE');
});

function withGemini(reply, fn) {
  const realFetch = global.fetch;
  const calls = [];
  process.env.GEMINI_API_KEY = 'k';
  global.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => reply };
  };
  return fn(calls).finally(() => { global.fetch = realFetch; delete process.env.GEMINI_API_KEY; });
}
const answer = (obj, grounded) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, ...(grounded ? { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://x' } }] } } : {}) }] });
const found = { found: true, name: 'Steren Removedor de polvo', presentation: '300 ml', unit: 'pz', category: 'Limpieza', confidence: 'alta' };

test('búsqueda por código: usa Google; con búsqueda que lo respalde sale como respaldado', async () => {
  await withGemini(answer(found, true), async (calls) => {
    const r = await gemini.identifyProduct({ code: '7501483147860', categories: CATS });
    assert.equal(r.found, true);
    assert.equal(r.grounded, true);
    assert.equal(r.name, 'Steren Removedor de polvo');
    assert.deepEqual(calls[0].tools, [{ google_search: {} }]);
    assert.ok(calls[0].generationConfig.maxOutputTokens >= 4096);
  });
});

test('sin búsqueda que lo respalde se ofrece igual, marcado para verificar; con poca seguridad o sin respuesta, no', async () => {
  await withGemini(answer(found, false), async () => {
    const r = await gemini.identifyProduct({ code: '7501483147860', categories: CATS });
    assert.deepEqual([r.found, r.grounded, r.reason], [true, false, '']);
  });
  await withGemini(answer({ ...found, confidence: 'baja' }, true), async () => {
    const r = await gemini.identifyProduct({ code: '7501483147860', categories: CATS });
    assert.deepEqual([r.found, r.reason], [false, 'low_confidence']);
  });
  await withGemini(answer({ found: false }, true), async () => {
    const r = await gemini.identifyProduct({ code: '7501483147860', categories: CATS });
    assert.deepEqual([r.found, r.reason], [false, 'not_found']);
  });
});

test('respuesta vacía o con error de la API: lanza un error con el motivo (para mostrarlo)', async () => {
  await withGemini({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }, async () => {
    await assert.rejects(gemini.identifyProduct({ code: '7501483147860' }), (e) => e.code === 'GEMINI_EMPTY' && /MAX_TOKENS/.test(e.message));
  });
  await withGemini({}, async () => {
    await assert.rejects(gemini.identifyProduct({ code: '7501483147860' }), (e) => e.code === 'GEMINI_EMPTY');
  });
  process.env.GEMINI_API_KEY = 'k';
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Search Grounding is not supported' } }) });
  try {
    await assert.rejects(gemini.identifyProduct({ code: '7501483147860' }), (e) => e.code === 'GEMINI_ERROR' && /Grounding/.test(e.message));
  } finally {
    global.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  }
});

test('con nombre solo completa datos: no busca en Google y no cambia el nombre', async () => {
  await withGemini(answer({ ...found, name: 'Otro nombre' }, false), async (calls) => {
    const r = await gemini.identifyProduct({ code: '7501483147860', name: 'Removedor de polvo Steren', categories: CATS });
    assert.equal(calls[0].tools, undefined);
    assert.equal(r.name, '');
    assert.deepEqual([r.found, r.presentation, r.category], [true, '300 ml', 'Limpieza']);
  });
});

test('sin llave de Gemini avisa con un código claro', async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(gemini.identifyProduct({ code: '7501483147860' }), (e) => e.code === 'GEMINI_NOT_CONFIGURED');
});
