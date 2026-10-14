const test = require('node:test');
const assert = require('node:assert/strict');
const { segmentOf, withStats, historyOf } = require('../services/customer-insights.service');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-14T12:00:00Z');
const ago = (d) => new Date(now.getTime() - d * DAY);

test('segmentos: frecuente, nuevo, regular, inactivo y sin compras', () => {
  assert.equal(segmentOf({ visits: 6, visits30: 4, last: ago(1) }, now), 'frequent');
  assert.equal(segmentOf({ visits: 1, visits30: 1, last: ago(2) }, now), 'new');
  assert.equal(segmentOf({ visits: 5, visits30: 2, last: ago(5) }, now), 'regular');
  assert.equal(segmentOf({ visits: 9, visits30: 0, last: ago(45) }, now), 'inactive');
  assert.equal(segmentOf({ visits: 0 }, now), 'none');
});

test('withStats: une clientes con sus compras y calcula el ticket promedio', () => {
  const rows = withStats(
    [{ id: 'a', name: 'Mary' }, { id: 'b', name: 'Beto' }],
    [{ customerId: 'a', visits: 4, visits30: 4, spent: 400, last: ago(1) }],
    now
  );
  assert.deepEqual(rows[0], { id: 'a', visits: 4, visits30: 4, spent: 400, avgTicket: 100, lastVisit: ago(1), segment: 'frequent' });
  assert.equal(rows[1].segment, 'none');
  assert.equal(rows[1].avgTicket, 0);
});

test('historial: solo cuenta lo cobrado y no anulado, con productos favoritos', () => {
  const orders = [
    { id: '1', paymentStatus: 'paid', total: 100, createdAt: ago(1), paymentMethod: 'cash', items: [{ foodId: 'x', name: 'Leche', quantity: 2 }, { foodId: 'y', name: 'Pan', quantity: 1 }] },
    { id: '2', paymentStatus: 'paid', total: 50, createdAt: ago(10), items: [{ foodId: 'x', name: 'Leche', quantity: 1 }] },
    { id: '3', paymentStatus: 'refunded', status: 'cancelled', total: 999, createdAt: ago(2), items: [{ foodId: 'z', name: 'Caro', quantity: 9 }] },
    { id: '4', paymentStatus: 'unpaid', total: 30, createdAt: ago(1), items: [] },
  ];
  const h = historyOf(orders, { now });
  assert.equal(h.visits, 2);
  assert.equal(h.spent, 150);
  assert.equal(h.avgTicket, 75);
  assert.equal(h.visits30, 2);
  assert.equal(h.topProducts[0].name, 'Leche');
  assert.equal(h.topProducts[0].quantity, 3);
  assert.equal(h.purchases[0].id, '1');
  assert.deepEqual(h.purchases[0].items, ['2 × Leche', '1 × Pan']);
});

test('historial vacío', () => {
  const h = historyOf([], { now });
  assert.equal(h.visits, 0);
  assert.equal(h.segment, 'none');
  assert.equal(h.lastVisit, null);
});
