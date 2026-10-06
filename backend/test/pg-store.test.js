// Pruebas del almacén sobre PostgreSQL real. Corre solo si hay TEST_DATABASE_URL;
// cada ejecución usa su propio esquema y lo borra al terminar.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
const { PgStore, ObjectId } = require('../database/pg-store');

const schema = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
let store;

test('almacén PostgreSQL', { skip: !url && 'sin TEST_DATABASE_URL' }, async (t) => {
  store = new PgStore({ connectionString: url, schema });
  await store.init();
  t.after(async () => {
    await store.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await store.close();
  });
  const foods = store.collection('foods');

  await t.test('insertar y leer conserva fechas, ids y números', async () => {
    const at = new Date('2026-01-02T03:04:05.678Z');
    const doc = { tenantId: 't1', name: 'Coca', price: 18.5, stock: 3, createdAt: at, supplierIds: ['s1', 's2'], meta: { a: { b: 1 } } };
    const r = await foods.insertOne(doc);
    assert.ok(r.insertedId instanceof ObjectId);
    assert.equal(String(doc._id), String(r.insertedId), 'el id queda en el objeto, como el driver');
    const back = await foods.findOne({ _id: new ObjectId(String(r.insertedId)) });
    assert.ok(back.createdAt instanceof Date);
    assert.equal(back.createdAt.toISOString(), at.toISOString());
    assert.equal(back.price, 18.5);
    assert.deepEqual(back.meta, { a: { b: 1 } });
    assert.equal(String(back._id), String(r.insertedId));
  });

  await t.test('filtros: igualdad, arreglos, $in, $ne, $exists, rangos, regex, $or', async () => {
    await foods.insertMany([
      { tenantId: 't1', name: 'Pan blanco', price: 30, stock: 0, lowStockThreshold: 5, createdAt: new Date('2026-02-01') },
      { tenantId: 't1', name: 'Pan integral', price: 45, stock: 10, createdAt: new Date('2026-03-01') },
      { tenantId: 't2', name: 'Leche', price: 28, stock: 2, lowStockThreshold: 1, createdAt: new Date('2026-04-01'), barcode: '750' },
    ]);
    const names = async (f, o) => (await foods.find(f, o).toArray()).map((d) => d.name).sort();
    assert.deepEqual(await names({ tenantId: 't2' }), ['Leche']);
    assert.deepEqual(await names({ supplierIds: 's2' }), ['Coca'], 'un arreglo coincide si contiene el valor');
    assert.deepEqual(await names({ tenantId: 't1', price: { $gte: 30, $lt: 45 } }), ['Pan blanco']);
    assert.deepEqual(await names({ tenantId: { $in: ['t2'] } }), ['Leche']);
    assert.deepEqual(await names({ tenantId: 't1', barcode: { $exists: false } }), ['Coca', 'Pan blanco', 'Pan integral']);
    assert.deepEqual(await names({ tenantId: 't1', name: { $ne: 'Coca' } }), ['Pan blanco', 'Pan integral']);
    assert.deepEqual(await names({ name: { $regex: 'pan', $options: 'i' } }), ['Pan blanco', 'Pan integral']);
    assert.deepEqual(await names({ $or: [{ barcode: '750' }, { price: 45 }] }), ['Leche', 'Pan integral']);
    assert.deepEqual(await names({ createdAt: { $gte: new Date('2026-03-01') } }), ['Leche', 'Pan integral']);
    assert.deepEqual(await names({ barcode: null, tenantId: 't2' }), [], 'null coincide con faltante o null');
    assert.deepEqual(await names({ barcode: null, name: 'Coca' }), ['Coca']);
    // $expr de productos con poco stock (stock <= umbral, 5 si no hay)
    const low = { $expr: { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 5] }] } };
    assert.deepEqual(await names(low), ['Coca', 'Pan blanco']);
  });

  await t.test('orden, límite, salto y proyección', async () => {
    const rows = await foods.find({}).sort({ price: -1 }).limit(2).toArray();
    assert.deepEqual(rows.map((r) => r.price), [45, 30]);
    const page = await foods.find({}, { sort: { price: 1 }, skip: 1, limit: 1, projection: { name: 1 } }).toArray();
    assert.deepEqual(Object.keys(page[0]).sort(), ['_id', 'name']);
    assert.equal(page[0].name, 'Leche', '18.5, 28, 30, 45: saltando 1 queda Leche');
    assert.equal(await foods.countDocuments({ tenantId: 't1' }), 3);
    assert.deepEqual((await foods.distinct('tenantId')).sort(), ['t1', 't2']);
  });

  await t.test('updateOne con $set, $inc, $unset, $pull y anidados', async () => {
    const r = await foods.updateOne({ name: 'Coca' }, { $set: { 'meta.a.c': 2, price: 19 }, $inc: { stock: 2 }, $unset: { barcode: '' }, $pull: { supplierIds: 's1' } });
    assert.equal(r.matchedCount, 1);
    assert.equal(r.modifiedCount, 1);
    const d = await foods.findOne({ name: 'Coca' });
    assert.equal(d.stock, 5);
    assert.equal(d.price, 19);
    assert.deepEqual(d.meta, { a: { b: 1, c: 2 } });
    assert.deepEqual(d.supplierIds, ['s2']);
    const same = await foods.updateOne({ name: 'Coca' }, { $set: { price: 19 } });
    assert.equal(same.modifiedCount, 0, 'sin cambio real no cuenta como modificado');
    const many = await foods.updateMany({ tenantId: 't1' }, { $set: { active: true } });
    assert.equal(many.modifiedCount, 3);
  });

  await t.test('upsert y findOneAndUpdate (contadores)', async () => {
    const counters = store.collection('counters');
    const a = await counters.findOneAndUpdate({ _id: 'prep:t1:2026-01-01' }, { $inc: { seq: 1 }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: 'after' });
    assert.equal(a.seq, 1);
    assert.equal(a._id, 'prep:t1:2026-01-01');
    const b = await counters.findOneAndUpdate({ _id: 'prep:t1:2026-01-01' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    assert.equal(b.seq, 2);
    const before = await counters.findOneAndUpdate({ _id: 'prep:t1:2026-01-01' }, { $inc: { seq: 1 } }, { returnDocument: 'before' });
    assert.equal(before.seq, 2);
    const up = await counters.updateOne({ key: 'x', tenantId: 't9' }, { $set: { n: 1 } }, { upsert: true });
    assert.equal(up.upsertedCount, 1);
    const seeded = await counters.findOne({ key: 'x' });
    assert.equal(seeded.tenantId, 't9', 'el upsert toma los campos del filtro');
  });

  await t.test('50 incrementos a la vez no pierden ninguno', async () => {
    const c = store.collection('rate_limits');
    await Promise.all(Array.from({ length: 50 }, () => c.findOneAndUpdate({ _id: 'ip:1' }, { $inc: { count: 1 } }, { upsert: true, returnDocument: 'after' })));
    assert.equal((await c.findOne({ _id: 'ip:1' })).count, 50);
  });

  await t.test('descuento condicionado de existencias es atómico', async () => {
    const { insertedId } = await foods.insertOne({ tenantId: 't3', name: 'Último', stock: 3 });
    const tries = await Promise.all(
      Array.from({ length: 10 }, () => foods.findOneAndUpdate({ _id: insertedId, stock: { $gte: 1 } }, { $inc: { stock: -1 } }, { returnDocument: 'after' }))
    );
    assert.equal(tries.filter(Boolean).length, 3, 'solo 3 de 10 alcanzan');
    assert.equal((await foods.findOne({ _id: insertedId })).stock, 0);
  });

  await t.test('índice único responde con código 11000 y borrar funciona', async () => {
    const orders = store.collection('orders');
    await orders.createIndex({ tenantId: 1, clientSaleId: 1 }, { unique: true, sparse: true, name: 'tenant_clientSaleId' });
    await orders.insertOne({ tenantId: 't1', clientSaleId: 'venta-1' });
    await assert.rejects(orders.insertOne({ tenantId: 't1', clientSaleId: 'venta-1' }), (e) => e.code === 11000);
    await orders.insertOne({ tenantId: 't1' });
    await orders.insertOne({ tenantId: 't1' }); // sin clientSaleId no choca
    assert.equal((await orders.deleteMany({ tenantId: 't1', clientSaleId: { $exists: false } })).deletedCount, 2);
    assert.equal((await orders.deleteOne({ clientSaleId: 'venta-1' })).deletedCount, 1);
  });

  await t.test('agregación: último costo por producto y totales por grupo', async () => {
    const ch = store.collection('cost_history');
    await ch.insertMany([
      { tenantId: 't1', foodId: 'a', cost: 10, createdAt: new Date('2026-01-01') },
      { tenantId: 't1', foodId: 'a', cost: 12, createdAt: new Date('2026-02-01') },
      { tenantId: 't1', foodId: 'b', cost: 5, createdAt: new Date('2026-01-15') },
    ]);
    const rows = await ch
      .aggregate([
        { $match: { tenantId: 't1', foodId: { $in: ['a', 'b'] } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$foodId', cost: { $first: '$cost' }, n: { $sum: 1 }, total: { $sum: '$cost' } } },
      ])
      .toArray();
    const byId = Object.fromEntries(rows.map((r) => [r._id, r]));
    assert.equal(byId.a.cost, 12);
    assert.equal(byId.a.n, 2);
    assert.equal(byId.a.total, 22);
    assert.equal(byId.b.cost, 5);
  });

  await t.test('TTL borra lo vencido', async () => {
    const s = store.collection('sessions');
    await s.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await s.insertMany([{ k: 'vieja', expiresAt: new Date(Date.now() - 1000) }, { k: 'nueva', expiresAt: new Date(Date.now() + 60000) }]);
    await store.sweepTtl();
    assert.deepEqual((await s.find({}).toArray()).map((d) => d.k), ['nueva']);
  });
});
