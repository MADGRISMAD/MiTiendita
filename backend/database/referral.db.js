/**
 * Acceso a datos de vendedores (referidos), sus comisiones y liquidaciones.
 * Colecciones: referrers, referral_commissions, referral_payouts. La tienda guarda referrerId/referralCode.
 */
const { ObjectId } = require('mongodb');
const mongo = require('./mongodb');

const oid = (id) => (ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);
const out = (doc) => (doc ? { ...doc, id: String(doc._id) } : null);
const unwrap = (r) => (r && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r);

let indexed = false;
async function col(name) {
  await mongo.ensureConnection();
  if (!indexed) {
    indexed = true;
    mongo.getCollection('referrers').createIndex({ code: 1 }, { unique: true }).catch(() => {});
    mongo.getCollection('referral_commissions').createIndex({ key: 1 }, { unique: true }).catch(() => {});
    mongo.getCollection('referral_commissions').createIndex({ referrerId: 1, status: 1, createdAt: -1 }).catch(() => {});
    mongo.getCollection('tenants').createIndex({ referrerId: 1 }, { sparse: true }).catch(() => {});
  }
  return mongo.getCollection(name);
}

// ───────── Vendedores ─────────
async function CreateReferrer(doc) {
  const r = await (await col('referrers')).insertOne(doc);
  return out({ ...doc, _id: r.insertedId });
}
async function GetReferrerById(id) {
  const o = oid(id);
  return o ? out(await (await col('referrers')).findOne({ _id: o })) : null;
}
async function GetReferrerByCode(code) {
  return out(await (await col('referrers')).findOne({ code: String(code) }));
}
async function GetReferrerByEmail(email) {
  return out(await (await col('referrers')).findOne({ email: String(email).toLowerCase() }));
}
/** El vendedor ligado a la cuenta de un dueño de la plataforma (por el correo de la cuenta). */
async function GetReferrerByOwnerEmail(email) {
  return out(await (await col('referrers')).findOne({ ownerEmail: String(email).toLowerCase() }));
}
async function DeleteReferrer(id) {
  const o = oid(id);
  if (o) await (await col('referrers')).deleteOne({ _id: o });
}
async function ListReferrers() {
  const rows = await (await col('referrers')).find({}).sort({ createdAt: -1 }).toArray();
  return rows.map(out);
}
async function UpdateReferrer(id, patch) {
  const o = oid(id);
  if (!o) return null;
  const r = await (await col('referrers')).findOneAndUpdate(
    { _id: o },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return out(unwrap(r));
}

// ───────── Tiendas referidas ─────────
async function ListTenantsByReferrer(referrerId) {
  const rows = await (await col('tenants')).find({ referrerId: String(referrerId) }).sort({ referredAt: -1 }).toArray();
  return rows.map(out);
}
async function ListReferredTenants() {
  const rows = await (await col('tenants')).find({ referrerId: { $exists: true, $ne: null } }).toArray();
  return rows.map(out);
}

// ───────── Comisiones ─────────
/** Inserta la comisión. Devuelve null si ya existía esa clave (el mismo cobro llegó dos veces). */
async function InsertCommission(doc) {
  try {
    const r = await (await col('referral_commissions')).insertOne(doc);
    return out({ ...doc, _id: r.insertedId });
  } catch (err) {
    if (err && err.code === 11000) return null;
    throw err;
  }
}
async function GetCommission(id) {
  const o = oid(id);
  return o ? out(await (await col('referral_commissions')).findOne({ _id: o })) : null;
}
async function FindCommissionByKey(key) {
  return out(await (await col('referral_commissions')).findOne({ key: String(key) }));
}
async function ListCommissions({ referrerId, tenantId, status, limit = 200 } = {}) {
  const filter = {};
  if (referrerId) filter.referrerId = String(referrerId);
  if (tenantId) filter.tenantId = String(tenantId);
  if (status) filter.status = status;
  const rows = await (await col('referral_commissions'))
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(1000, Math.max(1, Number(limit) || 200)))
    .toArray();
  return rows.map(out);
}
async function UpdateCommission(id, patch, onlyIfStatus) {
  const o = oid(id);
  if (!o) return null;
  const filter = { _id: o };
  if (onlyIfStatus) filter.status = onlyIfStatus;
  const r = await (await col('referral_commissions')).findOneAndUpdate(filter, { $set: patch }, { returnDocument: 'after' });
  return out(unwrap(r));
}
/** Tiendas distintas del vendedor con al menos un cobro que cuenta. */
async function CountClosedTenants(referrerId) {
  const ids = await (await col('referral_commissions')).distinct('tenantId', {
    referrerId: String(referrerId),
    status: { $ne: 'void' },
  });
  return ids.length;
}
async function ListPayingTenantIds(referrerId) {
  return (await col('referral_commissions')).distinct('tenantId', { referrerId: String(referrerId), status: { $ne: 'void' } });
}
/** Totales por vendedor y estado: [{ referrerId, status, total, count }] */
async function SumCommissions() {
  const rows = await (await col('referral_commissions'))
    .aggregate([
      { $group: { _id: { referrerId: '$referrerId', status: '$status' }, total: { $sum: '$commission' }, count: { $sum: 1 } } },
    ])
    .toArray();
  return rows.map((r) => ({ referrerId: r._id.referrerId, status: r._id.status, total: r.total, count: r.count }));
}

