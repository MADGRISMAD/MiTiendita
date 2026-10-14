/**
 * backend/database/org.db.js
 * Acceso a datos de sucursales. Una sucursal es una tienda (tenant) como cualquier otra; la organización solo
 * las agrupa bajo un dueño. Aquí se leen y escriben documentos CRUDOS (sin el plan de la matriz encima).
 */
const { ObjectId } = require('mongodb');
const mongo = require('./mongodb');

const ORGS = 'organizations';
const TENANTS = 'tenants';
const USERS = 'users';

const oid = (id) => (ObjectId.isValid(String(id)) && String(new ObjectId(String(id))) === String(id) ? new ObjectId(String(id)) : null);
const out = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) };
};

let indexed = false;
async function col(name) {
  await mongo.ensureConnection();
  const c = mongo.getCollection(name);
  if (name === ORGS && !indexed) {
    indexed = true;
    // Los únicos impiden fundar dos organizaciones a la vez o dos cuentas técnicas para la misma sucursal
    const warn = (what) => (err) => console.error(`[sucursales] no se pudo crear el índice ${what}:`, err.message);
    c.createIndex({ ownerUsername: 1 }, { unique: true }).catch(warn('único de dueño'));
    c.createIndex({ matrixTenantId: 1 }, { unique: true }).catch(warn('único de matriz'));
    mongo.getCollection(TENANTS).createIndex({ organizationId: 1 }, { sparse: true }).catch(warn('de organización'));
    mongo.getCollection(USERS).createIndex({ tenantId: 1, linkedOwner: 1 }, { unique: true, partialFilterExpression: { linkedOwner: { $type: 'string' } } }).catch(warn('único de cuenta de sucursal'));
  }
  return c;
}

async function getRawTenant(id) {
  const _id = oid(id);
  return _id ? out(await (await col(TENANTS)).findOne({ _id })) : null;
}
async function updateRawTenant(id, patch) {
  const _id = oid(id);
  if (!_id) return null;
  await (await col(TENANTS)).updateOne({ _id }, { $set: { ...patch, updatedAt: new Date() } });
  return getRawTenant(id);
}
async function createRawTenant(doc) {
  const r = await (await col(TENANTS)).insertOne(doc);
  return out({ ...doc, _id: r.insertedId });
}
async function deleteRawTenant(id) {
  const _id = oid(id);
  if (_id) await (await col(TENANTS)).deleteOne({ _id });
}

async function getOrgByOwner(ownerUsername) {
  return out(await (await col(ORGS)).findOne({ ownerUsername: String(ownerUsername) }));
}
async function getOrgById(id) {
  const _id = oid(id);
  return _id ? out(await (await col(ORGS)).findOne({ _id })) : null;
}
async function createOrg(doc) {
  const r = await (await col(ORGS)).insertOne(doc);
  return out({ ...doc, _id: r.insertedId });
}
async function updateOrg(id, patch) {
  const _id = oid(id);
  if (_id) await (await col(ORGS)).updateOne({ _id }, { $set: patch });
  return getOrgById(id);
}
async function deleteOrg(id) {
  const _id = oid(id);
  if (_id) await (await col(ORGS)).deleteOne({ _id });
}
async function listOrgTenants(orgId) {
  const rows = await (await col(TENANTS)).find({ organizationId: String(orgId) }).sort({ createdAt: 1 }).toArray();
  return rows.map(out);
}

async function getUserByUsername(username) {
  return (await col(USERS)).findOne({ username: String(username) });
}
async function createUser(doc) {
  const r = await (await col(USERS)).insertOne(doc);
  return { ...doc, _id: r.insertedId };
}
async function findLinkedUser(tenantId, ownerUsername) {
  return (await col(USERS)).findOne({ tenantId: String(tenantId), linkedOwner: String(ownerUsername) });
}
/** El dueño de una tienda es su administrador activo más antiguo (no una cuenta técnica de sucursal). */
async function oldestActiveAdmin(tenantId) {
  const rows = await (await col(USERS))
    .find({ tenantId: String(tenantId), role: 'admin', disabled: { $ne: true }, linkedOwner: { $exists: false } })
    .sort({ _id: 1 })
    .limit(1)
    .toArray();
  return rows[0] || null;
}
/** Cuentas técnicas de sucursal de un dueño (para cerrar sus sesiones cuando el dueño cambia). */
async function listLinkedUsers(ownerUsername) {
  return (await col(USERS)).find({ linkedOwner: String(ownerUsername) }).project({ username: 1 }).toArray();
}
async function deleteUser(id) {
  await (await col(USERS)).deleteOne({ _id: id });
}

/** Ventas por sucursal en un rango. Solo ids que el servidor sacó de la organización del dueño. */
async function salesByTenant(tenantIds, from, to) {
  const ids = tenantIds.map(String);
  const rows = await (await col('orders'))
    .aggregate([
      { $match: { tenantId: { $in: ids }, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$tenantId',
          sales: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, { $ifNull: ['$total', 0] }, 0] } },
          tickets: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] } },
          refundedTotal: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, { $ifNull: ['$total', 0] }, 0] } },
          credit: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', 'paid'] }, { $eq: ['$paymentMethod', 'credit'] }] }, { $ifNull: ['$creditAmount', 0] }, 0] } },
        },
      },
    ])
    .toArray();
  return rows.map((r) => ({ tenantId: String(r._id), sales: r.sales, tickets: r.tickets, refunded: r.refunded, refundedTotal: r.refundedTotal, credit: r.credit }));
}
async function dailySales(tenantIds, from, to, timezone) {
  const ids = tenantIds.map(String);
  const rows = await (await col('orders'))
    .aggregate([
      { $match: { tenantId: { $in: ids }, paymentStatus: 'paid', createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: timezone || 'America/Mexico_City' } }, tenantId: '$tenantId' }, sales: { $sum: { $ifNull: ['$total', 0] } } } },
      { $sort: { '_id.day': 1 } },
    ])
    .toArray();
  return rows.map((r) => ({ day: r._id.day, tenantId: String(r._id.tenantId), sales: r.sales }));
}
async function balanceByTenant(tenantIds) {
  const rows = await (await col('customers'))
    .aggregate([{ $match: { tenantId: { $in: tenantIds.map(String) }, balance: { $gt: 0 } } }, { $group: { _id: '$tenantId', owed: { $sum: '$balance' } } }])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.owed]));
}

module.exports = {
  getRawTenant, updateRawTenant, createRawTenant, deleteRawTenant,
  getOrgByOwner, getOrgById, createOrg, updateOrg, deleteOrg, listOrgTenants,
  getUserByUsername, createUser, findLinkedUser, listLinkedUsers, oldestActiveAdmin, deleteUser,
  salesByTenant, dailySales, balanceByTenant,
};
