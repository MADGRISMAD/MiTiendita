/**
 * backend/database/stocktake.db.js
 * Acceso a datos del conteo de inventario. Colección `stocktakes` (una por conteo, con sus renglones).
 */
const mongo = require('./mongodb');
const { oid, out } = require('./ids');

const COL = 'stocktakes';

let indexed = false;
async function col() {
  await mongo.ensureConnection();
  const c = mongo.getCollection(COL);
  if (!indexed) {
    indexed = true;
    c.createIndex({ tenantId: 1, createdAt: -1 }).catch(() => {});
  }
  return c;
}

async function Create(doc) {
  const c = await col();
  const r = await c.insertOne(doc);
  return out({ ...doc, _id: r.insertedId });
}
async function List(tenantId, limit = 40) {
  const c = await col();
  const rows = await c
    .find({ tenantId: String(tenantId) }, { projection: { lines: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(out);
}
async function GetById(id, tenantId) {
  const _id = oid(id);
  if (!_id) return null;
  return out(await (await col()).findOne({ _id, tenantId: String(tenantId) }));
}
async function SaveLines(id, tenantId, lines) {
  const _id = oid(id);
  if (!_id) return null;
  await (await col()).updateOne(
    { _id, tenantId: String(tenantId), status: 'open' },
    { $set: { lines, updatedAt: new Date() } }
  );
  return GetById(id, tenantId);
}
/** Cierra el conteo de forma atómica: solo uno gana si dos personas lo aplican a la vez. */
async function Claim(id, tenantId, status, patch = {}) {
  const _id = oid(id);
  if (!_id) return null;
  const r = await (await col()).findOneAndUpdate(
    { _id, tenantId: String(tenantId), status: 'open' },
    { $set: { status, updatedAt: new Date(), ...patch } },
    { returnDocument: 'after' }
  );
  const doc = r && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r;
  return out(doc);
}
async function Patch(id, tenantId, patch) {
  const _id = oid(id);
  if (!_id) return null;
  await (await col()).updateOne({ _id, tenantId: String(tenantId) }, { $set: patch });
  return GetById(id, tenantId);
}

module.exports = { Create, List, GetById, SaveLines, Claim, Patch };
