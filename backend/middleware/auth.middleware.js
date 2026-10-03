const { verifyToken } = require('../utils/jwt.utils');
const {
  ROLES,
  TENANT_ROLES,
  isPlatformStaff,
  isSubscriptionActive,
} = require('../models/tenant.model');
const db = require('../database/mongodb');
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

  if (!isPlatform && !payload.tenantId) {
    return res.status(401).send('No autorizado');
  }

  try {
    const state = await sessions.currentUserState(payload.userId);
    // El rol que manda es el de la base (un cambio o la migración de roles viejos aplica de inmediato)
    if (state.exists && state.role && !isPlatform) role = state.role;
    if (!state.exists || state.disabled || (Number(payload.tv) || 0) !== state.tokenVersion) {
      return res.status(401).send('Tu sesión terminó. Vuelve a entrar.');
    }
    if (isPlatform && !state.mfaEnabled) {
      return res.status(403).json({
        code: 'MFA_SETUP_REQUIRED',
        message: 'El equipo de Mi Tiendita debe activar la verificación en dos pasos. Vuelve a entrar.',
      });
    }
  } catch (err) {
    console.error('[auth] no se pudo validar la sesión:', err.message);
    return res.status(503).send('No se pudo validar tu sesión. Intenta de nuevo.');
  }

  req.user = {
    username: payload.userId,
    role,
    tenantId: payload.tenantId || null,
    email: String(payload.email || '').trim().toLowerCase() || null,
  };
  req.tenantId = payload.tenantId || null;
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

async function requireActiveSubscription(req, res, next) {
  try {
    if (isPlatformStaff(req.user?.role)) return next();
    if (!req.tenantId) {
      return res.status(403).json({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Suscripción requerida',
      });
    }

    const tenant = await db.GetTenantById(req.tenantId);
    if (!tenant) {
      return res.status(403).json({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Negocio no encontrado',
      });
    }

    if (!isSubscriptionActive(tenant)) {
      return res.status(403).json({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Tu prueba o suscripción no está activa. Ve a Facturación.',
        billingStatus: tenant.billingStatus,
        trialEndsAt: tenant.trialEndsAt,
        plan: tenant.plan,
      });
    }

    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error de suscripción');
  }
}

module.exports = {
  requireAuth,
  requireRoles,
  requireActiveSubscription,
  ROLES,
  TENANT_ROLES,
};
