const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, Db, ObjectId } = require('../database/sqlite-store');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-sqlite-'));
  const file = path.join(dir, 'test.db');
  const store = new Store(file);
  return { db: new Db(store), store, file };
}

test('insert, find por ObjectId y tipos (fecha, booleano, arreglo) sobreviven al guardar', async () => {
  const { db } = freshDb();
  const col = db.collection('foods');
  const at = new Date('2026-01-02T03:04:05.000Z');
  const { insertedId } = await col.insertOne({ tenantId: 't1', name: 'Coca', price: 18.5, active: true, createdAt: at, tags: ['bebida', 'fria'] });
  assert.ok(insertedId instanceof ObjectId);
  const doc = await col.findOne({ _id: new ObjectId(String(insertedId)) });
  assert.equal(doc.name, 'Coca');
  assert.ok(doc.createdAt instanceof Date);
  assert.equal(doc.createdAt.toISOString(), at.toISOString());
  assert.ok(doc._id instanceof ObjectId);
  assert.equal(doc.active, true);
  assert.deepEqual(doc.tags, ['bebida', 'fria']);
  assert.equal((await col.find({ tags: 'fria' }).toArray()).length, 1, 'un valor dentro del arreglo coincide');
  assert.equal((await col.find({ active: true, tenantId: 't1' }).toArray()).length, 1);
});

test('filtros: rangos de fecha, $in, $ne null, $exists, $regex con i, $or y rutas en arreglos', async () => {
  const { db } = freshDb();
  const col = db.collection('orders');
  await col.insertMany([
    { tenantId: 't1', total: 10, createdAt: new Date('2026-01-01T10:00:00Z'), customerId: 'c1', items: [{ foodId: 'f1' }] },
    { tenantId: 't1', total: 20, createdAt: new Date('2026-01-05T10:00:00Z'), customerId: null, items: [{ foodId: 'f2' }] },
    { tenantId: 't1', total: 30, createdAt: new Date('2026-01-09T10:00:00Z'), items: [{ foodId: 'f1' }, { foodId: 'f3' }], note: 'Pagó con Tarjeta' },
    { tenantId: 't2', total: 40, createdAt: new Date('2026-01-05T10:00:00Z') },
  ]);
  const range = await col.find({ tenantId: 't1', createdAt: { $gte: new Date('2026-01-02T00:00:00Z'), $lt: new Date('2026-01-08T00:00:00Z') } }).toArray();
  assert.deepEqual(range.map((o) => o.total), [20]);
  assert.equal((await col.find({ tenantId: { $in: ['t1', 't2'] } }).toArray()).length, 4);
  assert.deepEqual((await col.find({ tenantId: 't1', customerId: { $ne: null } }).toArray()).map((o) => o.total), [10]);
  assert.deepEqual((await col.find({ tenantId: 't1', customerId: { $exists: false } }).toArray()).map((o) => o.total), [30]);
  assert.deepEqual((await col.find({ note: { $regex: 'tarjeta', $options: 'i' } }).toArray()).map((o) => o.total), [30]);
  assert.deepEqual((await col.find({ $or: [{ total: 10 }, { total: 40 }] }).sort({ total: 1 }).toArray()).map((o) => o.total), [10, 40]);
  assert.deepEqual((await col.find({ 'items.foodId': 'f1' }).sort({ total: -1 }).toArray()).map((o) => o.total), [30, 10]);
  assert.equal(await col.countDocuments({ tenantId: 't1' }), 3);
  assert.equal(await col.countDocuments({ tenantId: 't1' }, { limit: 1 }), 1);
});

test('orden, límite y proyección (inclusión y exclusión)', async () => {
  const { db } = freshDb();
  const col = db.collection('x');
  await col.insertMany([{ n: 3, a: 1, lines: [1] }, { n: 1, a: 2, lines: [2] }, { n: 2, a: 3, lines: [3] }]);
  assert.deepEqual((await col.find({}).sort({ n: -1 }).limit(2).toArray()).map((d) => d.n), [3, 2]);
  const inc = await col.findOne({ n: 1 }, { projection: { a: 1 } });
  assert.deepEqual(Object.keys(inc).sort(), ['_id', 'a']);
  const exc = await col.find({ n: 2 }).project({ lines: 0 }).toArray();
  assert.equal(exc[0].lines, undefined);
  assert.equal(exc[0].a, 3);
});

