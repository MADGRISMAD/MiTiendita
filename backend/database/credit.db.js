/**
 * backend/database/credit.db.js
 * Acceso a datos del fiado: libro de movimientos (`credit_entries`) y saldo del cliente (`customers.balance`).
 */
const mongo = require('./mongodb');
const { oid, out } = require('./ids');

const ENTRIES = 'credit_entries';
const CUSTOMERS = 'customers';

const round2 = (n) => Math.round(n * 100) / 100;

let indexed = false;
async function col(name) {
  await mongo.ensureConnection();
  const c = mongo.getCollection(name);
  if (name === ENTRIES && !indexed) {
    indexed = true;
    // `uniqueKey` = "charge:<pedido>" o "void:<pedido>": un solo cargo y una sola anulación por pedido. Eso hace
    // idempotente el reintento de una venta. El índice parcial solo usa $type (soportado en todas las versiones).
    // Si no se pudiera crear, se avisa fuerte: sin él, una venta reenviada podría fiar dos veces.
    try {
      await c.createIndex({ tenantId: 1, uniqueKey: 1 }, { unique: true, partialFilterExpression: { uniqueKey: { $type: 'string' } } });
    } catch (err) {
      indexed = false;
      console.error('[fiado] NO se pudo crear el índice único de cargos; revisa la base de datos:', err.message);
    }
    c.createIndex({ tenantId: 1, customerId: 1, createdAt: -1 }).catch(() => {});
    c.createIndex({ tenantId: 1, cashSessionId: 1, type: 1 }).catch(() => {});
  }
  return c;
}

async function getCustomer(tenantId, id) {
  const _id = oid(id);
  if (!_id) return null;
  return out(await (await col(CUSTOMERS)).findOne({ _id, tenantId: String(tenantId) }));
}

async function addEntry(entry) {
  const c = await col(ENTRIES);
  const doc = { ...entry, tenantId: String(entry.tenantId), customerId: String(entry.customerId), createdAt: new Date() };
  if ((entry.type === 'charge' || entry.type === 'void') && entry.orderId) doc.uniqueKey = `${entry.type}:${entry.orderId}`;
  const r = await c.insertOne(doc);
  return out({ ...doc, _id: r.insertedId });
}
async function removeEntry(tenantId, { orderId, type }) {
  const r = await (await col(ENTRIES)).deleteOne({ tenantId: String(tenantId), orderId: String(orderId), type });
  return r.deletedCount > 0;
}

/**
 * Mueve el saldo del cliente de forma atómica.
 *  - enforceLimit: solo si saldo + delta <= límite y el cliente tiene límite > 0.
 *  - requireOwed: solo si el saldo actual cubre ese monto (abonos).
 * Devuelve el cliente ya actualizado o null si la condición no se cumplió.
 */
async function incBalance(tenantId, customerId, delta, { enforceLimit = false, requireOwed = 0 } = {}) {
  const _id = oid(customerId);
  if (!_id) return null;
  const filter = { _id, tenantId: String(tenantId) };
  const and = [];
  if (enforceLimit) {
    and.push({ creditLimit: { $gt: 0 } });
    and.push({ $expr: { $lte: [{ $add: [{ $ifNull: ['$balance', 0] }, delta] }, '$creditLimit'] } });
  }
  if (requireOwed) and.push({ $expr: { $gte: [{ $add: [{ $ifNull: ['$balance', 0] }, 0.0049] }, requireOwed] } });
  if (and.length) filter.$and = and;
  const r = await (await col(CUSTOMERS)).findOneAndUpdate(
    filter,
    { $inc: { balance: round2(delta) }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const doc = r && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r;
  if (!doc) return null;
  // Evita acumular errores de punto flotante en el saldo
  const fixed = round2(Number(doc.balance) || 0);
  if (fixed !== doc.balance) await (await col(CUSTOMERS)).updateOne({ _id }, { $set: { balance: fixed } });
  return { ...out(doc), balance: fixed };
}

async function listEntries(tenantId, customerId, limit = 150) {
  const rows = await (await col(ENTRIES))
    .find({ tenantId: String(tenantId), customerId: String(customerId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(out);
}
async function allEntriesForCustomers(tenantId, customerIds) {
  if (!customerIds.length) return [];
  const rows = await (await col(ENTRIES))
    .find({ tenantId: String(tenantId), customerId: { $in: customerIds.map(String) } })
    .sort({ createdAt: 1 })
    .toArray();
  return rows.map(out);
}
async function paymentsBySession(tenantId, sessionId) {
  const rows = await (await col(ENTRIES)).find({ tenantId: String(tenantId), cashSessionId: String(sessionId), type: 'payment' }).toArray();
  return rows.map(out);
}
async function customersWithBalance(tenantId) {
  const rows = await (await col(CUSTOMERS))
    .find({ tenantId: String(tenantId), balance: { $gt: 0 } })
    .sort({ balance: -1 })
    .toArray();
  return rows.map(out);
}
async function setLimit(tenantId, customerId, limit) {
  const _id = oid(customerId);
  if (!_id) return null;
  const c = await col(CUSTOMERS);
  await c.updateOne({ _id, tenantId: String(tenantId) }, { $set: { creditLimit: round2(limit), updatedAt: new Date() } });
  return out(await c.findOne({ _id, tenantId: String(tenantId) }));
}

module.exports = { getCustomer, addEntry, removeEntry, incBalance, listEntries, allEntriesForCustomers, paymentsBySession, customersWithBalance, setLimit };
