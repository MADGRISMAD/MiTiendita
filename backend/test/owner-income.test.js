const test = require('node:test');
const assert = require('node:assert/strict');
const { monthRange, summarizePayments, csvOf } = require('../services/owner-income.service');
const { zonedToInstant } = require('../utils/store-time');

const names = new Map([
  ['t1', { businessName: 'Abarrotes Lupita', planName: 'Básico' }],
  ['t2', { businessName: 'Ferretería Beto', planName: 'Pro' }],
]);
const events = [
  { id: 'a', tenantId: 't1', amount: 349, plan: 'basic', interval: 'month', mpPaymentId: 'mp1', at: new Date('2026-10-03T15:00:00Z'), note: 'Cobro de la suscripción' },
  { id: 'b', tenantId: 't2', amount: 1350, plan: 'pro', interval: 'month', mpPaymentId: 'mp2', at: new Date('2026-10-10T15:00:00Z') },
  { id: 'c', tenantId: 't2', amount: 7490, interval: 'year', at: new Date('2026-10-12T15:00:00Z'), note: 'Licencia, transferencia' },
  { id: 'd', tenantId: 't1', amount: 0, at: new Date('2026-10-12T15:00:00Z') },
  { id: 'e', tenantId: 't1', amount: 349, interval: 'month', at: new Date('2026-10-01T15:00:00Z'), note: 'Cobro de la suscripción' }, // cobro viejo sin id
];

test('el mes se mide en la zona del negocio', () => {
  const r = monthRange('2026-10', zonedToInstant);
  assert.equal(r.from.toISOString(), '2026-10-01T06:00:00.000Z'); // 00:00 en Ciudad de México
  assert.equal(r.to.toISOString(), '2026-11-01T05:59:59.999Z');
  assert.equal(monthRange('2026-12', zonedToInstant).to.getUTCFullYear(), 2027);
  assert.equal(monthRange('octubre', zonedToInstant), null);
});

test('lo cobrado se reparte en partes iguales entre los socios, con y sin costos', () => {
  const s = summarizePayments({ events, names, partners: 3, costs: { ai: 30, expenses: 270 } });
  assert.equal(s.count, 4); // el de monto 0 no cuenta
  assert.equal(s.collected, 9538);
  assert.equal(s.perPartner, 3179.33);
  assert.equal(s.profit, 9238);
  assert.equal(s.profitPerPartner, 3079.33);
  assert.equal(s.partners, 3);
  assert.deepEqual(s.payments.map((p) => p.id), ['c', 'b', 'a', 'e']); // más reciente primero
  assert.deepEqual(s.payments.map((p) => p.source), ['manual', 'mercado_pago', 'mercado_pago', 'mercado_pago']);
  assert.equal(s.payments[0].businessName, 'Ferretería Beto');
});

test('sin cobros: todo en cero y sin dividir entre cero', () => {
  const s = summarizePayments({ events: [], partners: 3 });
  assert.deepEqual([s.collected, s.perPartner, s.profit, s.profitPerPartner], [0, 0, 0, 0]);
  assert.equal(summarizePayments({ events: [], partners: 0 }).partners, 1);
});

test('el CSV lleva un renglón por cobro y entrecomilla lo necesario', () => {
  const csv = csvOf(summarizePayments({ events, names, partners: 3 }));
  const lines = csv.replace('﻿', '').split('\n');
  assert.equal(lines[0], 'Fecha,Tienda,Plan,Cobro,Monto,Origen,Nota');
  assert.equal(lines.length, 5);
  assert.match(lines[1], /"Licencia, transferencia"/);
  assert.match(lines[2], /Ferretería Beto,Pro,Mensual,1350\.00,Mercado Pago/);
});
