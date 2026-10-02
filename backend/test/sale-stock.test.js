const test = require('node:test');
const assert = require('node:assert/strict');
const { reserveSaleStock, groupSaleLines } = require('../services/sale-stock.service');

/** Colección mínima en memoria con lo que usa el servicio ($inc y filtro stock >= n). */
function fakeFoods(rows) {
  const docs = rows.map((r) => ({ ...r }));
  const matches = (doc, filter) =>
    doc._id === filter._id && (!filter.stock || (typeof doc.stock === 'number' && doc.stock >= filter.stock.$gte));
  return {
    docs,
    async findOne(filter) {
      return docs.find((d) => matches(d, filter)) || null;
    },
    async findOneAndUpdate(filter, update) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return null;
      doc.stock = (Number(doc.stock) || 0) + update.$inc.stock;
      return { ...doc };
    },
    async updateOne(filter, update) {
      const doc = docs.find((d) => matches(d, filter));
      if (doc) doc.stock = (Number(doc.stock) || 0) + update.$inc.stock;
    },
  };
}
const byId = (id) => ({ _id: id });

test('stock insuficiente: responde 409 y no descuenta nada', async () => {
  const foods = fakeFoods([
    { _id: 'a', name: 'Coca 600', stock: 5 },
    { _id: 'b', name: 'Sabritas', stock: 1 },
  ]);
  await assert.rejects(
    reserveSaleStock(foods, byId, [
      { foodId: 'a', name: 'Coca 600', quantity: 2 },
      { foodId: 'b', name: 'Sabritas', quantity: 2 },
    ]),
    (err) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /Sabritas/);
      assert.deepEqual(err.shortages.map((s) => s.foodId), ['b']);
      return true;
    }
  );
  assert.equal(foods.docs[0].stock, 5);
  assert.equal(foods.docs[1].stock, 1);
});

test('stock 0: no se vende', async () => {
  const foods = fakeFoods([{ _id: 'a', name: 'Leche', stock: 0 }]);
  await assert.rejects(reserveSaleStock(foods, byId, [{ foodId: 'a', quantity: 1 }]), { status: 409 });
  assert.equal(foods.docs[0].stock, 0);
});

test('stock suficiente: descuenta y suma renglones del mismo producto', async () => {
  const foods = fakeFoods([{ _id: 'a', name: 'Coca 600', stock: 5 }]);
  const res = await reserveSaleStock(foods, byId, [
    { foodId: 'a', quantity: 2 },
    { foodId: 'a', quantity: 3 },
  ]);
  assert.equal(foods.docs[0].stock, 0);
  assert.deepEqual(res.shortages, []);
});

test('dos cajas por la última pieza: solo una la vende', async () => {
  const foods = fakeFoods([{ _id: 'a', name: 'Pan', stock: 1 }]);
  const results = await Promise.allSettled([
    reserveSaleStock(foods, byId, [{ foodId: 'a', quantity: 1 }]),
    reserveSaleStock(foods, byId, [{ foodId: 'a', quantity: 1 }]),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(foods.docs[0].stock, 0);
});

test('permitir sin existencias: vende, deja negativo y reporta faltante', async () => {
  const foods = fakeFoods([{ _id: 'a', name: 'Huevo', stock: 1 }]);
  const res = await reserveSaleStock(foods, byId, [{ foodId: 'a', quantity: 3 }], { allowNegative: true });
  assert.equal(foods.docs[0].stock, -2);
  assert.deepEqual(res.shortages, [{ foodId: 'a', name: 'Huevo', requested: 3, available: 1 }]);
});

test('artículos varios y productos borrados no frenan la venta', async () => {
  const foods = fakeFoods([]);
  const res = await reserveSaleStock(foods, byId, [
    { foodId: null, name: 'Varios', quantity: 1 },
    { foodId: 'zzz', quantity: 1 },
  ]);
  assert.deepEqual(res, { applied: [], shortages: [] });
  assert.equal(groupSaleLines([{ foodId: null, quantity: 2 }]).length, 0);
});
