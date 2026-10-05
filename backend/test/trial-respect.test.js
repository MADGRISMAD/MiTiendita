process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
process.env.NODE_ENV = 'test';
delete process.env.MP_WEBHOOK_SECRET;
delete process.env.MP_ACCESS_TOKEN;

const test = require('node:test');
const assert = require('node:assert/strict');

const DAY = 86400000;
let tenant;
const events = [];
const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub('../database/mongodb', {
  async GetTenantById() {
    return { ...tenant };
  },
  async GetTenantByMpPreapprovalId(id) {
    return tenant.mpPreapprovalId === id ? { ...tenant } : null;
  },
  async UpdateTenant(id, patch) {
    Object.assign(tenant, patch);
    return { ...tenant };
  },
  async CreateBillingEvent(e) {
    events.push(e);
  },
  async ListTenantAdminEmails() {
    return [];
  },
  async GetSettings() {
    return { businessName: 'Tienda' };
  },
});
const mp = require('../services/mercadopago.service');
mp.getAuthorizedPayment = async (id) => ({ id, status: 'processed', preapproval_id: 'mock_dev_1', transaction_amount: 250 });
const created = [];
const realCreate = mp.createPreapproval;
mp.createPreapproval = async (args) => {
  created.push(args);
  return realCreate(args);
};
const billing = require('../controllers/billing.controller');

const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });

test('suscribirse en plena prueba: la prueba sigue y el primer cobro es hasta que termine', async () => {
  tenant = { id: 't1', plan: 'basic', billingStatus: 'trialing', trialEndsAt: new Date(Date.now() + 9 * DAY), promoEligible: true };
  const r = res();
  await billing.devActivate({ tenantId: 't1', body: { plan: 'growth', interval: 'month' }, user: { username: 'x' } }, r);
  assert.equal(r.code, 200);
  assert.equal(tenant.billingStatus, 'trialing', 'sigue en prueba');
  assert.equal(tenant.subscribedInTrial, true);
  // el periodo pagado empieza cuando termina la prueba, no hoy
  assert.ok(new Date(tenant.currentPeriodEnd).getTime() > new Date(tenant.trialEndsAt).getTime() + 25 * DAY);
  assert.equal(tenant.promo.state, 'pending', 'la promoción espera al primer cobro real');
  assert.equal(tenant.promo.paymentsDone, 0);
});

test('al llegar el primer cobro tras la prueba, la tienda pasa a activa y cuenta la promoción', async () => {
  tenant.mpPreapprovalId = 'mock_dev_1';
  tenant.trialEndsAt = new Date(Date.now() - 1000);
  await billing.webhook({ headers: {}, query: {}, body: { type: 'subscription_authorized_payment', data: { id: '900' } } }, res());
  assert.equal(tenant.billingStatus, 'active');
  assert.equal(tenant.subscribedInTrial, false);
  assert.equal(tenant.promo.state, 'active');
  assert.equal(tenant.promo.paymentsDone, 1);
});

test('si ya no le quedan días de prueba, el cobro empieza de inmediato', async () => {
  tenant = { id: 't2', plan: 'basic', billingStatus: 'trialing', trialEndsAt: new Date(Date.now() - DAY), promoEligible: true };
  const r = res();
  await billing.devActivate({ tenantId: 't2', body: { plan: 'basic', interval: 'month' }, user: { username: 'x' } }, r);
  assert.equal(tenant.billingStatus, 'active');
  assert.equal(tenant.promo.paymentsDone, 1);
});

test('el checkout manda a Mercado Pago los días de prueba que quedan', async () => {
  tenant = { id: 't3', plan: 'basic', billingStatus: 'trialing', trialEndsAt: new Date(Date.now() + 4.2 * DAY), promoEligible: true, mpPayerEmail: 'a@b.mx' };
  const r = res();
  await billing.checkout({ tenantId: 't3', body: { plan: 'growth', interval: 'month', email: 'a@b.mx' }, user: { username: 'x' } }, r);
  assert.equal(created.at(-1).freeTrialDays, 5);
  assert.equal(created.at(-1).amountOverride, 250);
  assert.equal(tenant.subscribedInTrial, true);

  tenant = { id: 't4', plan: 'basic', billingStatus: 'active', billingInterval: 'month' };
  await billing.checkout({ tenantId: 't4', body: { plan: 'pro', interval: 'month', email: 'a@b.mx' }, user: { username: 'x' } }, res());
  assert.equal(created.at(-1).freeTrialDays, 0, 'quien ya paga no recibe prueba otra vez');
});
