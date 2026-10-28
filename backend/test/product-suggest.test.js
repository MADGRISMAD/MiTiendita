const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, '..', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

function load({ free = { found: false }, ai = { found: true, name: 'Steren Removedor de polvo', brand: 'Steren', presentation: '300 ml', unit: 'pz', category: 'Limpieza', confidence: 'alta' }, configured = true } = {}) {
  const calls = { ai: [], free: 0 };
  stub('services/barcode-lookup.service.js', { lookup: async () => { calls.free += 1; return free; } });
  stub('services/gemini.service.js', {
    hasGeminiConfig: () => configured,
    identifyProduct: async (args) => {
      calls.ai.push(args);
      if (ai instanceof Error) throw ai;
      return ai;
    },
  });
  delete require.cache[require.resolve('../services/product-suggest.service.js')];
  return { svc: require('../services/product-suggest.service.js'), calls };
}
const base = { tenantId: 't1', plan: 'basic', code: '7501483147860', categories: ['Limpieza', 'Botanas'] };

test('si ninguna base lo conoce, la IA lo busca y completa categoría, unidad y marca', async () => {
  const { svc, calls } = load();
  const r = await svc.suggest(base);
  assert.deepEqual([r.found, r.name, r.presentation, r.unit, r.category, r.categoryExists, r.brand, r.ai], [true, 'Steren Removedor de polvo', '300 ml', 'pz', 'Limpieza', true, 'Steren', true]);
  assert.equal(calls.ai[0].name, '', 'sin nombre: busca por código');
});

test('si una base gratuita lo conoce, conserva ese nombre y la IA solo completa lo que falta (sin buscar)', async () => {
  const { svc, calls } = load({ free: { found: true, name: 'Coca-Cola Original', quantity: '600 ml', source: 'Open Food Facts' }, ai: { found: true, name: '', brand: 'Coca-Cola', presentation: '', unit: 'pz', category: 'Bebidas', confidence: 'alta' } });
  const r = await svc.suggest(base);
  assert.deepEqual([r.name, r.presentation, r.source, r.category, r.categoryExists], ['Coca-Cola Original', '600 ml', 'Open Food Facts', 'Bebidas', false]);
  assert.equal(calls.ai[0].name, 'Coca-Cola Original 600 ml', 'le pasa el nombre: solo clasifica');
});

test('con nombre escrito por la persona: no busca en bases y solo completa', async () => {
  const { svc, calls } = load();
  const r = await svc.suggest({ ...base, name: 'Removedor de polvo' });
  assert.equal(calls.free, 0);
  assert.equal(calls.ai[0].name, 'Removedor de polvo');
  assert.equal(r.category, 'Limpieza');
});

test('lo ya buscado por código se recuerda: la segunda tienda no vuelve a gastar IA', async () => {
  const { svc, calls } = load();
  await svc.suggest(base);
  const again = await svc.suggest({ ...base, tenantId: 't2' });
  assert.equal(calls.ai.length, 1);
  assert.equal(again.name, 'Steren Removedor de polvo');
});

test('tope diario por tienda: pasado el tope devuelve lo gratuito y avisa', async () => {
  process.env.AI_AUTO_DAILY_LIMIT = '2';
  try {
    const { svc, calls } = load({ free: { found: true, name: 'Algo', quantity: '', source: 'Open Food Facts' } });
    await svc.suggest({ ...base, code: '7501000000001' });
    await svc.suggest({ ...base, code: '7501000000002' });
    const r = await svc.suggest({ ...base, code: '7501000000003' });
    assert.equal(calls.ai.length, 2);
    assert.deepEqual([r.found, r.name, r.aiSkipped], [true, 'Algo', 'limit']);
    const other = await svc.suggest({ ...base, tenantId: 't2', code: '7501000000004' });
    assert.equal(other.aiSkipped, undefined, 'el tope es por tienda');
  } finally {
    delete process.env.AI_AUTO_DAILY_LIMIT;
  }
});

test('sin IA en el plan, sin llave o con la IA caída: no falla, devuelve lo que haya', async () => {
  let { svc, calls } = load({ free: { found: true, name: 'Algo', quantity: '', source: 'Open Food Facts' } });
  let r = await svc.suggest({ ...base, plan: 'perpetual' });
  assert.deepEqual([r.name, r.aiSkipped, calls.ai.length], ['Algo', 'off', 0]);
  ({ svc, calls } = load({ configured: false }));
  assert.equal((await svc.suggest(base)).aiSkipped, 'off');
  ({ svc, calls } = load({ free: { found: true, name: 'Algo', quantity: '', source: 'Open Food Facts' }, ai: new Error('caída') }));
  r = await svc.suggest(base);
  assert.deepEqual([r.found, r.name, r.aiSkipped], [true, 'Algo', 'error']);
});

test('código que no es de barras y sin nombre: no hace nada', async () => {
  const { svc, calls } = load();
  const r = await svc.suggest({ ...base, code: '123' });
  assert.equal(r.found, false);
  assert.equal(calls.ai.length, 0);
});
