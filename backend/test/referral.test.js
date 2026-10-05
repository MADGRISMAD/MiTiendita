process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');

/** Base en memoria que sustituye a database/referral.db.js */
const mem = { referrers: [], commissions: [], payouts: [], tenants: [] };
let seq = 0;
const nid = (p) => `${p}${++seq}`;
const copy = (x) => (x ? { ...x } : null);
const fakeDb = {
  async CreateReferrer(doc) {
    if (mem.referrers.some((r) => r.code === doc.code)) throw Object.assign(new Error('dup'), { code: 11000 });
    const row = { ...doc, id: nid('r') };
    mem.referrers.push(row);
    return copy(row);
  },
  async GetReferrerById(id) {
    return copy(mem.referrers.find((r) => r.id === id));
  },
  async GetReferrerByCode(code) {
    return copy(mem.referrers.find((r) => r.code === code));
  },
  async GetReferrerByEmail(email) {
    return copy(mem.referrers.find((r) => r.email === email));
  },
  async ListReferrers() {
    return mem.referrers.map(copy);
  },
  async UpdateReferrer(id, patch) {
    return copy(Object.assign(mem.referrers.find((r) => r.id === id), patch));
  },
  async ListTenantsByReferrer(id) {
    return mem.tenants.filter((t) => t.referrerId === id).map(copy);
  },
  async ListReferredTenants() {
    return mem.tenants.filter((t) => t.referrerId).map(copy);
  },
  async InsertCommission(doc) {
    if (mem.commissions.some((c) => c.key === doc.key)) return null;
    const row = { ...doc, id: nid('c') };
    mem.commissions.push(row);
    return copy(row);
  },
  async GetCommission(id) {
    return copy(mem.commissions.find((c) => c.id === id));
  },
  async FindCommissionByKey(key) {
    return copy(mem.commissions.find((c) => c.key === key));
  },
  async ListCommissions({ referrerId, tenantId, status } = {}) {
    return mem.commissions
      .filter((c) => (!referrerId || c.referrerId === referrerId) && (!tenantId || c.tenantId === tenantId) && (!status || c.status === status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(copy);
  },
  async UpdateCommission(id, patch, onlyIfStatus) {
    const c = mem.commissions.find((x) => x.id === id && (!onlyIfStatus || x.status === onlyIfStatus));
    return c ? copy(Object.assign(c, patch)) : null;
  },
  async CountClosedTenants(referrerId) {
    return new Set(mem.commissions.filter((c) => c.referrerId === referrerId && c.status !== 'void').map((c) => c.tenantId)).size;
  },
  async ListPayingTenantIds(referrerId) {
    return [...new Set(mem.commissions.filter((c) => c.referrerId === referrerId && c.status !== 'void').map((c) => c.tenantId))];
  },
  async SumCommissions() {
    const map = new Map();
    for (const c of mem.commissions) {
      const k = `${c.referrerId}|${c.status}`;
      const cur = map.get(k) || { referrerId: c.referrerId, status: c.status, total: 0, count: 0 };
      cur.total += c.commission;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()];
  },
  async CreatePayout(doc) {
    const row = { ...doc, id: String(doc._id) };
    mem.payouts.push(row);
    return copy(row);
  },
  async ListPayouts(id) {
    return mem.payouts.filter((p) => p.referrerId === id).map(copy);
  },
  async MarkPendingPaid(referrerId, payoutId, paidAt) {
    const done = [];
    for (const c of mem.commissions) {
      if (c.referrerId === referrerId && c.status === 'pending') {
        Object.assign(c, { status: 'paid', paidAt, payoutId: String(payoutId) });
        done.push(copy(c));
      }
    }
    return done;
  },
};
const dbPath = require.resolve('../database/referral.db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const svc = require('../services/referral.service');
const tiers = require('../services/referral.tiers');

function newTenant(referrer, name) {
  const t = { id: nid('t'), name, referrerId: referrer.id, billingStatus: 'active', plan: 'basic' };
  mem.tenants.push(t);
  return t;
}

test('escalera: 10% al inicio, sube con las ventas cerradas y topa en 20%', () => {
  assert.equal(tiers.rateFor(0), 0.1);
  assert.equal(tiers.rateFor(4), 0.1);
  assert.equal(tiers.rateFor(5), 0.12);
  assert.equal(tiers.rateFor(10), 0.14);
  assert.equal(tiers.rateFor(20), 0.16);
  assert.equal(tiers.rateFor(35), 0.18);
  assert.equal(tiers.rateFor(50), 0.2);
  assert.equal(tiers.rateFor(500), 0.2);
  assert.deepEqual(tiers.nextTierFor(7), { from: 10, rate: 0.14, missing: 3 });
  assert.equal(tiers.nextTierFor(50), null);
  assert.equal(tiers.commissionFor(349, 0).commission, 34.9);
});

test('alta de vendedor: código MT-XXXXXX único; no repite correo', async () => {
  const a = await svc.createReferrer({ name: 'Marco Ruiz', email: 'Marco@Mail.com', phone: '664 123 4567', state: 'Baja California' });
  assert.match(a.code, svc.CODE_RE);
  assert.equal(a.email, 'marco@mail.com');
  assert.equal(a.status, 'active');
  await assert.rejects(svc.createReferrer({ name: 'Otro', email: 'marco@mail.com' }), (e) => e.status === 409);
  await assert.rejects(svc.createReferrer({ name: 'X', email: 'no-es-correo' }), (e) => e.status === 400);
});

test('el código se normaliza y solo vale si el vendedor está activo', async () => {
  const s = await svc.createReferrer({ name: 'Ana Soto', email: 'ana@mail.com' });
  const typed = s.code.toLowerCase().replace('-', ' ');
  assert.equal((await svc.findActiveByCode(typed)).id, s.id);
  assert.equal(await svc.findActiveByCode('MT-ZZZZZZ'), null);
  await svc.updateReferrer(s.id, { status: 'paused' });
  assert.equal(await svc.findActiveByCode(s.code), null);
  await assert.rejects(svc.resolveForSignup(s.code, { email: 'x@y.com' }), (e) => e.status === 400);
  assert.equal(await svc.resolveForSignup('', {}), null);
  await svc.updateReferrer(s.id, { status: 'active' });
  await assert.rejects(svc.resolveForSignup(s.code, { email: 'ANA@mail.com' }), /propio código/);
});

test('cada cobro genera comisión; el mismo cobro no paga dos veces', async () => {
  const seller = await svc.createReferrer({ name: 'Luis Vega', email: 'luis@mail.com' });
  const tenant = newTenant(seller, 'Abarrotes Uno');
  const c1 = await svc.recordPayment({ tenant, amount: 349, source: 'authorized_payment', key: 'ap:1', mpPaymentId: 1 });
  assert.equal(c1.rate, 0.1);
  assert.equal(c1.commission, 34.9);
  assert.equal(c1.status, 'pending');
  assert.equal(await svc.recordPayment({ tenant, amount: 349, source: 'authorized_payment', key: 'ap:1', mpPaymentId: 1 }), null);
  const c2 = await svc.recordPayment({ tenant, amount: 349, source: 'authorized_payment', key: 'ap:2', mpPaymentId: 2 });
  assert.equal(c2.commission, 34.9, 'el mes siguiente de la misma tienda paga otra vez');
  // tienda sin vendedor o monto inválido: nada
  assert.equal(await svc.recordPayment({ tenant: { id: 'tx', name: 'Sin vendedor' }, amount: 100, source: 'manual', key: 'k' }), null);
  assert.equal(await svc.recordPayment({ tenant, amount: 0, source: 'manual', key: 'k0' }), null);
});

test('la activación y el primer pago autorizado son el mismo dinero (no se duplica)', async () => {
  const seller = await svc.createReferrer({ name: 'Eva Mora', email: 'eva@mail.com' });
  const tenant = newTenant(seller, 'Tienda Eva');
  const act = await svc.recordPayment({ tenant, amount: 599, source: 'activation', key: 'act:pre1:2026-11-04' });
  assert.equal(act.commission, 59.9);
  assert.equal(await svc.recordPayment({ tenant, amount: 599, source: 'authorized_payment', key: 'ap:77', mpPaymentId: 77 }), null);
  assert.equal(mem.commissions.filter((c) => c.tenantId === tenant.id).length, 1);
  // el pago del mes siguiente sí cuenta aparte
  const next = await svc.recordPayment({ tenant, amount: 599, source: 'authorized_payment', key: 'ap:78', mpPaymentId: 78 });
  assert.ok(next);
});

test('al llegar a 5 ventas cerradas sube a 12%; las comisiones viejas conservan su tasa', async () => {
  const seller = await svc.createReferrer({ name: 'Rita Paz', email: 'rita@mail.com' });
  const rates = [];
  for (let i = 1; i <= 6; i += 1) {
    const t = newTenant(seller, `Tienda ${i}`);
    const c = await svc.recordPayment({ tenant: t, amount: 1000, source: 'manual', key: `rita:${i}` });
    rates.push(c.rate);
  }
  assert.deepEqual(rates, [0.1, 0.1, 0.1, 0.1, 0.12, 0.12]);
  const first = mem.commissions.find((c) => c.key === 'rita:1');
  assert.equal(first.commission, 100);
  const d = await svc.detail(seller.id);
  assert.equal(d.closedSales, 6);
  assert.equal(d.rate, 0.12);
  assert.equal(d.next.from, 10);
  assert.equal(d.next.missing, 4);
  assert.equal(d.clients, 6);
  assert.equal(d.pending, 100 * 4 + 120 * 2);
  // repetir pago de una tienda ya cerrada no sube el conteo
  await svc.recordPayment({ tenant: mem.tenants.find((t) => t.name === 'Tienda 1'), amount: 1000, source: 'manual', key: 'rita:again' });
  assert.equal((await svc.detail(seller.id)).closedSales, 6);
});

test('anular: solo lo pendiente; una anulada deja de contar para el nivel', async () => {
  const seller = await svc.createReferrer({ name: 'Omar León', email: 'omar@mail.com' });
  const t = newTenant(seller, 'Tienda Omar');
  const c = await svc.recordPayment({ tenant: t, amount: 500, source: 'manual', key: 'omar:1' });
  assert.equal((await svc.detail(seller.id)).closedSales, 1);
  const voided = await svc.voidCommission(c.id, { reason: 'Reembolso' });
  assert.equal(voided.status, 'void');
  const d = await svc.detail(seller.id);
  assert.equal(d.closedSales, 0);
  assert.equal(d.pending, 0);
});

test('liquidar: paga todo lo pendiente una sola vez y lo pagado ya no se anula', async () => {
  const seller = await svc.createReferrer({ name: 'Pía Cruz', email: 'pia@mail.com' });
  const t1 = newTenant(seller, 'P1');
  const t2 = newTenant(seller, 'P2');
  const a = await svc.recordPayment({ tenant: t1, amount: 349, source: 'manual', key: 'pia:1' });
  await svc.recordPayment({ tenant: t2, amount: 599, source: 'manual', key: 'pia:2' });
  const payout = await svc.payOut(seller.id, { by: 'ana', note: 'Transferencia 5 oct' });
  assert.equal(payout.count, 2);
  assert.equal(payout.total, 34.9 + 59.9);
  await assert.rejects(svc.payOut(seller.id, {}), (e) => e.status === 409);
  await assert.rejects(svc.voidCommission(a.id), (e) => e.status === 409);
  const d = await svc.detail(seller.id);
  assert.equal(d.pending, 0);
  assert.equal(d.paid, 94.8);
  assert.equal(d.payouts.length, 1);
});

test('lista de vendedores: cuántos clientes maneja cada uno', async () => {
  const list = await svc.listSummaries();
  const rita = list.find((r) => r.email === 'rita@mail.com');
  assert.equal(rita.clients, 6);
  assert.equal(rita.activeClients, 6);
  assert.ok(rita.code);
});
