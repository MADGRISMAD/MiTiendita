process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

// Venta de cafetería de punta a punta en el controlador: precio del servidor, insumos descontados,
// número de pedido para el ticket y devolución de insumos al cancelar.
const test = require('node:test');
const assert = require('node:assert/strict');

const foods = new Map();
const orders = [];
const reserves = [];
const restores = [];
let settings = { inventoryEnabled: false };
let prepCounter = 0;

const dbStub = {
  async GetOrderByClientSaleId(id) {
    return orders.find((o) => o.clientSaleId === id) || null;
  },
  async GetOrderById(id) {
    return orders.find((o) => o.id === id) || null;
  },
  async CreateOrder(o) {
    const row = { ...o, id: `o${orders.length + 1}`, paymentStatus: 'pending' };
    orders.push(row);
    return row;
  },
  async DeleteOrder(id) {
    orders.splice(orders.findIndex((o) => o.id === id), 1);
  },
  async GetOpenCashSession() {
    return { id: 'cs1' };
  },
  async GetSettings() {
    return settings;
  },
  async GetFoodById(id) {
    return foods.get(String(id)) || null;
  },
  async ReserveSaleStock(lines, tenantId, opts) {
    reserves.push({ lines, opts });
    return { applied: lines, shortages: [] };
  },
  async ConsumeSaleLots() {
    return [];
  },
  async RestoreSaleStock(foodId, quantity) {
    restores.push([foodId, quantity]);
  },
  async NextPrepNumber() {
    prepCounter += 1;
    return prepCounter;
  },
  async UpdateCashSession() {
    return {};
  },
  async CreateActivityLog() {
    return {};
  },
  async UpdateOrder(id, patch) {
    return Object.assign(orders.find((o) => o.id === id), patch);
  },
};
const mongoPath = require.resolve('../database/mongodb');
require.cache[mongoPath] = { id: mongoPath, filename: mongoPath, loaded: true, exports: dbStub };

const recipes = require('../services/recipe.service');
const { sale, voidSale } = require('../controllers/orders.controller');

const add = (f) => foods.set(f.id, f);
add({ id: 'cafe', name: 'Café en grano', isIngredient: true, stockUnit: 'g', cost: 0.4, stock: 0 });
add({ id: 'leche', name: 'Leche entera', isIngredient: true, stockUnit: 'ml', cost: 0.025, stock: 0 });
add({ id: 'almendra', name: 'Leche de almendra', isIngredient: true, stockUnit: 'ml', cost: 0.06, stock: 0 });
add({
  id: 'latte',
  name: 'Latte',
  price: 55,
  priceIncludesTax: true,
  ...recipes.sanitizeRecipeFields({
    recipe: [
      { ingredientId: 'cafe', qty: 18 },
      { ingredientId: 'leche', qty: 200 },
    ],
    sizes: [
      { id: 'ch', name: 'Chico', price: 55, factor: 1 },
      { id: 'gd', name: 'Grande', price: 68, factor: 1.5 },
    ],
    modifierGroups: [
      { id: 'leche', name: 'Leche', options: [{ id: 'alm', name: 'Almendra', priceDelta: 10, replaceFrom: 'leche', replaceTo: 'almendra' }] },
    ],
  }),
});
add({ id: 'galleta', name: 'Galleta', price: 25, priceIncludesTax: true, stock: 10 });

async function post(body) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  await sale({ tenantId: 't1', body }, res);
  return res;
}
const latteGrandeAlmendra = { foodId: 'latte', name: 'x', price: 1, quantity: 2, sizeId: 'gd', modifierIds: ['leche:alm'] };

