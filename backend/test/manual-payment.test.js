const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/mongodb');
const platform = require('../controllers/platform.controller');
const promoSvc = require('../services/promo.service');

function run(tenant, body) {
  const calls = { events: [], updates: [] };
  db.GetTenantById = async () => tenant;
  db.CreateBillingEvent = async (e) => { calls.events.push(e); return e; };
  db.UpdateTenant = async (_id, patch) => { calls.updates.push(patch); };
  db.CreateAuditLog = async () => {};
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = b; return this; } };
  const req = { params: { id: 't1' }, body, user: { username: 'admin' }, headers: {}, ip: '127.0.0.1' };
  return platform.manualPayment(req, res).then(() => ({ res, calls }));
}

const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const day = (d) => new Date(d).toISOString().slice(0, 10);

test('el pago por 3 meses activa la tienda y extiende el periodo desde hoy si ya venció', async () => {
  const { res, calls } = await run({ id: 't1', plan: 'pro', billingStatus: 'suspended', currentPeriodEnd: new Date(Date.now() - 864e5 * 10) }, { amount: 5697, months: 3, note: 'SPEI 123' });
  assert.equal(res.code, 201);
  assert.equal(calls.events[0].months, 3);
  assert.equal(calls.updates[0].billingStatus, 'active');
  assert.equal(calls.updates[0].suspendedAt, null);
  assert.equal(day(calls.updates[0].currentPeriodEnd), day(addMonths(new Date(), 3)));
});

test('si aún tiene periodo pagado, los meses se suman al final de ese periodo', async () => {
  const end = new Date(Date.now() + 864e5 * 15);
  const { calls } = await run({ id: 't1', plan: 'pro', billingStatus: 'active', currentPeriodEnd: end }, { amount: 1899, months: 2 });
  assert.equal(day(calls.updates[0].currentPeriodEnd), day(addMonths(end, 2)));
});

test('sin meses se toma 1; los meses inválidos y el monto en cero se rechazan', async () => {
  const t = { id: 't1', plan: 'basic', billingStatus: 'trialing' };
  const one = await run(t, { amount: 499 });
  assert.equal(one.calls.events[0].months, 1);
  for (const months of [0, 37, 1.5, 'abc']) assert.equal((await run(t, { amount: 499, months })).res.code, 400, String(months));
  assert.equal((await run(t, { amount: 0, months: 1 })).res.code, 400);
});

test('la licencia perpetua no lleva periodo: solo se registra el pago y se activa', async () => {
  const { calls } = await run({ id: 't1', plan: 'perpetual', billingStatus: 'trialing' }, { amount: 3490, months: 6 });
  assert.equal(calls.updates[0].billingStatus, 'active');
  assert.equal(calls.updates[0].currentPeriodEnd, undefined);
  assert.equal(calls.events[0].months, null);
});

test('un pago a mano da por usada la promoción de lanzamiento: la pantalla de pago ya no se la ofrece', async () => {
  const t = { id: 't1', plan: 'growth', billingInterval: 'month', billingStatus: 'trialing', promoEligible: true };
  assert.equal(promoSvc.describe(t).eligible, true); // antes del pago la pantalla de pago la ofrecía
  const { res, calls } = await run(t, { amount: 1497, months: 3, note: 'Pagó 3 meses en efectivo' });
  assert.equal(res.code, 201);
  const patch = calls.updates.find((u) => 'promoEligible' in u);
  assert.equal(patch.promoEligible, false);
  assert.equal(patch.promo.state, 'ended');
  assert.equal(patch.promo.reason, 'manual_payment');
  assert.equal(promoSvc.describe({ ...t, ...patch }).eligible, false); // lo que lee la pantalla de pago
  assert.ok(calls.events.some((e) => e.type === 'promo_ended'));
  assert.equal(calls.updates[0].billingStatus, 'active'); // el pago en sí se registra igual
});

test('la promoción ya activa en Mercado Pago no se toca con un pago a mano', async () => {
  const promo = { state: 'active', amount: 166, fullAmount: 499, paymentsDone: 1 };
  const { calls } = await run({ id: 't1', plan: 'growth', billingStatus: 'active', promoEligible: true, promo, mpPreapprovalId: 'pre_1' }, { amount: 499, months: 1 });
  assert.equal(calls.updates.some((u) => 'promo' in u || 'promoEligible' in u), false);
  assert.equal(calls.events.some((e) => e.type === 'promo_ended'), false);
});

test('promoción pendiente: sin suscripción de Mercado Pago se da por usada; con suscripción se respeta', async () => {
  const pending = { state: 'pending', amount: 166, fullAmount: 499, paymentsDone: 0 };
  const sinMp = await run({ id: 't1', plan: 'growth', billingStatus: 'trialing', promoEligible: true, promo: pending }, { amount: 499, months: 1 });
  assert.equal(sinMp.calls.updates.some((u) => u.promoEligible === false), true);
  const conMp = await run({ id: 't1', plan: 'growth', billingStatus: 'trialing', promoEligible: true, promo: pending, mpPreapprovalId: 'pre_1' }, { amount: 499, months: 1 });
  assert.equal(conMp.calls.updates.some((u) => 'promo' in u || 'promoEligible' in u), false);
});

test('quien no era elegible a la promoción no recibe cambios de promoción', async () => {
  const { calls } = await run({ id: 't1', plan: 'basic', billingStatus: 'trialing', promoEligible: false }, { amount: 499, months: 1 });
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.events.length, 1);
});
