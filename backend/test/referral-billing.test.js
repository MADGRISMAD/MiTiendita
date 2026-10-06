process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
process.env.NODE_ENV = 'test';
delete process.env.MP_WEBHOOK_SECRET;

const test = require('node:test');
const assert = require('node:assert/strict');

const events = [];
const credited = [];
const tenant = { id: 't1', name: 'Tienda Uno', plan: 'growth', billingInterval: 'month', billingStatus: 'active', referrerId: 'r1', mpPreapprovalId: 'pre1' };

const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub('../database/db', {
  async GetTenantByMpPreapprovalId(id) {
    return id === 'pre1' ? { ...tenant } : null;
  },
  async CreateBillingEvent(e) {
    events.push(e);
    return e;
  },
});
const mp = require('../services/mercadopago.service');
mp.getAuthorizedPayment = async (id) => ({ id, status: id === '999' ? 'scheduled' : 'processed', preapproval_id: 'pre1', transaction_amount: 599 });
mp.getPreapproval = async () => {
  throw new Error('un cobro recurrente no debe leerse como suscripción');
};
stub('../services/referral.service', {
  ReferralError: class extends Error {},
  async recordPayment(args) {
    credited.push(args);
    return { id: 'c1' };
  },
});

const billing = require('../controllers/billing.controller');

async function webhook(body) {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await billing.webhook({ headers: {}, query: {}, body }, res);
  return res;
}

test('cobro recurrente procesado: guarda el evento y acredita al vendedor con clave única', async () => {
  const r = await webhook({ type: 'subscription_authorized_payment', data: { id: '555' } });
  assert.equal(r.code, 200);
  assert.equal(credited.length, 1);
  assert.equal(credited[0].amount, 599);
  assert.equal(credited[0].key, 'ap:555');
  assert.equal(credited[0].source, 'authorized_payment');
  assert.equal(events.at(-1).type, 'payment');
});

test('cobro que aún no se procesa no genera comisión', async () => {
  const before = credited.length;
  await webhook({ type: 'subscription_authorized_payment', data: { id: '999' } });
  assert.equal(credited.length, before);
});