test('cafetería sin inventario general: cobra con el precio del servidor y descuenta solo insumos', async () => {
  settings = { inventoryEnabled: false };
  reserves.length = 0;
  const r = await post({
    clientSaleId: 'venta-cafe-1',
    items: [latteGrandeAlmendra, { foodId: 'galleta', name: 'Galleta', price: 25, quantity: 1, priceIncludesTax: true }],
    taxRate: 16,
    paymentMethod: 'cash',
    cashReceived: 500,
    customerName: '  Ana  ',
  });
  assert.equal(r.code, 200, String(r.body));
  const latte = r.body.items.find((i) => i.foodId === 'latte');
  assert.equal(latte.price, 78, 'Grande 68 + almendra 10, no el $1 que mandó la caja');
  assert.equal(latte.name, 'Latte Grande');
  assert.equal(r.body.total, 78 * 2 + 25);

  // Solo insumos (la galleta no, porque el inventario general está apagado) y sin frenar la venta
  assert.equal(reserves.length, 1);
  const { lines, opts } = reserves[0];
  assert.deepEqual(
    lines.map((l) => [l.foodId, l.quantity]).sort(),
    [['almendra', 600], ['cafe', 54]],
    '2 lattes grandes: 18 g × 1.5 × 2 de café y 200 ml × 1.5 × 2 de almendra en vez de leche'
  );
  assert.equal(opts.allowNegative, true, 'sin inventario general, un insumo en cero no frena la venta');

  // Número de pedido y nombre para el ticket
  assert.equal(r.body.prep.number, 1);
  assert.equal(r.body.prep.customerName, 'Ana');
  assert.equal(r.body.inventoryApplied, true);
});

test('con inventario general: también salen los productos normales y respeta el bloqueo por existencias', async () => {
  settings = { inventoryEnabled: true, allowNegativeStock: false };
  reserves.length = 0;
  const r = await post({
    clientSaleId: 'venta-cafe-2',
    items: [{ ...latteGrandeAlmendra, quantity: 1 }, { foodId: 'galleta', name: 'Galleta', price: 25, quantity: 2, priceIncludesTax: true }],
    taxRate: 16,
    paymentMethod: 'card',
  });
  assert.equal(r.code, 200, String(r.body));
  const { lines, opts } = reserves[0];
  assert.equal(lines.find((l) => l.foodId === 'galleta').quantity, 2);
  assert.equal(lines.find((l) => l.foodId === 'latte'), undefined, 'la bebida no tiene existencias propias');
  assert.equal(opts.allowNegative, false);
  assert.equal(r.body.prep.number, 2);
});

test('una venta sin bebidas no lleva número de pedido', async () => {
  settings = { inventoryEnabled: false };
  reserves.length = 0;
  const r = await post({
    clientSaleId: 'venta-cafe-3',
    items: [{ foodId: 'galleta', name: 'Galleta', price: 25, quantity: 1, priceIncludesTax: true }],
    taxRate: 16,
    paymentMethod: 'cash',
    cashReceived: 25,
  });
  assert.equal(r.code, 200, String(r.body));
  assert.equal(r.body.prep, undefined);
  assert.equal(reserves.length, 0, 'inventario apagado y sin recetas: no se toca el stock');
});

test('tamaño que no existe: 400 y no queda pedido', async () => {
  const before = orders.length;
  const r = await post({
    clientSaleId: 'venta-cafe-4',
    items: [{ ...latteGrandeAlmendra, sizeId: 'enorme' }],
    taxRate: 16,
    paymentMethod: 'cash',
    cashReceived: 100,
  });
  assert.equal(r.code, 400);
  assert.match(String(r.body), /tamaño/);
  assert.equal(orders.length, before);
});

test('cancelar la venta regresa exactamente los insumos que salieron', async () => {
  const paid = orders.find((o) => o.clientSaleId === 'venta-cafe-1');
  restores.length = 0;
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
  await voidSale({ tenantId: 't1', params: { id: paid.id }, body: {} }, res);
  assert.equal(res.code, 200, String(res.body));
  assert.deepEqual(restores.sort(), [['almendra', 600], ['cafe', 54]]);
  assert.equal(paid.status, 'cancelled');
});
