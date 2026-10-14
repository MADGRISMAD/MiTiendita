const test = require('node:test');
const assert = require('node:assert/strict');
const { isSubscriptionActive, graceEndsAt, GRACE_DAYS } = require('../models/tenant.model');
const { noticeDue, sendDue } = require('../services/dunning.service');

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n, now = Date.now()) => new Date(now - n * DAY);

test('pago atrasado: la tienda sigue operando durante la gracia y se bloquea al terminar', () => {
  assert.equal(GRACE_DAYS, 7);
  assert.equal(isSubscriptionActive({ billingStatus: 'past_due', pastDueSince: daysAgo(0) }), true);
  assert.equal(isSubscriptionActive({ billingStatus: 'past_due', pastDueSince: daysAgo(6.5) }), true);
  assert.equal(isSubscriptionActive({ billingStatus: 'past_due', pastDueSince: daysAgo(7.1) }), false);
});

test('pago atrasado sin fecha (datos viejos) o suspendido: bloquea como antes', () => {
  assert.equal(isSubscriptionActive({ billingStatus: 'past_due' }), false);
  assert.equal(isSubscriptionActive({ billingStatus: 'suspended', pastDueSince: daysAgo(1) }), false);
  assert.equal(graceEndsAt({ billingStatus: 'active', pastDueSince: daysAgo(1) }), null);
});

test('los demás estados no cambian', () => {
  assert.equal(isSubscriptionActive({ billingStatus: 'active' }), true);
  assert.equal(isSubscriptionActive({ billingStatus: 'trialing', trialEndsAt: new Date(Date.now() + DAY) }), true);
  assert.equal(isSubscriptionActive({ billingStatus: 'trialing', trialEndsAt: daysAgo(1) }), false);
  assert.equal(isSubscriptionActive({ plan: 'perpetual', billingStatus: 'active' }), true);
});

test('avisos: día 0, 3 y 6, cada uno una sola vez', () => {
  const now = new Date();
  const t = (n, sent = []) => ({ billingStatus: 'past_due', pastDueSince: daysAgo(n + 0.1, now.getTime()), dunningSent: sent });
  assert.deepEqual(noticeDue(t(0), now), { day: 0, daysLeft: 7 });
  assert.equal(noticeDue(t(1, [0]), now), null);
  assert.deepEqual(noticeDue(t(3, [0]), now), { day: 3, daysLeft: 4 });
  assert.deepEqual(noticeDue(t(6, [0, 3]), now), { day: 6, daysLeft: 1 });
  assert.equal(noticeDue(t(6, [0, 3, 6]), now), null);
  assert.equal(noticeDue(t(8), now), null); // la gracia terminó
  assert.equal(noticeDue({ billingStatus: 'active', pastDueSince: daysAgo(1) }, now), null);
});

test('si el servidor estuvo caído, manda solo el aviso vigente', () => {
  const now = new Date();
  assert.deepEqual(noticeDue({ billingStatus: 'past_due', pastDueSince: daysAgo(4, now.getTime()), dunningSent: [] }, now), { day: 3, daysLeft: 3 });
});

function fakeDunningDb(tenant) {
  return {
    async ListTenants() { return [tenant]; },
    async GetSettings() { return { businessName: 'La Esquina' }; },
    // Igual que la base: solo reserva si el aviso aún no está en la lista
    async ClaimDunningNotice(_id, day) {
      if ((tenant.dunningSent || []).includes(day)) return false;
      tenant.dunningSent = [...(tenant.dunningSent || []), day];
      return true;
    },
    async ReleaseDunningNotice(_id, day) { tenant.dunningSent = (tenant.dunningSent || []).filter((d) => d !== day); },
  };
}

test('sendDue: manda el correo, lo registra y no lo repite; si falla, libera para reintentar', async () => {
  const tenant = { id: 't1', name: 'La Esquina', billingStatus: 'past_due', pastDueSince: daysAgo(0.2), dunningSent: [] };
  const db = fakeDunningDb(tenant);
  const sent = [];
  const mail = { async sendPaymentFailedEmail(o) { sent.push(o); return { sent: true }; } };
  const deps = { emailFor: async () => 'dueno@x.com' };
  assert.equal(await sendDue(db, mail, deps), 1);
  assert.equal(await sendDue(db, mail, deps), 0);
  assert.equal(sent[0].to, 'dueno@x.com');
  assert.equal(sent[0].daysLeft, 7);
  assert.deepEqual(tenant.dunningSent, [0]);

  tenant.dunningSent = [];
  const boom = { async sendPaymentFailedEmail() { throw new Error('smtp'); } };
  assert.equal(await sendDue(db, boom, deps), 0);
  assert.deepEqual(tenant.dunningSent, []); // se liberó: se reintenta
});

test('dos instancias a la vez: el aviso sale una sola vez', async () => {
  const tenant = { id: 't1', name: 'La Esquina', billingStatus: 'past_due', pastDueSince: daysAgo(0.2), dunningSent: [] };
  const db = fakeDunningDb(tenant);
  let n = 0;
  const mail = { async sendPaymentFailedEmail() { n += 1; await new Promise((r) => setTimeout(r, 10)); return { sent: true }; } };
  const deps = { emailFor: async () => 'dueno@x.com' };
  const total = (await Promise.all([sendDue(db, mail, deps), sendDue(db, mail, deps)])).reduce((a, b) => a + b, 0);
  assert.equal(total, 1);
  assert.equal(n, 1);
});
