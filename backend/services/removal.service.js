/**
 * Eliminar una tienda o un vendedor desde el panel de la plataforma (solo los socios). Siempre hay que escribir el nombre exacto.
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
 * @param deps { db, mp, refDb, referrals, col, revokeSessions, audit }  (se inyectan para poder probarlo)
 */
async function removeTenant(deps, tenantId, confirm) {
  const { db, mp, col } = deps;
  const tenant = await db.GetTenantById(tenantId);
  if (!tenant) throw new RemovalError(404, 'No encontré esa tienda.');
  if (tenant.isBranch) throw new RemovalError(409, 'Es una sucursal: se elimina desde su matriz.');
  const settings = await db.GetSettings(tenant.id);
  const name = settings?.businessName || tenant.name || 'Sin nombre';
  assertConfirm(confirm, name);

  // Una matriz con sucursales no se borra de golpe: cada sucursal es una tienda con sus propios datos
  const all = await db.ListTenants({ includeBranches: true });
  const branches = all.filter((t) => t.isBranch && String(t.matrixTenantId) === String(tenant.id));
  if (branches.length) {
    throw new RemovalError(409, `Esta tienda tiene ${branches.length} ${branches.length === 1 ? 'sucursal' : 'sucursales'}. Elimínalas primero.`);
  }

  // Si tiene suscripción en Mercado Pago hay que cancelarla ANTES: si no, seguirían cobrándole a una tienda que ya no existe
  if (tenant.mpPreapprovalId) {
    try {
      await mp.cancelPreapproval(tenant.mpPreapprovalId);
    } catch (err) {
      throw new RemovalError(502, `No pude cancelar su suscripción de Mercado Pago, así que no se eliminó nada (${err.message || 'error'}). Intenta de nuevo.`);
    }
  }

  const users = await db.ListUsersByTenant(tenant.id);
  for (const u of users) await deps.revokeSessions(u.id || u._id);
  const removed = await purge.purgeTenant(col, tenant.id);
  return { id: String(tenant.id), name, removed };
}

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

module.exports = { RemovalError, removeTenant, removeReferrer };
