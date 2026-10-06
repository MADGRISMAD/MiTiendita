/**
 * backend/database/Point.db.js
 * Acceso a datos de la integración Point. Es independiente de tus demás funciones de db.js.
 */
const { ObjectId } = require('../utils/objectid');
const db = require('./db');

const TENANTS = 'tenants';
const CHARGES = 'point_charges';

async function database() {
  await db.ensureConnection();
  return { collection: (name) => db.getCollection(name) };
}

const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);
const idFilter = (id) => {
  const o = oid(id);
  return o ? { $or: [{ _id: o }, { _id: String(id) }] } : { _id: String(id) };
};
const out = (doc) => (doc ? { ...doc, id: String(doc._id) } : null);
const unwrap = (r) => (r && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r);

let indexed = false;
async function charges() {
  const col = (await database()).collection(CHARGES);
  if (!indexed) {
    indexed = true;
    col.createIndex({ mpOrderId: 1 }, { unique: true }).catch(() => {});
    col.createIndex({ tenantId: 1, clientSaleId: 1, createdAt: -1 }).catch(() => {});
  }
  return col;
}

// ───────── Tenants ─────────
async function GetTenantById(id) {
  const t = await (await database()).collection(TENANTS).findOne(idFilter(id));
  return out(t);
}
async function UpdateTenant(id, patch) {
  const col = (await database()).collection(TENANTS);
  // Tenants desvinculados antes quedaron con `point: null`: no se puede escribir 'point.x' dentro de null
  if (Object.keys(patch).some((k) => k.startsWith('point.'))) {
    await col.updateOne({ ...idFilter(id), point: null }, { $set: { point: {} } });
  }
  await col.updateOne(idFilter(id), { $set: patch });
}

/** Quita por completo la configuración de la terminal del negocio. */
async function ClearTenantPoint(id) {
  await (await database()).collection(TENANTS).updateOne(idFilter(id), {
    $unset: { point: '' },
    $set: { updatedAt: new Date() },
  });
}

// ───────── Cobros con terminal ─────────
async function CreatePointCharge(doc) {
  const col = await charges();
  const r = await col.insertOne({ ...doc, tenantId: String(doc.tenantId) });
  return out({ ...doc, tenantId: String(doc.tenantId), _id: r.insertedId });
}
async function GetPointCharge(id, tenantId) {
  if (!oid(id)) return null;
  return out(await (await charges()).findOne({ _id: oid(id), tenantId: String(tenantId) }));
}
async function GetPointChargeBySale(clientSaleId, tenantId) {
  const rows = await (await charges())
    .find({ clientSaleId: String(clientSaleId), tenantId: String(tenantId) })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  return out(rows[0]);
}
async function GetPointChargeByMpOrderId(mpOrderId) {
  return out(await (await charges()).findOne({ mpOrderId: String(mpOrderId) }));
}
async function UpdatePointCharge(id, patch, tenantId) {
  const r = await (await charges()).findOneAndUpdate(
    { _id: oid(id), tenantId: String(tenantId) },
    { $set: patch },
    { returnDocument: 'after' }
  );
  return out(unwrap(r));
}
/** Marca el cobro como usado por UNA venta. Devuelve null si ya estaba usado. */
async function ClaimPointCharge(id, tenantId, clientSaleId) {
  const r = await (await charges()).findOneAndUpdate(
    { _id: oid(id), tenantId: String(tenantId), consumedBy: null },
    { $set: { consumedBy: String(clientSaleId), consumedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return out(unwrap(r));
}

module.exports = {
  GetTenantById,
  UpdateTenant,
  ClearTenantPoint,
  CreatePointCharge,
  GetPointCharge,
  GetPointChargeBySale,
  GetPointChargeByMpOrderId,
  UpdatePointCharge,
  ClaimPointCharge,
};