/**
 * backend/database/cash-cuts.db.js
 * Acceso a datos de los Cortes X (`cash_cuts`) y los datos que el servicio necesita para calcularlos.
 */
const mongo = require('./mongodb');
const creditDb = require('./credit.db');
const { oid, out } = require('./ids');

const CUTS = 'cash_cuts';

let indexed = false;
async function col() {
  await mongo.ensureConnection();
  const c = mongo.getCollection(CUTS);
  if (!indexed) {
    indexed = true;
    c.createIndex({ tenantId: 1, sessionId: 1, createdAt: 1 }).catch(() => {});
    c.createIndex({ tenantId: 1, toUser: 1, status: 1 }).catch(() => {});
  }
  return c;
}

async function insertCut(cut) {
  const doc = { ...cut };
  delete doc.id;
  const r = await (await col()).insertOne({ ...doc, tenantId: String(cut.tenantId) });
  return { ...cut, id: String(r.insertedId) };
}

async function getCut(tenantId, id) {
  const _id = oid(id);
  if (!_id) return null;
  return out(await (await col()).findOne({ _id, tenantId: String(tenantId) }));
}

/** Aplica `patch` solo si el corte sigue en `fromStatus` (evita confirmar dos veces). Devuelve el corte o null. */
async function updateCut(tenantId, id, patch, fromStatus) {
  const _id = oid(id);
  if (!_id) return null;
  const r = await (await col()).findOneAndUpdate(
    { _id, tenantId: String(tenantId), ...(fromStatus ? { status: fromStatus } : {}) },
    { $set: patch },
    { returnDocument: 'after' }
  );
  return out(r && (r.value !== undefined ? r.value : r));
}

async function cutsBySession(tenantId, sessionId) {
  const rows = await (await col()).find({ tenantId: String(tenantId), sessionId: String(sessionId) }).sort({ createdAt: 1 }).toArray();
  return rows.map(out);
}

async function pendingFor(tenantId, username) {
  const rows = await (await col()).find({ tenantId: String(tenantId), toUser: username, status: 'pending' }).sort({ createdAt: 1 }).toArray();
  return rows.map(out);
}

async function listCuts(tenantId, { from, to, registerId, user, status } = {}) {
  const q = { tenantId: String(tenantId) };
  if (from || to) q.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (Number.isInteger(registerId)) q.registerId = registerId;
  if (typeof user === 'string' && user) q.$or = [{ fromUser: user }, { toUser: user }];
  if (typeof status === 'string' && status) q.status = status;
  const rows = await (await col()).find(q).sort({ createdAt: -1 }).toArray();
  return rows.map(out);
}

const findUser = (tenantId, username) => mongo.FindUserByUsername(username, String(tenantId));
const ordersBySession = (tenantId, sessionId) => mongo.GetOrdersByCashSession(String(sessionId), String(tenantId));
const abonosBySession = (tenantId, sessionId) => creditDb.paymentsBySession(tenantId, sessionId);

module.exports = { insertCut, getCut, updateCut, cutsBySession, pendingFor, listCuts, findUser, ordersBySession, abonosBySession };
