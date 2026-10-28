const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/barcode-lookup.service');

const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; svc.clearCache(); });
const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('encuentra el producto y arma «Marca nombre» con la presentación', async () => {
  global.fetch = reply(200, { status: 1, product: { product_name: 'Refresco de cola', brands: 'Coca-Cola, Otra', quantity: '355 ml' } });
  assert.deepEqual(await svc.lookup('7501055300075'), { found: true, name: 'Coca-Cola Refresco de cola', quantity: '355 ml' });
});

test('no repite la marca si el nombre ya la trae', async () => {
  assert.equal(svc.suggestedName({ product_name: 'Coca-Cola Zero', brands: 'Coca-Cola' }), 'Coca-Cola Zero');
  assert.equal(svc.suggestedName({ product_name: '', brands: 'X' }), '');
});

test('código que no existe en la base: found false, y se guarda para no volver a preguntar', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return { ok: false, status: 404, json: async () => ({ status: 0 }) }; };
  assert.deepEqual(await svc.lookup('7509999000012'), { found: false });
  await svc.lookup('7509999000012');
  assert.equal(calls, 1);
});

test('si el servicio falla o tarda no rompe nada y no se guarda el fallo', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('timeout'); };
  assert.deepEqual(await svc.lookup('7501055300075'), { found: false, unavailable: true });
  global.fetch = reply(503, {});
  assert.deepEqual(await svc.lookup('7501055300075'), { found: false, unavailable: true });
  assert.equal(calls, 1);
});

test('un código que no parece de barras ni se consulta', async () => {
  let called = false;
  global.fetch = async () => { called = true; };
  assert.deepEqual(await svc.lookup('abc'), { found: false });
  assert.deepEqual(await svc.lookup('123'), { found: false });
  assert.equal(called, false);
});
