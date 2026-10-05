process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

// Categorías de insumos: lo que se guarda ahí es materia prima (no sale en la caja).
const test = require('node:test');
const assert = require('node:assert/strict');

const menus = new Map([
  ['m-venta', { id: 'm-venta', name: 'Bebidas', kind: 'sale' }],
  ['m-insumos', { id: 'm-insumos', name: 'Insumos', kind: 'supplies' }],
]);
const foods = new Map();
let created = null;
const dbStub = {
  async CreateMenu(m) {
    return { ...m, id: 'm-nueva' };
  },
  async UpdateMenu(id, patch) {
    return { ...menus.get(id), ...patch };
  },
  async GetMenuLite(id) {
    return menus.get(id) || null;
  },
  async GetFoodByBarcode() {
    return null;
  },
  async CreateFood(f) {
    created = { ...f, id: `f${foods.size + 1}` };
    foods.set(created.id, created);
    return created;
  },
  async UpdateFood(id, patch) {
    return Object.assign(foods.get(id), patch);
  },
};
const mongoPath = require.resolve('../database/mongodb');
require.cache[mongoPath] = { id: mongoPath, filename: mongoPath, loaded: true, exports: dbStub };
const limitsPath = require.resolve('../services/plan-limits.service');
require.cache[limitsPath] = { id: limitsPath, filename: limitsPath, loaded: true, exports: { async assertProductRoom() {}, sendLimit: () => false } };

const menusCtl = require('../controllers/menus.controller');

function call(fn, req) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  return fn({ tenantId: 't1', tenant: { plan: 'basic' }, params: {}, ...req }, res).then(() => res);
}

test('la categoría guarda si es de venta o de insumos (y nada raro)', async () => {
  let r = await call(menusCtl.createMenu, { body: { name: 'Insumos', kind: 'supplies' } });
  assert.equal(r.body.kind, 'supplies');
  r = await call(menusCtl.createMenu, { body: { name: 'Pan', kind: 'loquesea' } });
  assert.equal(r.body.kind, 'sale', 'por defecto es para vender');
});

test('un producto en categoría de insumos es materia prima; en una de venta, no', async () => {
  let r = await call(menusCtl.createFood, { body: { name: 'Leche entera', price: 0, menuId: 'm-insumos', stockUnit: 'ml', isIngredient: false } });
  assert.equal(r.code, 201, String(r.body));
  assert.equal(created.isIngredient, true, 'manda la categoría, no lo que diga la pantalla');
  assert.equal(created.stockUnit, 'ml');

  r = await call(menusCtl.createFood, { body: { name: 'Galleta', price: 25, menuId: 'm-venta' } });
  assert.equal(created.isIngredient, false);

  // Moverlo de categoría lo cambia
  r = await call(menusCtl.updateFood, { params: { id: created.id }, body: { menuId: 'm-insumos' } });
  assert.equal(r.body.isIngredient, true);
});
