/**
 * Bitácora de la caja: anulaciones de venta y productos quitados del ticket.
 * El cajero puede hacer ambas cosas sin autorización; lo que se exige es que quede registrado
 * (colección `activity_log`, la misma que lee Inventario → Bitácora).
 */

const MAX_LINES = 50;
const REASONS = { removed: 'Quitado del ticket', cleared: 'Ticket vaciado', abandoned: 'Ticket abandonado' };

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0;
};

/** Deja solo lo que se guarda de cada renglón quitado (el cliente manda lo que quiere). */
function sanitizeRemovedLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_LINES)
    .map((l) => ({
      name: clean(l?.name, 120),
      foodId: clean(l?.foodId, 40) || null,
      quantity: num(l?.quantity),
      price: num(l?.price),
      reason: REASONS[l?.reason] ? l.reason : 'removed',
      at: Number.isFinite(Date.parse(l?.at)) ? new Date(l.at) : null,
    }))
    .filter((l) => l.name && l.quantity > 0);
}

function removedLineEntry({ tenantId, user, line, orderId = null, now = new Date() }) {
  return {
    tenantId: String(tenantId),
    type: 'order_line_removed',
    message: `${REASONS[line.reason]}: ${line.quantity} × ${line.name} (${money(line.price * line.quantity)})`,
    meta: {
      foodId: line.foodId,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      reason: line.reason,
      removedAt: line.at,
      ...(orderId ? { orderId: String(orderId) } : {}),
    },
    user: user || '',
    createdAt: now,
  };
}

function voidEntry({ tenantId, user, order, reason = '', refunded, now = new Date() }) {
  const folio = order.folio || order.number || String(order.id || '').slice(-6);
  return {
    tenantId: String(tenantId),
    type: 'sale_voided',
    message: `${refunded ? 'Devolución' : 'Cancelación'} de la venta #${folio} por ${money(order.total)}`,
    meta: {
      orderId: String(order.id),
      total: Number(order.total || 0),
      paymentMethod: order.paymentMethod || 'cash',
      refunded: Boolean(refunded),
      items: (order.items || []).slice(0, MAX_LINES).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      reason: clean(reason, 200),
    },
    user: user || '',
    createdAt: now,
  };
}

module.exports = { sanitizeRemovedLines, removedLineEntry, voidEntry, MAX_LINES };
