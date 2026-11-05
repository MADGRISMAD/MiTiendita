const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/catalog-store-prices.service');

const CATALOG = [
  { key: 'k1', catalog: 'abarrotes', name: 'Papas Sal', price: 20, cost: 16.8 },
  { key: 'k2', catalog: 'abarrotes', name: 'Papas Adobadas', price: 20, cost: 16.8 },
  { key: 'k3', catalog: 'abarrotes', name: 'Arroz', unit: 'kg' }, // sin precio en el catálogo
];

/** Base falsa: tiendas con sus productos y lo que ya vendieron. */
function fakeDb(tenants) {
  const log = [];
  return {
    log,
    tenants,
    ListCatalogItems: async (c) => CATALOG.filter((i) => i.catalog === c),
    ListTenants: async () => tenants.map((t) => ({ id: t.id, name: t.name })),
    GetFoods: async (id) => tenants.find((t) => t.id === id).foods,
    GetSettings: async (id) => ({ businessName: tenants.find((t) => t.id === id).name }),
    ListSoldRefs: async (id) => tenants.find((t) => t.id === id).sold || { ids: [], names: [] },
    UpdateFood: async (foodId, patch, tenantId) => Object.assign(tenants.find((t) => t.id === tenantId).foods.find((f) => f.id === foodId), patch),
    CreateActivityLog: async (e) => log.push(e),
  };
}
const food = (id, catalogId, price, cost, extra = {}) => ({ id, catalogId, name: extra.name || `Producto ${id}`, price, cost, needsPrice: false, ...extra });

test('quita precio y costo a lo que la tienda no ha vendido ni cambiado', async () => {
  const db = fakeDb([{ id: 'tA', name: 'Tienda A', foods: [food('a1', 'k1', 20, 16.8), food('a2', 'k2', 20, 16.8)] }]);
  const out = await svc.apply(db, 'abarrotes', 'QUITAR');
  assert.deepEqual(out.totals, { stores: 1, products: 2, prices: 2, costs: 2, sold: 0, changed: 0 });
  for (const f of db.tenants[0].foods) assert.deepEqual([f.price, f.cost, f.needsPrice], [0, 0, true]);
  assert.equal(db.log.length, 1, 'la tienda ve en su bitácora qué pasó');
  assert.equal(db.log[0].tenantId, 'tA');
});

test('un producto ya vendido no se toca (por id o por nombre, por si la venta no guardó el id)', async () => {
  const db = fakeDb([{
    id: 'tB', name: 'Tienda B',
    foods: [food('b1', 'k1', 20, 16.8), food('b2', 'k2', 20, 16.8, { name: 'Papas Adobadas 45G' })],
    sold: { ids: ['b1'], names: ['papas adobadas 45g'] },
  }]);
  const out = await svc.apply(db, 'abarrotes', 'QUITAR');
  assert.equal(out.totals.products, 0);
  assert.equal(out.totals.sold, 2);
  assert.deepEqual(db.tenants[0].foods.map((f) => f.price), [20, 20]);
  assert.equal(db.log.length, 0, 'sin cambios no se escribe nada en la bitácora');
});

test('si la tienda cambió el precio, el producto no se toca (ni el costo)', async () => {
  const db = fakeDb([{ id: 'tC', name: 'Tienda C', foods: [food('c1', 'k1', 25, 16.8)] }]);
  const out = await svc.apply(db, 'abarrotes', 'QUITAR');
  assert.equal(out.totals.changed, 1);
  assert.deepEqual([db.tenants[0].foods[0].price, db.tenants[0].foods[0].cost], [25, 16.8]);
});

test('si cambió solo el costo: se quita el precio y el costo suyo se queda', async () => {
  const db = fakeDb([{ id: 'tD', name: 'Tienda D', foods: [food('d1', 'k1', 20, 17.5)] }]);
  const out = await svc.apply(db, 'abarrotes', 'QUITAR');
  assert.deepEqual([out.totals.products, out.totals.costs], [1, 0]);
  const f = db.tenants[0].foods[0];
  assert.deepEqual([f.price, f.cost, f.needsPrice], [0, 17.5, true]);
});

test('ignora lo que ya está sin precio, lo que no viene del catálogo y lo que el catálogo no trae con precio; incluye sucursales', async () => {
  const db = fakeDb([
    { id: 'tE', name: 'Tienda E', foods: [food('e1', 'k1', 0, 0, { needsPrice: true }), food('e2', undefined, 20, 16.8), food('e3', 'k3', 30, 20), food('e4', 'borrado', 20, 16.8)] },
    { id: 'tF', name: 'Sucursal F', foods: [food('f1', 'k1', 20, 16.8)] },
  ]);
  const out = await svc.apply(db, 'abarrotes', 'QUITAR');
  assert.deepEqual([out.totals.stores, out.totals.products], [1, 1]);
  assert.equal(db.tenants[0].foods.find((f) => f.id === 'e2').price, 20, 'lo que no es del catálogo no se toca');
  assert.equal(db.tenants[0].foods.find((f) => f.id === 'e3').price, 30);
  assert.equal(db.tenants[1].foods[0].price, 0, 'las sucursales también cuentan');
});

test('la vista previa no cambia nada y pide la palabra para aplicar', async () => {
  const db = fakeDb([{ id: 'tA', name: 'Tienda A', foods: [food('a1', 'k1', 20, 16.8)] }]);
  const pre = await svc.preview(db, 'abarrotes');
  assert.deepEqual(pre.totals, { stores: 1, products: 1, prices: 1, costs: 1, sold: 0, changed: 0 });
  assert.deepEqual(pre.stores, [{ tenantId: 'tA', name: 'Tienda A', products: 1, costs: 1 }]);
  assert.equal(db.tenants[0].foods[0].price, 20, 'la vista previa no modifica nada');
  await assert.rejects(svc.apply(db, 'abarrotes', ''), (e) => e.status === 400);
  await assert.rejects(svc.apply(db, 'abarrotes', 'si'), (e) => e.status === 400);
  await assert.rejects(svc.apply(db, 'nada', 'QUITAR'), (e) => e.status === 404);
  assert.equal(db.tenants[0].foods[0].price, 20, 'sin confirmar no se toca nada');
  assert.equal((await svc.apply(db, 'abarrotes', ' quitar ')).totals.products, 1);
  assert.equal((await svc.apply(db, 'abarrotes', 'QUITAR')).totals.products, 0, 'repetirlo no cambia nada');
});
