const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/barcode-lookup.service');

const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; svc.clearCache(); });
const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const facts = { status: 1, product: { product_name: 'Refresco de cola', brands: 'Coca-Cola, Otra', quantity: '355 ml' } };
const none = { status: 0 };

test('encuentra el producto, arma «Marca nombre» y dice de qué base viene', async () => {
  global.fetch = async () => ok(facts);
  assert.deepEqual(await svc.lookup('7501055300075'), { found: true, name: 'Coca-Cola Refresco de cola', quantity: '355 ml', source: 'Open Food Facts' });
});

test('si Open Food Facts no lo tiene, lo busca en las otras bases abiertas', async () => {
  global.fetch = async (url) => (String(url).includes('openproductsfacts') ? ok({ status: 1, product: { product_name: 'Cloro 1 L', brands: 'Cloralex' } }) : ok(none, 404));
  const r = await svc.lookup('7501026001203');
  assert.equal(r.found, true);
  assert.equal(r.source, 'Open Products Facts');
  assert.equal(r.name, 'Cloralex Cloro 1 L');
});

test('al final prueba UPCitemdb', async () => {
  global.fetch = async (url) => (String(url).includes('upcitemdb') ? ok({ code: 'OK', items: [{ title: 'Cable USB-C 1 m' }] }) : ok(none, 404));
  assert.deepEqual(await svc.lookup('885909950805'), { found: true, name: 'Cable USB-C 1 m', quantity: '', source: 'UPCitemdb' });
});

test('UPCitemdb con límite diario: no estorba y no se le insiste', async () => {
  let upcCalls = 0;
  global.fetch = async (url) => {
    if (String(url).includes('upcitemdb')) { upcCalls += 1; return ok({ code: 'EXCEED_LIMIT' }, 429); }
    return ok(none, 404);
  };
  assert.deepEqual(await svc.lookup('885909950805'), { found: false });
  await svc.lookup('885909950812');
  assert.equal(upcCalls, 1);
});

test('no repite la marca si el nombre ya la trae', () => {
  assert.equal(svc.suggestedName({ product_name: 'Coca-Cola Zero', brands: 'Coca-Cola' }), 'Coca-Cola Zero');
  assert.equal(svc.suggestedName({ product_name: '', brands: 'X' }), '');
});

test('código que no existe en ninguna base: found false, y se guarda para no volver a preguntar', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return ok(none, 404); };
  assert.deepEqual(await svc.lookup('7509999000012'), { found: false });
  const first = calls;
  await svc.lookup('7509999000012');
  assert.equal(calls, first);
});

test('si alguna base no responde y ninguna lo encontró, no se da por inexistente ni se guarda', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('timeout'); };
  assert.deepEqual(await svc.lookup('7501055300075'), { found: false, unavailable: true });
  const first = calls;
  await svc.lookup('7501055300075');
  assert.ok(calls > first);
});

test('un código que no parece de barras ni se consulta', async () => {
  let called = false;
  global.fetch = async () => { called = true; };
  assert.deepEqual(await svc.lookup('abc'), { found: false });
  assert.deepEqual(await svc.lookup('123'), { found: false });
  assert.equal(called, false);
});
