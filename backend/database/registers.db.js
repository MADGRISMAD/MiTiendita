/**
 * backend/database/registers.db.js
 * Acceso a datos de las cajas (`registers`): una fila por (tenantId, number).
 */
const mongo = require('./mongodb');

const REGISTERS = 'registers';

let indexed = false;
async function col() {
  await mongo.ensureConnection();
  const c = mongo.getCollection(REGISTERS);
  if (!indexed) {
    indexed = true;
    try {
      await c.createIndex({ tenantId: 1, number: 1 }, { unique: true });
    } catch (err) {
      indexed = false;
      console.error('[cajas] NO se pudo crear el índice único de cajas; revisa la base de datos:', err.message);
    }
  }
  return c;
}

const toRegister = (d) => ({
  number: d.number,
  name: d.name,
  terminalId: d.terminalId || null,
  terminalLabel: d.terminalLabel || null,
  active: d.active !== false,
});

async function ListRegisters(tenantId) {
  const rows = await (await col()).find({ tenantId: String(tenantId) }).sort({ number: 1 }).toArray();
  return rows.map(toRegister);
}

/** Deja exactamente `rows` como las cajas de la tienda (upsert por número y borra las demás). */
async function ReplaceRegisters(tenantId, rows) {
  const c = await col();
  const tid = String(tenantId);
  const now = new Date();
  const ops = rows.map((r) => ({
    replaceOne: { filter: { tenantId: tid, number: r.number }, replacement: { ...toRegister(r), tenantId: tid, updatedAt: now }, upsert: true },
  }));
  ops.push({ deleteMany: { filter: { tenantId: tid, number: { $nin: rows.map((r) => r.number) } } } });
  await c.bulkWrite(ops, { ordered: true });
}

/** Cambia solo la terminal de una caja (`$set` puntual). Devuelve false si la caja no existe. */
async function SetRegisterTerminal(tenantId, number, terminalId, terminalLabel) {
  const r = await (await col()).updateOne(
    { tenantId: String(tenantId), number },
    { $set: { terminalId, terminalLabel, updatedAt: new Date() } }
  );
  return r.matchedCount > 0;
}

module.exports = { ListRegisters, ReplaceRegisters, SetRegisterTerminal };