/** Comisiones generadas en un rango de fechas (sin las anuladas): pendientes, pagadas y cuántas. */
async function SumCommissionsBetween(referrerId, from, to) {
  const rows = await (await col('referral_commissions'))
    .aggregate([
      { $match: { referrerId: String(referrerId), status: { $ne: 'void' }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$status', total: { $sum: '$commission' }, count: { $sum: 1 } } },
    ])
    .toArray();
  const get = (status) => rows.find((r) => r._id === status) || { total: 0, count: 0 };
  return { pending: get('pending').total, paid: get('paid').total, count: rows.reduce((n, r) => n + r.count, 0) };
}

/** Comisiones del rango (sin las anuladas), por vendedor: pendientes, pagadas y cuántas. */
async function SumCommissionsByReferrerBetween(from, to) {
  const rows = await (await col('referral_commissions'))
    .aggregate([
      { $match: { status: { $ne: 'void' }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: { referrerId: '$referrerId', status: '$status' }, total: { $sum: '$commission' }, count: { $sum: 1 } } },
    ])
    .toArray();
  const byId = new Map();
  for (const r of rows) {
    const cur = byId.get(r._id.referrerId) || { referrerId: r._id.referrerId, pending: 0, paid: 0, count: 0 };
    if (r._id.status === 'paid') cur.paid += r.total;
    else cur.pending += r.total;
    cur.count += r.count;
    byId.set(r._id.referrerId, cur);
  }
  return [...byId.values()];
}

/** Comisiones (sin las anuladas) de vendedores que ya no existen, agrupadas por tienda y vendedor de origen. */
async function ListOrphanCommissionGroups() {
  const ids = (await (await col('referrers')).find({}).project({ _id: 1 }).toArray()).map((r) => String(r._id));
  const rows = await (await col('referral_commissions'))
    .aggregate([
      { $match: { status: { $ne: 'void' }, referrerId: { $nin: ids } } },
      {
        $group: {
          _id: { tenantId: '$tenantId', referrerId: '$referrerId', status: '$status' },
          code: { $first: '$referrerCode' },
          businessName: { $first: '$businessName' },
          total: { $sum: '$commission' },
          count: { $sum: 1 },
          firstAt: { $min: '$createdAt' },
        },
      },
    ])
    .toArray();
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r._id.tenantId}|${r._id.referrerId}`;
    const cur = byKey.get(key) || { tenantId: r._id.tenantId, referrerId: r._id.referrerId, code: r.code || '', businessName: r.businessName || '', pending: 0, paid: 0, count: 0, firstAt: r.firstAt };
    if (r._id.status === 'paid') cur.paid += r.total;
    else cur.pending += r.total;
    cur.count += r.count;
    if (r.firstAt < cur.firstAt) cur.firstAt = r.firstAt;
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}

/** Pasa comisiones de un vendedor a otro (queda anotado de quién venían). Devuelve cuántas se movieron. */
async function ReassignCommissions(filter, to, fromId) {
  const res = await (await col('referral_commissions')).updateMany(filter, {
    $set: { referrerId: String(to.id), referrerCode: to.code, reassignedFrom: String(fromId), reassignedAt: new Date() },
  });
  return res.modifiedCount;
}
async function ReassignPayouts(fromId, toId) {
  return (await (await col('referral_payouts')).updateMany({ referrerId: String(fromId) }, { $set: { referrerId: String(toId) } })).modifiedCount;
}
async function ReassignTenants(fromId, to) {
  return (await (await col('tenants')).updateMany({ referrerId: String(fromId) }, { $set: { referrerId: String(to.id), referralCode: to.code } })).modifiedCount;
}

// ───────── Liquidaciones ─────────
async function CreatePayout(doc) {
  const r = await (await col('referral_payouts')).insertOne(doc);
  return out({ ...doc, _id: r.insertedId });
}
async function ListPayouts(referrerId, limit = 50) {
  const rows = await (await col('referral_payouts'))
    .find({ referrerId: String(referrerId) })
    .sort({ paidAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(out);
}
/** Marca como pagadas las comisiones pendientes del vendedor. Devuelve las que pasaron a pagadas. */
async function MarkPendingPaid(referrerId, payoutId, paidAt) {
  const c = await col('referral_commissions');
  const pending = await c.find({ referrerId: String(referrerId), status: 'pending' }).toArray();
  const done = [];
  for (const row of pending) {
    const r = await c.findOneAndUpdate(
      { _id: row._id, status: 'pending' },
      { $set: { status: 'paid', paidAt, payoutId: String(payoutId) } },
      { returnDocument: 'after' }
    );
    if (unwrap(r)) done.push(out(unwrap(r)));
  }
  return done;
}

module.exports = {
  CreateReferrer, DeleteReferrer, GetReferrerById, GetReferrerByCode, GetReferrerByEmail, GetReferrerByOwnerEmail, ListReferrers, UpdateReferrer,
  ListTenantsByReferrer, ListReferredTenants,
  InsertCommission, GetCommission, FindCommissionByKey, ListCommissions, UpdateCommission,
  CountClosedTenants, ListPayingTenantIds, SumCommissions, SumCommissionsBetween, SumCommissionsByReferrerBetween,
  ListOrphanCommissionGroups, ReassignCommissions, ReassignPayouts, ReassignTenants,
  CreatePayout, ListPayouts, MarkPendingPaid,
};
