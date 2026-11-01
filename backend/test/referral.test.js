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
  async GetReferrerByOwnerEmail(email) {
    return copy(mem.referrers.find((r) => r.ownerEmail === email));
  },
  async SumCommissionsBetween(referrerId, from, to) {
    const rows = mem.commissions.filter((c) => c.referrerId === referrerId && c.status !== 'void' && c.createdAt >= from && c.createdAt <= to);
    const sum = (status) => rows.filter((c) => c.status === status).reduce((a, c) => a + c.commission, 0);
    return { pending: sum('pending'), paid: sum('paid'), count: rows.length };
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

test('escalera: 15% al inicio, sube con las ventas cerradas y topa en 25%', () => {
  assert.equal(tiers.rateFor(0), 0.15);
  assert.equal(tiers.rateFor(4), 0.15);
  assert.equal(tiers.rateFor(5), 0.17);
  assert.equal(tiers.rateFor(10), 0.19);
  assert.equal(tiers.rateFor(20), 0.21);
  assert.equal(tiers.rateFor(35), 0.23);
  assert.equal(tiers.rateFor(50), 0.25);
  assert.equal(tiers.rateFor(500), 0.25);
  assert.deepEqual(tiers.nextTierFor(7), { from: 10, rate: 0.19, missing: 3 });
  assert.equal(tiers.nextTierFor(50), null);
  assert.equal(tiers.commissionFor(349, 0).commission, 52.35);
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
  assert.equal(c1.rate, 0.15);
  assert.equal(c1.commission, 52.35);
  assert.equal(c1.status, 'pending');
  assert.equal(await svc.recordPayment({ tenant, amount: 349, source: 'authorized_payment', key: 'ap:1', mpPaymentId: 1 }), null);
  const c2 = await svc.recordPayment({ tenant, amount: 349, source: 'authorized_payment', key: 'ap:2', mpPaymentId: 2 });
  assert.equal(c2.commission, 52.35, 'el mes siguiente de la misma tienda paga otra vez');
  // tienda sin vendedor o monto inválido: nada
  assert.equal(await svc.recordPayment({ tenant: { id: 'tx', name: 'Sin vendedor' }, amount: 100, source: 'manual', key: 'k' }), null);
  assert.equal(await svc.recordPayment({ tenant, amount: 0, source: 'manual', key: 'k0' }), null);
});

test('la activación y el primer pago autorizado son el mismo dinero (no se duplica)', async () => {
  const seller = await svc.createReferrer({ name: 'Eva Mora', email: 'eva@mail.com' });
  const tenant = newTenant(seller, 'Tienda Eva');
  const act = await svc.recordPayment({ tenant, amount: 599, source: 'activation', key: 'act:pre1:2026-11-04' });
  assert.equal(act.commission, 89.85);
  assert.equal(await svc.recordPayment({ tenant, amount: 599, source: 'authorized_payment', key: 'ap:77', mpPaymentId: 77 }), null);
  assert.equal(mem.commissions.filter((c) => c.tenantId === tenant.id).length, 1);
  // el pago del mes siguiente sí cuenta aparte
  const next = await svc.recordPayment({ tenant, amount: 599, source: 'authorized_payment', key: 'ap:78', mpPaymentId: 78 });
  assert.ok(next);
});

test('al llegar a 5 ventas cerradas sube a 17%; las comisiones viejas conservan su tasa', async () => {
  const seller = await svc.createReferrer({ name: 'Rita Paz', email: 'rita@mail.com' });
  const rates = [];
  for (let i = 1; i <= 6; i += 1) {
    const t = newTenant(seller, `Tienda ${i}`);
    const c = await svc.recordPayment({ tenant: t, amount: 1000, source: 'manual', key: `rita:${i}` });
    rates.push(c.rate);
  }
  assert.deepEqual(rates, [0.15, 0.15, 0.15, 0.15, 0.17, 0.17]);
  const first = mem.commissions.find((c) => c.key === 'rita:1');
  assert.equal(first.commission, 150);
  const d = await svc.detail(seller.id);
  assert.equal(d.closedSales, 6);
  assert.equal(d.rate, 0.17);
  assert.equal(d.next.from, 10);
  assert.equal(d.next.missing, 4);
  assert.equal(d.clients, 6);
  assert.equal(d.pending, 150 * 4 + 170 * 2);
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
  assert.equal(payout.total, 52.35 + 89.85);
  await assert.rejects(svc.payOut(seller.id, {}), (e) => e.status === 409);
  await assert.rejects(svc.voidCommission(a.id), (e) => e.status === 409);
  const d = await svc.detail(seller.id);
  assert.equal(d.pending, 0);
  assert.equal(d.paid, 142.2);
  assert.equal(d.payouts.length, 1);
});

test('lista de vendedores: cuántos clientes maneja cada uno', async () => {
  const list = await svc.listSummaries();
  const rita = list.find((r) => r.email === 'rita@mail.com');
  assert.equal(rita.clients, 6);
  assert.equal(rita.activeClients, 6);
  assert.ok(rita.code);
});

test('datos de pago: CLABE de 18 dígitos o correo de Mercado Pago válidos', async () => {
  const s = await svc.createReferrer({ name: 'Cuenta Pago', email: 'pago@mail.com', payoutClabe: '0123 4567 8901 2345 67', payoutMpEmail: 'MP@Mail.com' });
  assert.equal(s.payoutClabe, '012345678901234567');
  assert.equal(s.payoutMpEmail, 'mp@mail.com');
  await assert.rejects(svc.updateReferrer(s.id, { payoutClabe: '123' }), /18 dígitos/);
  await assert.rejects(svc.updateReferrer(s.id, { payoutMpEmail: 'no' }), (e) => e.status === 400);
  const d = await svc.detail(s.id);
  assert.equal(d.payoutClabe, '012345678901234567');
});

test('un dueño activa su propio código de vendedor: se crea una vez y queda ligado a su correo', async () => {
  const mine = await svc.linkOwner({ email: 'Socio@Mitiendita.software', name: 'Luis Pantoja', phone: '6641234567' });
  assert.match(mine.code, /^MT-[A-Z0-9]{6}$/);
  assert.equal(mine.ownerEmail, 'socio@mitiendita.software');
  assert.equal(mine.source, 'owner');
  const again = await svc.linkOwner({ email: 'socio@mitiendita.software', name: 'Otro nombre' });
  assert.equal(again.id, mine.id, 'no se crea otro');
  assert.equal((await svc.ownerSeller('SOCIO@mitiendita.software')).id, mine.id);
  assert.equal(await svc.ownerSeller('nadie@mitiendita.software'), null);
});

test('si el dueño ya era vendedor con ese correo, se liga ese mismo y conserva su código', async () => {
  const before = await svc.createReferrer({ name: 'Ana Dueña', email: 'ana@mitiendita.software' });
  const linked = await svc.linkOwner({ email: 'ana@mitiendita.software', name: 'Ana Dueña' });
  assert.equal(linked.id, before.id);
  assert.equal(linked.code, before.code);
  assert.equal(linked.ownerEmail, 'ana@mitiendita.software');
});

test('un dueño no puede usar su propio código al registrar una tienda', async () => {
  const mine = await svc.linkOwner({ email: 'propio@mitiendita.software', name: 'Dueño Propio' });
  await assert.rejects(svc.resolveForSignup(mine.code, { email: 'propio@mitiendita.software' }), (e) => e.status === 400);
});

test('lo que gana como vendedor en un mes: solo las comisiones de ese mes y sin las anuladas', async () => {
  const mine = await svc.linkOwner({ email: 'ventas@mitiendita.software', name: 'Dueño Vendedor' });
  const t1 = newTenant(mine, 'Tienda 1');
  const t2 = newTenant(mine, 'Tienda 2');
  await svc.recordPayment({ tenant: t1, amount: 349, source: 'payment', key: 'own-1' });
  await svc.recordPayment({ tenant: t2, amount: 750, source: 'payment', key: 'own-2' });
  const mem2 = mem.commissions.filter((c) => c.referrerId === mine.id);
  mem2[0].createdAt = new Date('2026-09-15T12:00:00Z'); // el de septiembre no cuenta en octubre
  const range = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-31T23:59:59Z') };
  mem2[1].createdAt = new Date('2026-10-10T12:00:00Z');
  const october = await svc.ownerEarnings('ventas@mitiendita.software', range);
  assert.equal(october.count, 1);
  assert.equal(october.earned, mem2[1].commission);
  assert.equal(october.pending, mem2[1].commission);
  // anulada: ya no cuenta
  await svc.voidCommission(mem2[1].id, { reason: 'prueba' });
  assert.equal((await svc.ownerEarnings('ventas@mitiendita.software', range)).earned, 0);
  assert.equal(await svc.ownerEarnings('sin-codigo@mitiendita.software', range), null);
});

test('mi parte total = lo que me toca como dueño + lo que gané como vendedor', () => {
  const income = require('../services/owner-income.service');
  assert.deepEqual(income.myShare(1000, { code: 'MT-AAAAAA', earned: 350.5, pending: 100.5, paid: 250, count: 3 }), {
    linked: true,
    ownerShare: 1000,
    commissions: { code: 'MT-AAAAAA', earned: 350.5, pending: 100.5, paid: 250, count: 3 },
    total: 1350.5,
  });
  // sin código activado: solo su parte de dueño
  assert.deepEqual(income.myShare(1000, null), { linked: false, ownerShare: 1000, commissions: null, total: 1000 });
  assert.equal(income.myShare(-200, { code: 'X', earned: 50, pending: 50, paid: 0, count: 1 }).total, -150, 'una utilidad negativa también suma');
});
