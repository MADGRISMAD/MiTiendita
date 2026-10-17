const { verifyToken } = require('../utils/jwt.utils');
const {
  ROLES,
  TENANT_ROLES,
  isPlatformStaff,
  isPartnerRole,
  isOutsideTenant,
} = require('../models/tenant.model');
const sessions = require('../services/session.service');

/**
 * Valida el access token y que siga vigente: misma versión de sesión (se invalida al cambiar
 * la contraseña), cuenta activa y, para el equipo de la plataforma, 2FA activado.
 */
async function requireAuth(req, res, next) {
  const payload = verifyToken(req.headers.authorization || '');
  if (!payload || !payload.userId) {
    return res.status(401).send('No autorizado');
  }

  let role = payload.userRole;
  const isPlatform = isPlatformStaff(role);
  let partnerId = null;
  let linkedOwner = null;

  if (!isOutsideTenant(role) && !payload.tenantId) {
    return res.status(401).send('No autorizado');
  }

  try {
    const state = await sessions.currentUserState(payload.userId);
    // El rol que manda es el de la base (un cambio o la migración de roles viejos aplica de inmediato)
    if (state.exists && state.role && !isPlatform) role = state.role;
    if (!state.exists || state.disabled || (Number(payload.tv) || 0) !== state.tokenVersion) {
      return res.status(401).send('Tu sesión terminó. Vuelve a entrar.');
    }
    // Un rol de socio sin socio (o un rol de tienda que perdió su tienda) no entra
    if (isPartnerRole(role)) {
      partnerId = state.partnerId || null;
      if (!partnerId) return res.status(401).send('Tu sesión terminó. Vuelve a entrar.');
    } else if (!isPlatformStaff(role) && !payload.tenantId) {
      return res.status(401).send('No autorizado');
    }
    // Cuenta técnica de una sucursal: vale solo mientras el dueño siga siendo administrador activo y su
    // sesión sea la misma con la que se emitió este token (si cambia contraseña o rol, todo cae al instante).
    linkedOwner = state.linkedOwner || null;
    if (state.linkedOwner) {
      const owner = await sessions.currentUserState(state.linkedOwner);
      const ok =
        owner.exists &&
        !owner.disabled &&
        owner.role === 'admin' &&
        payload.owner === state.linkedOwner &&
        (Number(payload.otv) || 0) === owner.tokenVersion;
      if (!ok) return res.status(401).send('Tu sesión terminó. Vuelve a entrar.');
    } else if (payload.owner || payload.otv !== undefined) {
      // Una cuenta normal nunca lleva datos de dueño: token fabricado
      return res.status(401).send('Tu sesión terminó. Vuelve a entrar.');
    }
    if (isOutsideTenant(role) && !state.mfaEnabled) {
      return res.status(403).json({
        code: 'MFA_SETUP_REQUIRED',
        message: 'Esta cuenta debe activar la verificación en dos pasos. Vuelve a entrar.',
      });
    }
  } catch (err) {
    console.error('[auth] no se pudo validar la sesión:', err.message);
    return res.status(503).send('No se pudo validar tu sesión. Intenta de nuevo.');
  }

  req.user = {
    username: payload.userId,
    role,
    tenantId: isOutsideTenant(role) ? null : payload.tenantId || null,
    partnerId,
    email: String(payload.email || '').trim().toLowerCase() || null,
    linkedOwner,
  };
  // Las cuentas de socio nunca operan dentro de una tienda
  req.tenantId = isOutsideTenant(role) ? null : payload.tenantId || null;
  req.partnerId = partnerId;
  return next();
}

function requireRoles(...allowed) {
  const list = allowed.length ? allowed : TENANT_ROLES;
  return (req, res, next) => {
    if (!req.user?.role || !list.includes(req.user.role)) {
      return res.status(403).send('Sin permiso para esta acción');
    }
    return next();
  };
}

/** Versión instalable: la tienda opera solo con la licencia de ESTA computadora. */
async function requireLicense(req, res, next) {
  const { status } = require('../services/license.service').state();
  if (status === 'ok') return next();
  const message =
    status === 'none'
      ? 'Activa Mi Tiendita con tu código de licencia.'
      : status === 'other_device'
        ? 'Esta licencia es de otra computadora. Reactívala en línea o contacta a soporte.'
        : 'La licencia de esta computadora no es válida. Reactívala en línea.';
  return res.status(403).json({ code: status === 'none' ? 'LICENSE_REQUIRED' : status === 'other_device' ? 'LICENSE_DEVICE_MISMATCH' : 'LICENSE_INVALID', message });
}

module.exports = {
  requireAuth,
  requireRoles,
  requireLicense,
  ROLES,
  TENANT_ROLES,
};