test('actualizaciones: $set con puntos, $inc, $push, $pull, $addToSet, $unset y conteos', async () => {
  const { db } = freshDb();
  const col = db.collection('c');
  const { insertedId } = await col.insertOne({ k: 'a', stock: 5, list: [1, 2], meta: { x: 1 } });
  const r = await col.updateOne({ _id: insertedId }, { $set: { 'meta.y': 2 }, $inc: { stock: -2 }, $push: { list: 3 }, $unset: { k: '' } });
  assert.equal(r.matchedCount, 1);
  assert.equal(r.modifiedCount, 1);
  await col.updateOne({ _id: insertedId }, { $pull: { list: 1 }, $addToSet: { tags: 'x' } });
  await col.updateOne({ _id: insertedId }, { $addToSet: { tags: 'x' } });
  const d = await col.findOne({ _id: insertedId });
  assert.deepEqual(d.meta, { x: 1, y: 2 });
  assert.equal(d.stock, 3);
  assert.deepEqual(d.list, [2, 3]);
  assert.deepEqual(d.tags, ['x']);
  assert.equal(d.k, undefined);
  const none = await col.updateOne({ k: 'zzz' }, { $set: { a: 1 } });
  assert.equal(none.matchedCount, 0);
  const many = await col.updateMany({}, { $set: { done: true } });
  assert.equal(many.matchedCount, 1);
  await assert.rejects(() => col.updateOne({}, { stock: 1 }), /operadores/);
});

