/**
 * Eliminar un vendedor desde el panel de la plataforma (solo los socios). Siempre hay que escribir el nombre exacto.
 */
const purge = require('../database/entity-purge');

class RemovalError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

function assertConfirm(confirm, name) {
  if (norm(confirm) !== norm(name)) throw new RemovalError(400, `Para eliminar escribe exactamente: ${name}`);
}

/**
 * @param deps { refDb, col, revokeSessions }  (se inyectan para poder probarlo)
 */
async function removeReferrer(deps, referrerId, confirm) {
  const { refDb, col } = deps;
  const referrer = await refDb.GetReferrerById(referrerId);
  if (!referrer) throw new RemovalError(404, 'No encontré a ese vendedor.');
  assertConfirm(confirm, referrer.name);

  // Lo que se le debe no se borra: primero hay que liquidarlo (o anular la comisión)
  const sums = await refDb.SumCommissions();
  const pending = sums.filter((s) => s.referrerId === referrer.id && s.status === 'pending').reduce((a, s) => a + s.total, 0);
  if (pending > 0) {
    throw new RemovalError(409, `Tiene $${pending.toFixed(2)} de comisiones por pagar. Págalas (o anúlalas) antes de eliminarlo.`);
  }

  const users = await col('users').find({ partnerId: String(referrer.id) }).toArray();
  for (const u of users) await deps.revokeSessions(u._id);
  const removed = await purge.purgeReferrer(col, referrer.id);
  return { id: String(referrer.id), name: referrer.name, code: referrer.code, removed };
}

module.exports = { RemovalError, removeReferrer };
