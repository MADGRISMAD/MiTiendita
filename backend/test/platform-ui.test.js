const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let fmt;
let attention;
test.before(async () => {
  const load = (rel) =>
    import(`data:text/javascript,${encodeURIComponent(fs.readFileSync(path.join(__dirname, '../../frontend/src/platform', rel), 'utf8'))}`);
  fmt = await load('format.js');
  attention = await load('attention.js');
});

const NOW = new Date('2026-10-03T18:00:00Z').getTime();
const H = 3600000;
const D = 86400000;

test('formato: tiempos relativos, días y dinero', () => {
  assert.equal(fmt.ago(new Date(NOW - 30000), NOW), 'justo ahora');
  assert.equal(fmt.ago(new Date(NOW - 5 * 60000), NOW), 'hace 5 min');
  assert.equal(fmt.ago(new Date(NOW - 3 * H), NOW), 'hace 3 h');
  assert.equal(fmt.ago(new Date(NOW - 30 * H), NOW), 'ayer');
  assert.equal(fmt.ago(new Date(NOW - 4 * D), NOW), 'hace 4 días');
  assert.equal(fmt.ago(new Date(NOW - 65 * D), NOW), 'hace 2 meses');
  assert.equal(fmt.ago(null, NOW), '—');
  assert.equal(fmt.daysUntil(new Date(NOW + 2 * D - H), NOW), 2);
  assert.equal(fmt.daysUntil(new Date(NOW - 2 * D), NOW), -2);
  assert.equal(fmt.daysUntil('no es fecha', NOW), null);
  assert.equal(fmt.money(349), '$349');
  assert.match(fmt.money(1234.5), /1,234\.50/);
  assert.equal(fmt.waitTone(new Date(NOW - 2 * H), NOW), '');
  assert.equal(fmt.waitTone(new Date(NOW - 5 * H), NOW), 'warn');
  assert.equal(fmt.waitTone(new Date(NOW - 26 * H), NOW), 'bad');
});

test('formato: estado de la tienda (perpetua) y último acceso', () => {
  assert.equal(fmt.statusOf({ billingStatus: 'active', isPerpetual: true }).label, 'Perpetua');
  assert.equal(fmt.statusOf({ billingStatus: 'active' }).tone, 'good');
  assert.equal(fmt.statusOf({ billingStatus: 'suspended' }).tone, 'bad');
  assert.equal(fmt.statusOf({ billingStatus: 'rara' }).label, 'Prueba');
  assert.equal(fmt.lastSeen({ lastSeenAt: null }, NOW), 'nunca ha entrado');
  assert.equal(fmt.lastSeen({ lastSeenAt: new Date(NOW - 2 * D) }, NOW), 'hace 2 días');
  assert.equal(fmt.initials('Abarrotes Lupita'), 'AL');
});

const tenants = [
  { id: 'a', businessName: 'Al día', billingStatus: 'active', planName: 'Básico', lastSeenAt: new Date(NOW - 1 * D), createdAt: new Date(NOW - 90 * D) },
  { id: 'b', businessName: 'Debe', billingStatus: 'past_due', planName: 'Pro', ownerName: 'Beto', currentPeriodEnd: new Date(NOW - 3 * D) },
  { id: 'c', businessName: 'Prueba por vencer', billingStatus: 'trialing', trialEndsAt: new Date(NOW + 1.5 * D), ownerName: 'Carla' },
  { id: 'd', businessName: 'Prueba vencida', billingStatus: 'trialing', trialEndsAt: new Date(NOW - 2 * D) },
  { id: 'e', businessName: 'Prueba lejana', billingStatus: 'trialing', trialEndsAt: new Date(NOW + 9 * D) },
  { id: 'f', businessName: 'Paga y no entra', billingStatus: 'active', lastSeenAt: new Date(NOW - 20 * D), createdAt: new Date(NOW - 90 * D) },
  { id: 'g', businessName: 'Suspendida', billingStatus: 'suspended' },
  { id: 'h', businessName: 'Perpetua quieta', billingStatus: 'active', isPerpetual: true, lastSeenAt: new Date(NOW - 60 * D) },
];
const tickets = [
  { tenantId: 'a', ticketId: 't1', businessName: 'Al día', subject: 'Reciente', status: 'open', updatedAt: new Date(NOW - 1 * H) },
  { tenantId: 'a', ticketId: 't2', businessName: 'Al día', subject: 'Esperando hace un día', status: 'open', updatedAt: new Date(NOW - 30 * H) },
  { tenantId: 'a', ticketId: 't3', businessName: 'Al día', subject: 'Ya respondido', status: 'answered', updatedAt: new Date(NOW - 30 * H) },
];

test('cola de atención: lo urgente primero y solo lo que de verdad pide acción', () => {
  const { items, counts } = attention.buildAttention({ tenants, tickets, now: NOW });
  const keys = items.map((i) => i.key);
  // rojo (el más viejo primero) → ámbar → azul
  assert.deepEqual(keys, ['trial-over-d', 'ticket-a-t2', 'due-b', 'trial-c', 'quiet-f', 'ticket-a-t1']);
  assert.equal(items[0].tone, 'bad');
  assert.ok(items.slice(0, 2).every((i) => i.tone === 'bad'));
  assert.ok(!keys.includes('ticket-a-t3'), 'un ticket ya respondido no pide acción');
  assert.ok(!keys.some((k) => k.includes('-e')), 'prueba con 9 días: todavía no');
  assert.ok(!keys.includes('quiet-h') && !keys.includes('quiet-g'), 'perpetua y suspendida no cuentan como «no entra»');
  assert.deepEqual(counts, { tickets: 2, pastDue: 1, trials: 2, quiet: 1, urgent: 2 });
  assert.match(items.find((i) => i.key === 'trial-c').title, /1 día|2 días/);
  assert.match(items.find((i) => i.key === 'trial-over-d').title, /hace 2 días/);
  assert.match(items.find((i) => i.key === 'quiet-f').title, /20 días/);
});

test('cola de atención: sin datos no truena', () => {
  assert.deepEqual(attention.buildAttention().items, []);
  const { items } = attention.buildAttention({ tenants: [{ id: 'x', businessName: 'Sin fechas', billingStatus: 'trialing' }], now: NOW });
  assert.deepEqual(items, []);
});
