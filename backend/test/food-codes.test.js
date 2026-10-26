const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { codeVariants, cleanAltCodes } = require('../utils/barcode');

const root = path.join(__dirname, '..');
const stub = (rel, exports) => {
  const file = require.resolve(path.join(root, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

test('un código y sus formas equivalentes: UPC-A contra EAN-13, ceros al inicio y mayúsculas', () => {
  const v = codeVariants('012345678905');
  assert.ok(v.includes('12345678905') && v.includes('0012345678905') && v.includes('012345678905'));
  assert.ok(codeVariants('7501055300075').includes('7501055300075'));
  assert.deepEqual(codeVariants('  '), []);
  const alnum = codeVariants('Ab-12');
  assert.ok(alnum.includes('AB-12') && alnum.includes('ab-12'));
});

test('códigos extra: sin vacíos, repetidos, ni el principal (aunque venga con otro cero)', () => {
  assert.deepEqual(cleanAltCodes([' 111 ', '111', '', '0222', '222'], '0000222'), ['111']);
  assert.deepEqual(cleanAltCodes('no es lista', '1'), []);
  assert.equal(cleanAltCodes(Array.from({ length: 30 }, (_, i) => `c${i}`)).length, 10);
});

function load(foods) {
  const db = {
    async GetFoodByBarcode(code) {
      const v = codeVariants(code);
      return foods.find((f) => [f.barcode, f.sku, ...(f.altCodes || [])].some((c) => v.includes(c))) || null;
    },
    async GetFoodById(id) { return foods.find((f) => f.id === id) || null; },
    async UpdateFood(id, body) { const f = foods.find((x) => x.id === id); Object.assign(f, body); return f; },
    async CreateFood(doc) { const f = { id: `n${foods.length}`, ...doc }; foods.push(f); return f; },
    async CreateActivityLog() {},
    async CountPlanFoods() { return 0; },
  };
  stub('database/mongodb.js', db);
  stub('services/plan-limits.service.js', { assertProductRoom: async () => {}, sendLimit: () => false });
  delete require.cache[require.resolve(path.join(root, 'controllers/menus.controller.js'))];
  return require('../controllers/menus.controller');
}
const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });

test('agregar un segundo código a un producto: se guarda, y otro producto no puede usar ese código', async () => {
  const foods = [
    { id: 'a', name: 'Coca 600 ml', barcode: '7501055300075', sku: '7501055300075', altCodes: [] },
    { id: 'b', name: 'Coca 600 ml Navidad', barcode: '', sku: '', altCodes: [] },
  ];
  const menus = load(foods);
  const ok = res();
  await menus.updateFood({ params: { id: 'a' }, body: { altCodes: ['7501055399999'] }, tenantId: 't', user: { username: 'x' } }, ok);
  assert.equal(ok.code, 200);
  assert.deepEqual(foods[0].altCodes, ['7501055399999']);
  // el principal sigue funcionando y el segundo también (lo buscan igual)
  assert.equal((await require('../database/mongodb').GetFoodByBarcode('7501055399999')).id, 'a');

  // el otro producto intenta quedarse con ese mismo código (aun escrito con un cero de más): se rechaza
  const clash = res();
  await menus.updateFood({ params: { id: 'b' }, body: { barcode: '07501055399999', sku: '07501055399999' }, tenantId: 't', user: { username: 'x' } }, clash);
  assert.equal(clash.code, 409);
  assert.match(clash.body, /Coca 600 ml/);
  const clash2 = res();
  await menus.updateFood({ params: { id: 'b' }, body: { altCodes: ['7501055399999'] }, tenantId: 't', user: { username: 'x' } }, clash2);
  assert.equal(clash2.code, 409);
});

test('reemplazar el código: el viejo deja de ser del producto y se puede asignar a otro', async () => {
  const foods = [{ id: 'a', name: 'Jabón', barcode: 'MALO', sku: 'MALO', altCodes: [] }, { id: 'b', name: 'Otro', barcode: '', sku: '', altCodes: [] }];
  const menus = load(foods);
  const r = res();
  await menus.updateFood({ params: { id: 'a' }, body: { barcode: '7500000000001', sku: '7500000000001' }, tenantId: 't', user: {} }, r);
  assert.equal(r.code, 200);
  const r2 = res();
  await menus.updateFood({ params: { id: 'b' }, body: { barcode: 'malo', sku: 'malo' }, tenantId: 't', user: {} }, r2);
  assert.equal(r2.code, 200);
});
