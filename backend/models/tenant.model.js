const { ObjectId } = require('mongodb');
const crypto = require('crypto');

const { ALL_PLANS } = require('../services/plans.catalog');

const PLATFORM_ROLES = ['platform_admin', 'platform_support'];
// Socios (vendedores/proveedores de Mi Tiendita): el dueño del socio y sus trabajadores
const PARTNER_ROLES = ['partner_admin', 'partner_staff'];
// Una tienda solo tiene dueño (admin) y cajeros. Los roles de restaurante ya no existen.
const TENANT_ROLES = ['admin', 'cashier'];
const ROLES = [...TENANT_ROLES, ...PLATFORM_ROLES, ...PARTNER_ROLES];
const LEGACY_ROLES = ['hosstess', 'waiter', 'kitchen'];

/** Rol vigente de una cuenta: los roles de restaurante pasan a cajero. */
function normalizeRole(role) {
  const r = String(role || '');
  return LEGACY_ROLES.includes(r) ? 'cashier' : r;
}

function isPlatformStaff(role) {
  return PLATFORM_ROLES.includes(String(role || ''));
}

function isPartnerRole(role) {
  return PARTNER_ROLES.includes(String(role || ''));
}

/** Cuentas que no pertenecen a una tienda: ven datos de muchas, así que la 2FA es obligatoria. */
function isOutsideTenant(role) {
  return isPlatformStaff(role) || isPartnerRole(role);
}
const PLANS = ALL_PLANS;
const PUBLIC_PLANS = ['basic', 'growth', 'pro'];
const BILLING_STATUSES = ['trialing', 'active', 'past_due', 'suspended'];
const TRIAL_DAYS = 14;

function trialEndsFrom(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d;
}

function createTenantDoc(name = 'Mi negocio') {
  const now = new Date();
  return {
    name,
    plan: 'basic',
    billingStatus: 'trialing',
    billingInterval: 'month',
    trialEndsAt: trialEndsFrom(now),
    mpPreapprovalId: null,
    mpPayerEmail: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    suspendedAt: null,
    suspendedReason: null,
    // Promoción de lanzamiento: solo las tiendas que se crean ahora (las existentes no la tienen)
    promoEligible: true,
    createdAt: now,
    updatedAt: now,
  };
}

function isSubscriptionActive(tenant) {
  if (!tenant) return false;
  const status = tenant.billingStatus || 'trialing';
  if (status === 'suspended' || status === 'past_due') return false;
  if (tenant.plan === 'perpetual') return true;
  if (tenant.cancelAtPeriodEnd && tenant.currentPeriodEnd) {
    if (new Date(tenant.currentPeriodEnd).getTime() <= Date.now()) return false;
  }
  if (status === 'active') return true;
  if (status === 'trialing') {
    const ends = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
    return ends && ends.getTime() > Date.now();
  }
  return false;
}

function newResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  ROLES,
  TENANT_ROLES,
  LEGACY_ROLES,
  normalizeRole,
  PLATFORM_ROLES,
  isPlatformStaff,
  PARTNER_ROLES,
  isPartnerRole,
  isOutsideTenant,
  PLANS,
  PUBLIC_PLANS,
  BILLING_STATUSES,
  TRIAL_DAYS,
  createTenantDoc,
  trialEndsFrom,
  isSubscriptionActive,
  newResetToken,
  ObjectId,
};