test('upsert con $setOnInsert y findOneAndUpdate antes/después', async () => {
  const { db } = freshDb();
  const col = db.collection('rate');
  const r1 = await col.updateOne({ key: 'ip1' }, { $inc: { n: 1 }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  assert.equal(r1.upsertedCount, 1);
  await col.updateOne({ key: 'ip1' }, { $inc: { n: 1 }, $setOnInsert: { createdAt: new Date(0) } }, { upsert: true });
  const row = await col.findOne({ key: 'ip1' });
  assert.equal(row.n, 2);
  assert.notEqual(row.createdAt.getTime(), 0, '$setOnInsert solo al crear');
  const after = await col.findOneAndUpdate({ key: 'ip1' }, { $inc: { n: 5 } }, { returnDocument: 'after' });
  assert.equal(after.n, 7);
  const before = await col.findOneAndUpdate({ key: 'ip1' }, { $inc: { n: 1 } }, { returnDocument: 'before' });
  assert.equal(before.n, 7);
  const created = await col.findOneAndUpdate({ key: 'new' }, { $set: { v: 1 } }, { upsert: true, returnDocument: 'after' });
  assert.equal(created.key, 'new');
});

test('descuento de existencias condicionado: nunca queda en negativo', async () => {
  const { db } = freshDb();
  const foods = db.collection('foods');
  const { insertedId } = await foods.insertOne({ stock: 2 });
  const take = (q) => foods.findOneAndUpdate({ _id: insertedId, stock: { $gte: q } }, { $inc: { stock: -q } }, { returnDocument: 'after' });
  assert.equal((await take(2)).stock, 0);
  assert.equal(await take(1), null);
  assert.equal((await foods.findOne({ _id: insertedId })).stock, 0);
});

test('$expr con $ifNull/$add/$lte para el límite de fiado', async () => {
  const { db } = freshDb();
  const c = db.collection('customers');
  await c.insertOne({ name: 'Ana', balance: 80, creditLimit: 100 });
  await c.insertOne({ name: 'Beto', creditLimit: 50 });
  const canCharge = (amount) => ({ $expr: { $lte: [{ $add: [{ $ifNull: ['$balance', 0] }, amount] }, '$creditLimit'] } });
  assert.deepEqual((await c.find(canCharge(20)).toArray()).map((d) => d.name).sort(), ['Ana', 'Beto']);
  assert.deepEqual((await c.find(canCharge(30)).toArray()).map((d) => d.name), ['Beto']);
});

test('índices únicos: duplicado lanza código 11000; parcial por $type y sparse', async () => {
  const { db } = freshDb();
  const orders = db.collection('orders');
  await orders.createIndex({ tenantId: 1, clientSaleId: 1 }, { unique: true, sparse: true, name: 'tenant_clientSaleId' });
  await orders.insertOne({ tenantId: 't', clientSaleId: 'a' });
  await assert.rejects(() => orders.insertOne({ tenantId: 't', clientSaleId: 'a' }), (e) => e.code === 11000);
  await orders.insertOne({ tenantId: 't' });
  await orders.insertOne({ tenantId: 't' }); // sin clientSaleId: no choca
  const credit = db.collection('credit');
  await credit.createIndex({ tenantId: 1, uniqueKey: 1 }, { unique: true, partialFilterExpression: { uniqueKey: { $type: 'string' } } });
  await credit.insertOne({ tenantId: 't', uniqueKey: 'sale-1' });
  await assert.rejects(() => credit.insertOne({ tenantId: 't', uniqueKey: 'sale-1' }), (e) => e.code === 11000);
  await credit.insertOne({ tenantId: 't', uniqueKey: null });
  await credit.insertOne({ tenantId: 't', uniqueKey: null });
  const sessions = db.collection('sessions');
  await sessions.createIndex({ tokenHash: 1 }, { unique: true });
  const { insertedId } = await sessions.insertOne({ tokenHash: 'h1' });
  await sessions.insertOne({ tokenHash: 'h2' });
  await assert.rejects(() => sessions.updateOne({ _id: insertedId }, { $set: { tokenHash: 'h2' } }), (e) => e.code === 11000);
});

test('TTL: borra documentos vencidos', async () => {
  const { db, store } = freshDb();
  const col = db.collection('sessions');
  await col.insertOne({ k: 'old', expiresAt: new Date(Date.now() - 1000) });
  await col.insertOne({ k: 'new', expiresAt: new Date(Date.now() + 60_000) });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  store.purgeExpired();
  assert.deepEqual((await col.find({}).toArray()).map((d) => d.k), ['new']);
});

test('agregaciones usadas: estadísticas por cliente y último costo por producto', async () => {
  const { db } = freshDb();
  const orders = db.collection('orders');
  const since = new Date('2026-01-10T00:00:00Z');
  await orders.insertMany([
    { tenantId: 't', paymentStatus: 'paid', status: 'paid', customerId: 'c1', total: 10, createdAt: new Date('2026-01-01T00:00:00Z') },
    { tenantId: 't', paymentStatus: 'paid', status: 'paid', customerId: 'c1', total: 15, createdAt: new Date('2026-01-12T00:00:00Z') },
    { tenantId: 't', paymentStatus: 'paid', status: 'cancelled', customerId: 'c1', total: 99, createdAt: new Date('2026-01-12T00:00:00Z') },
    { tenantId: 't', paymentStatus: 'paid', status: 'paid', customerId: '', total: 5, createdAt: new Date('2026-01-12T00:00:00Z') },
  ]);
  const rows = await orders.aggregate([
    { $match: { tenantId: 't', paymentStatus: 'paid', status: { $ne: 'cancelled' }, customerId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$customerId', visits: { $sum: 1 }, spent: { $sum: '$total' }, last: { $max: '$createdAt' }, visits30: { $sum: { $cond: [{ $gte: ['$createdAt', since] }, 1, 0] } } } },
  ]).toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._id, 'c1');
  assert.equal(rows[0].visits, 2);
  assert.equal(rows[0].spent, 25);
  assert.equal(rows[0].visits30, 1);
  assert.equal(rows[0].last.toISOString(), '2026-01-12T00:00:00.000Z');
  const costs = db.collection('cost_history');
  await costs.insertMany([
    { tenantId: 't', foodId: 'f1', cost: 10, createdAt: new Date('2026-01-01T00:00:00Z') },
    { tenantId: 't', foodId: 'f1', cost: 12, createdAt: new Date('2026-01-05T00:00:00Z') },
    { tenantId: 't', foodId: 'f2', cost: 7, createdAt: new Date('2026-01-03T00:00:00Z') },
  ]);
  const last = await costs.aggregate([
    { $match: { tenantId: 't', foodId: { $in: ['f1', 'f2'] } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$foodId', cost: { $first: '$cost' }, createdAt: { $first: '$createdAt' } } },
  ]).toArray();
  const map = Object.fromEntries(last.map((d) => [d._id, d.cost]));
  assert.deepEqual(map, { f1: 12, f2: 7 });
});

test('los datos persisten al cerrar y volver a abrir el archivo', async () => {
  const { db, store, file } = freshDb();
  await db.collection('settings').insertOne({ tenantId: 't', businessName: 'La Esquina' });
  store.close();
  const again = new Db(new Store(file));
  assert.equal((await again.collection('settings').findOne({ tenantId: 't' })).businessName, 'La Esquina');
});

test('operadores desconocidos no se ignoran', async () => {
  const { db } = freshDb();
  const col = db.collection('z');
  await col.insertOne({ a: 1 });
  await assert.rejects(() => col.find({ a: { $where: 'x' } }).toArray(), /no soportado/);
  await assert.rejects(() => col.updateOne({ a: 1 }, { $rename: { a: 'b' } }), /no soportado/);
});
