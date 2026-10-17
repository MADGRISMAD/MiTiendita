const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/mongodb');
const platform = require('../controllers/platform.controller');

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
