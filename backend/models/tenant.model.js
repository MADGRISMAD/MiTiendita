const { ObjectId } = require('mongodb');
const crypto = require('crypto');

const { ALL_PLANS } = require('../services/plans.catalog');

const ROLES = ['admin', 'hosstess', 'waiter', 'kitchen', 'cashier', 'platform_admin'];
const TENANT_ROLES = ['admin', 'hosstess', 'waiter', 'kitchen', 'cashier'];
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
