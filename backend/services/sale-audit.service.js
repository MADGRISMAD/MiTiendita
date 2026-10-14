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

/** Cambio de precio o costo de un producto: una entrada por campo que cambió de verdad. */
function priceChangeEntries({ tenantId, user, before, after, now = new Date() }) {
  const out = [];
  for (const [field, label] of [['price', 'Precio'], ['cost', 'Costo']]) {
    if (after[field] == null || after[field] === '') continue;
    const from = Number(before?.[field] || 0);
    const to = Number(after[field]);
    if (!Number.isFinite(to) || Math.abs(from - to) < 0.005) continue;
    out.push({
      tenantId: String(tenantId),
      type: field === 'price' ? 'price_changed' : 'cost_changed',
      message: `${label} de ${before?.name || after.name || 'producto'}: ${money(from)} → ${money(to)}`,
      meta: { foodId: String(before?.id || ''), name: before?.name || '', field, from, to },
      user: user || '',
      createdAt: now,
    });
  }
  return out;
}

function cashOpenEntry({ tenantId, user, session, now = new Date() }) {
  return {
    tenantId: String(tenantId),
    type: 'cash_opened',
    message: `Apertura de caja con ${money(session?.openingFloat)}`,
    meta: { sessionId: String(session?.id || ''), openingFloat: Number(session?.openingFloat || 0) },
    user: user || '',
    createdAt: now,
  };
}

function cashCloseEntry({ tenantId, user, session, now = new Date() }) {
  const diff = Number(session?.difference || 0);
  const tag = Math.abs(diff) < 0.005 ? 'cuadró' : diff < 0 ? `faltante de ${money(-diff)}` : `sobrante de ${money(diff)}`;
  return {
    tenantId: String(tenantId),
    type: 'cash_closed',
    message: `Corte de caja: ${tag}`,
    meta: {
      sessionId: String(session?.id || ''),
      expectedCash: Number(session?.expectedCash || 0),
      countedCash: Number(session?.countedCash || 0),
      difference: diff,
      notes: clean(session?.notes, 200),
    },
    user: user || '',
    createdAt: now,
  };
}

const DISCOUNT_ALERT_PERCENT = 20;

/** Descuento grande en una venta (a partir de 20 %): queda para que el dueño lo revise. */
function bigDiscountEntry({ tenantId, user, order, now = new Date() }) {
  const pct = Number(order?.discountPercent) || 0;
  if (pct < DISCOUNT_ALERT_PERCENT) return null;
  return {
    tenantId: String(tenantId),
    type: 'discount_applied',
    message: `Descuento de ${pct}% en venta por ${money(order.total)}`,
    meta: { orderId: String(order.id || ''), discountPercent: pct, discountAmount: Number(order.discountAmount || 0), total: Number(order.total || 0) },
    user: user || '',
    createdAt: now,
  };
}

const base = (tenantId, user, now) => ({ tenantId: String(tenantId), user: user || '', createdAt: now });

/** Alta de un producto. */
function foodCreatedEntry({ tenantId, user, food, now = new Date() }) {
  return {
    ...base(tenantId, user, now),
    type: 'product_created',
    message: `Producto nuevo: ${food.name} a ${money(food.price)}`,
    meta: { foodId: String(food.id || ''), name: food.name, price: Number(food.price) || 0, barcode: food.barcode || '' },
  };
}

const FOOD_FIELDS = [
  ['name', 'Nombre'],
  ['barcode', 'Código'],
  ['saleUnit', 'Unidad de venta'],
  ['menuId', 'Categoría'],
  ['priceIncludesTax', 'Precio con IVA'],
];

/** Cambios de datos de un producto que no son precio ni costo (esos ya tienen su propio registro). */
function foodChangeEntries({ tenantId, user, before, after, now = new Date() }) {
  const out = [];
  for (const [field, label] of FOOD_FIELDS) {
    if (after[field] === undefined || String(after[field] ?? '') === String(before?.[field] ?? '')) continue;
    out.push({
      ...base(tenantId, user, now),
      type: 'product_updated',
      message: `${label} de ${before?.name || after.name || 'producto'}: «${before?.[field] ?? ''}» → «${after[field] ?? ''}»`,
      meta: { foodId: String(before?.id || ''), field, from: before?.[field] ?? null, to: after[field] ?? null },
    });
  }
  return out;
}

/** Baja de un producto, con lo necesario para recrearlo si fue un error. */
function foodDeletedEntry({ tenantId, user, food, now = new Date() }) {
  return {
    ...base(tenantId, user, now),
    type: 'product_deleted',
    message: `Producto eliminado: ${food.name} (${money(food.price)}, ${Number(food.stock) || 0} en existencia)`,
    meta: {
      foodId: String(food.id || ''),
      name: food.name,
      price: Number(food.price) || 0,
      cost: Number(food.cost) || 0,
      stock: Number(food.stock) || 0,
      barcode: food.barcode || '',
      menuId: food.menuId || '',
      saleUnit: food.saleUnit || 'pz',
    },
  };
}

/** Alta, cambio de nombre o baja de una categoría. */
function menuEntry({ tenantId, user, kind, menu, from = null, productCount = 0, now = new Date() }) {
  const name = menu?.name || from?.name || 'categoría';
  const text = {
    created: `Categoría nueva: ${name}`,
    renamed: `Categoría renombrada: «${from?.name}» → «${name}»`,
    deleted: `Categoría eliminada: ${name}${productCount ? ` (tenía ${productCount} productos)` : ''}`,
  }[kind];
  return { ...base(tenantId, user, now), type: `category_${kind}`, message: text, meta: { menuId: String(menu?.id || from?.id || ''), name, productCount } };
}

module.exports = { foodCreatedEntry, foodChangeEntries, foodDeletedEntry, menuEntry, bigDiscountEntry, DISCOUNT_ALERT_PERCENT, sanitizeRemovedLines, removedLineEntry, voidEntry, priceChangeEntries, cashOpenEntry, cashCloseEntry, MAX_LINES };
