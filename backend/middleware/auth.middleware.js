const { verifyToken } = require('../utils/jwt.utils');
const {
  ROLES,
  TENANT_ROLES,
  isPlatformStaff,
  isSubscriptionActive,
} = require('../models/tenant.model');
const db = require('../database/mongodb');

function requireAuth(req, res, next) {
  const payload = verifyToken(req.headers.authorization || '');
  if (!payload || !payload.userId) {
    return res.status(401).send('No autorizado');
  }

  const role = payload.userRole;
  const isPlatform = isPlatformStaff(role);

  if (!isPlatform && !payload.tenantId) {
    return res.status(401).send('No autorizado');
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
