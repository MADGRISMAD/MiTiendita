/**
 * Clientes frecuentes e historial. Funciones puras: reciben lo que ya leyó la base.
 * Una venta cuenta para un cliente si quedó ligada a él (`customerId`) y está cobrada; las anuladas no.
 */
const { round2 } = require('../utils/tax');

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const FREQUENT_VISITS = 4; // visitas en los últimos 30 días para ser «frecuente»


/**
 * Segmento de un cliente:
 *  - frequent: FREQUENT_VISITS o más compras en los últimos 30 días
 *  - inactive: compró alguna vez, pero la última fue hace más de 30 días
 *  - new: una sola compra
 *  - regular: el resto con compras recientes
 *  - none: nunca ha comprado
 */
function segmentOf({ visits = 0, visits30 = 0, last = null }, now = new Date()) {
  if (!visits) return 'none';
  const lastMs = last ? new Date(last).getTime() : NaN;
  if (Number.isFinite(lastMs) && now.getTime() - lastMs > WINDOW_DAYS * DAY_MS) return 'inactive';
  if (visits30 >= FREQUENT_VISITS) return 'frequent';
  if (visits === 1) return 'new';
  return 'regular';
}

/** Une los clientes con sus estadísticas (`stats` por customerId). */
function withStats(customers, stats, now = new Date()) {
  const byId = new Map(stats.map((s) => [String(s.customerId), s]));
  return customers.map((c) => {
    const s = byId.get(String(c.id)) || {};
    const visits = Number(s.visits) || 0;
    const spent = round2(s.spent);
    return {
      id: String(c.id),
      visits,
      visits30: Number(s.visits30) || 0,
      spent,
      avgTicket: visits ? round2(spent / visits) : 0,
      lastVisit: s.last || null,
      segment: segmentOf({ visits, visits30: Number(s.visits30) || 0, last: s.last }, now),
    };
  });
}

/** Historial de un cliente: compras, totales y lo que más lleva. `orders` ya viene filtrado por cliente. */
function historyOf(orders, { now = new Date() } = {}) {
  const paid = orders.filter((o) => o.paymentStatus === 'paid' && o.status !== 'cancelled');
  const spent = round2(paid.reduce((a, o) => a + (Number(o.total) || 0), 0));
  const products = new Map();
  for (const o of paid) {
    for (const it of o.items || []) {
      const key = String(it.foodId || it.name);
      const row = products.get(key) || { name: it.name, quantity: 0, unit: it.saleUnit || 'pz' };
      row.quantity = Math.round((row.quantity + (Number(it.quantity) || 0)) * 1000) / 1000;
      products.set(key, row);
    }
  }
  const sorted = paid.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const last = sorted[0]?.createdAt || null;
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const visits30 = paid.filter((o) => new Date(o.createdAt).getTime() >= since).length;
  return {
    visits: paid.length,
    visits30,
    spent,
    avgTicket: paid.length ? round2(spent / paid.length) : 0,
    lastVisit: last,
    segment: segmentOf({ visits: paid.length, visits30, last }, now),
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    purchases: sorted.slice(0, 30).map((o) => ({
      id: String(o.id),
      at: o.createdAt,
      total: round2(o.total),
      method: o.paymentMethod || 'cash',
      items: (o.items || []).map((i) => `${i.quantity} × ${i.name}`).slice(0, 6),
    })),
  };
}

module.exports = { segmentOf, withStats, historyOf, WINDOW_DAYS, FREQUENT_VISITS };
