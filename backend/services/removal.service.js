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
 * @param deps { refDb, referrals, col, revokeSessions }  (se inyectan para poder probarlo)
 */
async function removeReferrer(deps, referrerId, confirm, { transferTo = '' } = {}) {
  const { refDb, col } = deps;
  const referrer = await refDb.GetReferrerById(referrerId);
  if (!referrer) throw new RemovalError(404, 'No encontré a ese vendedor.');
  assertConfirm(confirm, referrer.name);

  let transferred = null;
  if (transferTo) {
    // Su historial (comisiones, pagos y tiendas) pasa a otro vendedor: no se pierde nada, ni siquiera lo que aún se le debe
    try {
      transferred = await deps.referrals.transferReferrer({ fromId: referrer.id, toId: transferTo });
    } catch (err) {
      throw new RemovalError(err.status || 400, err.message);
    }
  } else {
    // Sin traspaso, lo que se le debe no se borra: primero hay que liquidarlo (o anular la comisión)
    const sums = await refDb.SumCommissions();
    const pending = sums.filter((s) => s.referrerId === referrer.id && s.status === 'pending').reduce((a, s) => a + s.total, 0);
    if (pending > 0) {
      throw new RemovalError(409, `Tiene $${pending.toFixed(2)} de comisiones por pagar. Págalas (o anúlalas) antes de eliminarlo, o pasa su historial a otro vendedor.`);
    }
  }

  const users = await col('users').find({ partnerId: String(referrer.id) }).toArray();
  for (const u of users) await deps.revokeSessions(u._id);
  const removed = await purge.purgeReferrer(col, referrer.id);
  return { id: String(referrer.id), name: referrer.name, code: referrer.code, removed, transferred };
}

module.exports = { RemovalError, removeReferrer };
