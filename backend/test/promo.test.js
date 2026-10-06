process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
delete process.env.MP_ACCESS_TOKEN;
// Aunque alguien deje variables viejas en el servidor, los precios no cambian
process.env.MP_PLAN_GROWTH_PRICE = '1';
process.env.MP_PLAN_PRO_PRICE = '1';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const tenants = new Map();
const events = [];
const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub('../database/db', {
  async UpdateTenant(id, patch) {
    Object.assign(tenants.get(id), patch);
    return { ...tenants.get(id) };
  },
  async CreateBillingEvent(e) {
    events.push(e);
  },
  async ListTenants() {
    return [...tenants.values()].map((t) => ({ ...t }));
  },
});
const mp = require('../services/mercadopago.service');
const amounts = [];
mp.updatePreapprovalAmount = async (id, amount) => {
  amounts.push({ id, amount });
};

const plans = require('../services/plans.catalog');
const promo = require('../services/promo.service');

const fresh = (id, extra = {}) => {
  const t = { id, plan: 'growth', billingInterval: 'month', billingStatus: 'trialing', promoEligible: true, mpPreapprovalId: `pre_${id}`, ...extra };
  tenants.set(id, t);
  return t;
};
const pay = async (id, key, source = 'authorized_payment') => promo.onPayment({ ...tenants.get(id) }, { key, source });

test('precios nuevos: Crecimiento 750, Pro 1350 y anual a 10 meses', () => {
  assert.equal(plans.planPrice('basic', 'month'), 349);
  assert.equal(plans.planPrice('growth', 'month'), 750);
  assert.equal(plans.planPrice('growth', 'year'), 7500);
  assert.equal(plans.planPrice('pro', 'month'), 1350);
  assert.equal(plans.planPrice('pro', 'year'), 13500);
  const list = plans.listPlans();
  const growth = list.find((p) => p.id === 'growth');
  assert.equal(growth.price, 750);
  assert.equal(growth.promoPrice, 250);
  assert.equal(growth.promoMonths, 3);
  assert.equal(list.find((p) => p.id === 'pro').promoPrice, 450);
  assert.equal(list.find((p) => p.id === 'basic').promoPrice, 116);
});

test('elegibilidad: solo tienda nueva, plan mensual y sin haberla usado', () => {
  const nueva = fresh('a');
  assert.equal(promo.isEligible(nueva, 'growth', 'month'), true);
  assert.equal(promo.isEligible(nueva, 'growth', 'year'), false, 'anual no lleva promoción');
  assert.equal(promo.isEligible(nueva, 'perpetual', 'month'), false);
  const vieja = { id: 'v', plan: 'basic', billingStatus: 'active' };
  assert.equal(promo.isEligible(vieja, 'basic', 'month'), false, 'las tiendas que ya existían no entran');
  const usada = fresh('u', { promoEligible: false, promo: { state: 'ended' } });
  assert.equal(promo.isEligible(usada, 'pro', 'month'), false);
});

test('3 cobros a 1/3 y al terminar el 3º sube a precio normal en Mercado Pago', async () => {
  const t = fresh('b');
  await promo.onCheckout(t, 'growth', 'month');
  assert.equal(tenants.get('b').promo.state, 'pending');
  assert.equal(tenants.get('b').promo.amount, 250);

  await pay('b', 'act:pre_b:2026-11-01', 'activation');
  assert.equal(tenants.get('b').promo.state, 'active');
  assert.equal(tenants.get('b').promo.paymentsDone, 1);
  assert.equal(promo.currentMonthly(tenants.get('b')), 250);

  // el mismo primer cobro avisado como pago autorizado no cuenta dos veces
  await pay('b', 'ap:1');
  assert.equal(tenants.get('b').promo.paymentsDone, 1);
  // repetir el aviso tampoco
  await pay('b', 'ap:1');
  assert.equal(tenants.get('b').promo.paymentsDone, 1);

  await pay('b', 'ap:2');
  assert.equal(tenants.get('b').promo.paymentsDone, 2);
  assert.equal(amounts.length, 0, 'aún no se sube el precio');
  await pay('b', 'ap:3');
  assert.deepEqual(amounts, [{ id: 'pre_b', amount: 750 }]);
  assert.equal(tenants.get('b').promo.state, 'ended');
  assert.equal(tenants.get('b').promoEligible, false);
  assert.equal(promo.currentMonthly(tenants.get('b')), 750);
  assert.equal(events.at(-1).type, 'promo_ended');

  // después ya no hay promoción: un cobro más no la reabre
  await pay('b', 'ap:4');
  assert.equal(amounts.length, 1);
});

test('si no llega el aviso del 3er cobro, el tiempo sube el precio antes del 4º', async () => {
  const t = fresh('c');
  await promo.onCheckout(t, 'pro', 'month');
  await pay('c', 'act:pre_c:x', 'activation');
  const early = { ...tenants.get('c') };
  assert.equal(await promo.sweepTenant(early), false, 'todavía no toca');
  tenants.get('c').promo.endsAt = new Date(Date.now() - 1000);
  const before = amounts.length;
  assert.equal(await promo.sweepTenant({ ...tenants.get('c') }), true);
  assert.deepEqual(amounts.at(-1), { id: 'pre_c', amount: 1350 });
  assert.equal(amounts.length, before + 1);
  // idempotente
  assert.equal(await promo.sweepTenant({ ...tenants.get('c') }), false);
});

test('si Mercado Pago falla al subir el precio, la promoción queda activa para reintentar', async () => {
  const t = fresh('d');
  await promo.onCheckout(t, 'basic', 'month');
  await pay('d', 'act:pre_d:x', 'activation');
  tenants.get('d').promo.endsAt = new Date(Date.now() - 1000);
  const original = mp.updatePreapprovalAmount;
  mp.updatePreapprovalAmount = async () => {
    throw new Error('MP caído');
  };
  assert.equal(await promo.sweepTenant({ ...tenants.get('d') }), false);
  assert.equal(tenants.get('d').promo.state, 'active');
  mp.updatePreapprovalAmount = original;
  assert.equal(await promo.sweepTenant({ ...tenants.get('d') }), true);
  assert.equal(tenants.get('d').promo.state, 'ended');
});

test('checkout sin promoción (tienda existente o anual) limpia cualquier promoción pendiente', async () => {
  const t = fresh('e');
  await promo.onCheckout(t, 'growth', 'month');
  assert.equal(tenants.get('e').promo.state, 'pending');
  await promo.onCheckout({ ...tenants.get('e') }, 'growth', 'year');
  assert.equal(tenants.get('e').promo, null);
});

test('el frontend (landing, SEO) y el backend tienen exactamente los mismos precios', async () => {
  const { PRICES } = await import('../../frontend/src/seo/site.mjs');
  for (const p of PRICES) {
    assert.equal(plans.planPrice(p.id, 'month'), p.month, `${p.id} mensual`);
    assert.equal(plans.planPrice(p.id, 'year'), p.year, `${p.id} anual`);
  }
});
