/**
 * Cuentas de la tienda: desactivar, reactivar y cambiar de rol.
 *
 * Garantías:
 * - Una tienda nunca se queda sin dueño activo, ni con dos dueños que se quitan el acceso a la vez:
 *   después de escribir se vuelve a contar y, si quedó en cero, se deshace el cambio (409).
 * - Todo cambio cierra las sesiones de esa cuenta (refresh tokens revocados y tokenVersion arriba).
 * - Nadie toca cuentas de otra tienda ni su propia cuenta.
 * - Cada cambio queda en la bitácora (activity_log).
 */
const db = require('../database/db');
const sessions = require('./session.service');
const limits = require('./plan-limits.service');
const { TENANT_ROLES, normalizeRole, isPlatformStaff } = require('../models/tenant.model');

class TeamError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const ROLE_NAME = { admin: 'dueño', cashier: 'cajero' };
const nameOf = (u) => `${u.name || ''} ${u.lastName || ''}`.trim() || u.username || u.email || 'la cuenta';

async function loadTarget(tenantId, id) {
  const target = await db.FindUserInTenant(id, tenantId);
  if (!target || isPlatformStaff(target.role)) throw new TeamError(404, 'Cuenta no encontrada');
  return target;
}

function refuseSelf(actor, target, message) {
  if (target.username === actor?.username) throw new TeamError(400, message);
}

async function audit(tenantId, actor, type, message, meta) {
  await db
    .CreateActivityLog({ tenantId, type, message, meta, user: actor?.username || '', createdAt: new Date() })
    .catch(() => {});
}

/**
 * Aplica un cambio que puede quitar un dueño activo y verifica que quede al menos uno.
 * `undo` devuelve la cuenta a como estaba si el cambio dejó a la tienda sin dueño.
 */
async function guardedChange(tenantId, target, patch, undo) {
  const losesAdmin = target.role === 'admin' && !target.disabled;
  if (losesAdmin && (await db.CountActiveAdmins(tenantId)) <= 1) {
    throw new TeamError(400, 'Debe quedar al menos un dueño activo en la tienda.');
  }
  await db.UpdateUserById(String(target._id), patch);
  if (losesAdmin && (await db.CountActiveAdmins(tenantId)) < 1) {
    await db.UpdateUserById(String(target._id), undo);
    throw new TeamError(409, 'Otro cambio al mismo tiempo dejaba la tienda sin dueño. No se aplicó; intenta de nuevo.');
  }
}

async function deactivate({ tenantId, actor, targetId }) {
  const target = await loadTarget(tenantId, targetId);
  refuseSelf(actor, target, 'No puedes desactivar tu propia cuenta.');
  if (target.disabled) return { ok: true, already: true };

  await guardedChange(
    tenantId,
    target,
    { disabled: true, disabledAt: new Date() },
    { disabled: false, disabledAt: null }
  );
  await sessions.revokeAll(target, 'disabled');
  await audit(tenantId, actor, 'user_deactivated', `Desactivó la cuenta de ${nameOf(target)}`, { userId: String(target._id) });
  return { ok: true };
}

async function reactivate({ tenantId, actor, targetId }) {
  const target = await loadTarget(tenantId, targetId);
  if (!target.disabled) return { ok: true, already: true };

  const tenant = await db.GetTenantById(tenantId);
  await limits.assertUserRoom(tenantId, tenant?.plan || 'basic', 1, { includePending: true });
  await db.UpdateUserById(String(target._id), { disabled: false, disabledAt: null, failedLogins: 0, lockedUntil: null });
  // Al volver tiene que iniciar sesión de nuevo, no revivir un token de antes
  await sessions.revokeAll(target, 'reactivated');
  await audit(tenantId, actor, 'user_reactivated', `Reactivó la cuenta de ${nameOf(target)}`, { userId: String(target._id) });
  return { ok: true };
}

async function changeRole({ tenantId, actor, targetId, role }) {
  // Solo los roles vigentes: lo que ya no existe (waiter, kitchen…) se rechaza, no se adivina
  if (typeof role !== 'string' || !TENANT_ROLES.includes(role)) throw new TeamError(400, 'Rol inválido');
  const wanted = role;
  const target = await loadTarget(tenantId, targetId);
  refuseSelf(actor, target, 'No puedes cambiar tu propio rol.');
  if (normalizeRole(target.role) === wanted) return { ok: true, already: true, role: wanted };

  const from = normalizeRole(target.role);
  const demotes = target.role === 'admin' && wanted !== 'admin';
  if (demotes) {
    await guardedChange(tenantId, target, { role: wanted }, { role: target.role });
  } else {
    await db.UpdateUserById(String(target._id), { role: wanted });
  }
  // Su sesión cambia de permisos: que entre otra vez con el rol nuevo
  await sessions.revokeAll(target, 'role_change');
  await audit(
    tenantId,
    actor,
    'user_role_changed',
    `Cambió a ${nameOf(target)} de ${ROLE_NAME[from] || from} a ${ROLE_NAME[wanted]}`,
    { userId: String(target._id), from, to: wanted }
  );
  return { ok: true, role: wanted };
}

module.exports = { TeamError, deactivate, reactivate, changeRole };
