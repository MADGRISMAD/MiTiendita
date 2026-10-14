const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSummary, isDue, sendDue } = require('../services/daily-summary.service');

const orders = [
  { paymentStatus: 'paid', paymentMethod: 'cash', total: 100, items: [{ price: 50, quantity: 2, unitCost: 30 }] },
  { paymentStatus: 'paid', paymentMethod: 'card', total: 200, items: [{ price: 200, quantity: 1, unitCost: 0 }] },
  { paymentStatus: 'paid', paymentMethod: 'credit', total: 80, creditAmount: 60, items: [] },
  { paymentStatus: 'refunded', status: 'cancelled', paymentMethod: 'cash', total: 40, items: [] },
];

test('resumen: totales por método, ticket promedio, fiado, anulaciones y utilidad con costo conocido', () => {
  const s = buildSummary({ orders, sessions: [{ closedAt: '2026-10-14T23:00:00Z', difference: -20, countedCash: 80 }], lowStock: [{ name: 'Leche', stock: 1 }, { name: 'Pan', stock: 0 }] });
  assert.equal(s.count, 3);
  assert.equal(s.total, 380);
  assert.equal(s.avgTicket, 126.67);
  assert.deepEqual(s.byMethod, { cash: 100, card: 200, transfer: 0, other: 0 });
  assert.equal(s.credit, 60);
  assert.deepEqual(s.voids, { count: 1, total: 40 });
  assert.equal(s.profit, 40);
  assert.equal(s.cash.difference, -20);
  assert.deepEqual(s.lowStock.map((f) => f.name), ['Pan', 'Leche']);
  assert.equal(s.hadActivity, true);
});

test('resumen: día sin movimiento y sin costos conocidos', () => {
  const s = buildSummary({});
  assert.equal(s.hadActivity, false);
  assert.equal(s.profit, null);
  assert.equal(s.cash, null);
});

test('isDue: solo pasadas las 9 pm de la tienda y una vez al día', () => {
  const tz = 'America/Tijuana'; // UTC-7 en octubre
  assert.equal(isDue({ timezone: tz }, new Date('2026-10-15T03:30:00Z')), false); // 8:30 pm → no
  assert.equal(isDue({ timezone: tz }, new Date('2026-10-15T04:10:00Z')), true); // 9:10 pm → sí
  assert.equal(isDue({ timezone: tz, lastDailySummary: '2026-10-14' }, new Date('2026-10-15T04:10:00Z')), false);
  assert.equal(isDue({ timezone: tz }, new Date('2026-10-15T20:00:00Z')), false); // 1 pm
});

function fakeDb(settings, data = {}) {
  const claimed = new Set();
  return {
    claimed,
    released: [],
    async ListSettingsWithDailySummary() { return settings; },
    async ClaimDailySummary(t, k) { const key = `${t}|${k}`; if (claimed.has(key)) return false; claimed.add(key); return true; },
    async ReleaseDailySummary(t, k) { claimed.delete(`${t}|${k}`); this.released.push(k); },
    async GetOrdersByDateRange() { return data.orders || []; },
    async GetClosedCashSessionsBetween() { return []; },
    async GetLowStockFoods() { return []; },
  };
}
const now = new Date('2026-10-15T04:10:00Z');
const store = { tenantId: 't1', timezone: 'America/Tijuana', businessName: 'La Esquina', dailySummaryEmail: 'dueno@x.com' };

test('sendDue: envía una vez y no repite en la siguiente revisión', async () => {
  const sent = [];
  const mail = { async sendDailySummaryEmail(o) { sent.push(o); return { sent: true }; } };
  const db = fakeDb([store], { orders });
  assert.equal(await sendDue(db, mail, { now }), 1);
  assert.equal(await sendDue(db, mail, { now }), 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'dueno@x.com');
  assert.equal(sent[0].summary.total, 380);
});

test('sendDue: sin movimiento no manda correo; si el envío falla, libera el día para reintentar', async () => {
  const sent = [];
  const mail = { async sendDailySummaryEmail(o) { sent.push(o); return { sent: true }; } };
  assert.equal(await sendDue(fakeDb([store], { orders: [] }), mail, { now }), 0);
  assert.equal(sent.length, 0);

  const boom = { async sendDailySummaryEmail() { throw new Error('smtp caído'); } };
  const db = fakeDb([store], { orders });
  assert.equal(await sendDue(db, boom, { now }), 0);
  assert.equal(db.released.length, 1);
  assert.equal(await sendDue(db, mail, { now }), 1); // reintento exitoso
});
