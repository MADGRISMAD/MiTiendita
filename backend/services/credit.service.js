/**
 * backend/services/credit.service.js
 * Fiado y abonos (cuentas por cobrar).
 *
 * - Un cliente con `creditLimit` > 0 puede llevarse mercancía fiada hasta ese tope.
 * - Cada cargo (venta fiada) y cada abono queda en un libro de movimientos (`credit_entries`).
 * - `customers.balance` es lo que debe el cliente. Es la suma del libro y se mueve SOLO con $inc atómico.
 *   Un saldo negativo es saldo a favor del cliente (por ejemplo, si se devolvió una venta ya abonada).
 * - Los abonos se atribuyen a la caja abierta: el efectivo recibido entra al corte.
 *
 * Toda la lógica pasa por `store` para probarla sin base de datos (ver database/credit.db.js).
 */

const METHODS = ['cash', 'card', 'transfer'];

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

const cents = (n) => Math.round((Number(n) || 0) * 100);
const money = (c) => c / 100;
const fmt = (n) => `$${(Math.round(Number(n) * 100) / 100).toFixed(2)}`;

/**
 * Reparte el total de una venta fiada: lo que se deja a deber y el anticipo que paga ya (efectivo).
 * El anticipo puede ser 0 y nunca todo el total (si paga todo, no es fiado).
 */
function splitSale(total, downPayment = 0) {
  const t = cents(total);
  const d = cents(downPayment);
  if (t <= 0) throw httpError(400, 'El total de la venta debe ser mayor a 0.');
  if (d < 0) throw httpError(400, 'El anticipo no puede ser negativo.');
  if (d >= t) throw httpError(400, 'Si el cliente paga todo ahora, cóbralo como efectivo, no como fiado.', 'down_payment_too_high');
  return { credit: money(t - d), down: money(d) };
}

/** Texto claro cuando el cliente no puede llevarse más fiado. */
function limitMessage(customer, amount) {
  const limit = Number(customer.creditLimit) || 0;
  if (limit <= 0) return `${customer.name} no tiene fiado autorizado. El administrador puede darle un límite en Clientes.`;
  const balance = Number(customer.balance) || 0;
  const available = Math.max(0, limit - balance);
  return `${customer.name} debe ${fmt(balance)} de un límite de ${fmt(limit)}: solo puede llevar ${fmt(available)} más a fiado (esta venta deja ${fmt(amount)} a deber).`;
}

/**
 * Antigüedad de la deuda: los abonos pagan primero lo más viejo. Devuelve la fecha del cargo más antiguo
 * que todavía no se cubre por completo (null si no debe nada) y los días que lleva.
 */
function agingOf(entries, now = new Date()) {
  const charges = entries
    .filter((e) => e.type === 'charge')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((e) => ({ at: new Date(e.createdAt), left: cents(e.amount) }));
  let paid = entries.filter((e) => e.type === 'payment' || e.type === 'void').reduce((s, e) => s + cents(e.amount), 0);
  for (const c of charges) {
    const use = Math.min(c.left, paid);
    c.left -= use;
    paid -= use;
  }
  const oldest = charges.find((c) => c.left > 0);
  if (!oldest) return { since: null, days: 0 };
  return { since: oldest.at, days: Math.max(0, Math.floor((now - oldest.at) / 86400000)) };
}

/**
 * Registra el cargo de una venta fiada. Es idempotente por pedido: reintentar la misma venta no cobra dos veces.
 * `store.addEntry` debe fallar con code 11000 si ya existe un cargo del mismo pedido.
 */
async function chargeSale(store, { tenantId, customer, orderId, amount, user = '', cashSessionId = null }) {
  const value = money(cents(amount));
  if (!(value > 0)) throw httpError(400, 'No hay nada que fiar.');
  if ((Number(customer.creditLimit) || 0) <= 0) throw httpError(409, limitMessage(customer, value), 'no_credit');

  try {
    await store.addEntry({ tenantId, customerId: customer.id, type: 'charge', amount: value, orderId: String(orderId), cashSessionId, createdBy: user });
  } catch (err) {
    if (err.code === 11000) return { duplicated: true };
    throw err;
  }
  // El tope se valida en la propia base: dos cajas a la vez no pueden pasarse del límite
  const updated = await store.incBalance(tenantId, customer.id, value, { enforceLimit: true });
  if (!updated) {
    await store.removeEntry(tenantId, { orderId: String(orderId), type: 'charge' });
    const fresh = (await store.getCustomer(tenantId, customer.id)) || customer;
    throw httpError(409, limitMessage(fresh, value), 'limit_exceeded');
  }
  return { balance: updated.balance };
}

/**
 * Deshace un cargo recién hecho cuando la venta no pudo completarse (por ejemplo, faltan existencias).
 * Borra el cargo y devuelve el saldo, sin dejar movimientos: como si nunca se hubiera intentado.
 */
async function undoCharge(store, { tenantId, customerId, orderId, amount }) {
  const removed = await store.removeEntry(tenantId, { orderId: String(orderId), type: 'charge' });
  if (removed === false) return { skipped: true };
  await store.incBalance(tenantId, customerId, -money(cents(amount)), {});
  return { undone: true };
}

/** Abono de un cliente. Solo puede cubrir lo que debe. */
async function registerPayment(store, { tenantId, customerId, amount, method, note = '', user = '', cashSessionId }) {
  if (!METHODS.includes(method)) throw httpError(400, 'Forma de pago inválida.');
  const value = money(cents(amount));
  if (!(value > 0)) throw httpError(400, 'El abono debe ser mayor a 0.');
  if (value > 1_000_000) throw httpError(400, 'El abono es demasiado grande.');
  if (!cashSessionId) throw httpError(400, 'Abre la caja para recibir abonos.', 'cash_closed');
  const customer = await store.getCustomer(tenantId, customerId);
  if (!customer) throw httpError(404, 'Cliente no encontrado.');
  const owed = Number(customer.balance) || 0;
  if (owed <= 0) throw httpError(409, `${customer.name} no tiene saldo pendiente.`, 'no_balance');
  if (cents(value) > cents(owed)) throw httpError(409, `${customer.name} solo debe ${fmt(owed)}.`, 'overpay');

  // El saldo baja con una condición atómica: dos abonos simultáneos no pueden dejar saldo a favor por error
  const updated = await store.incBalance(tenantId, customerId, -value, { requireOwed: value });
  if (!updated) throw httpError(409, 'El saldo cambió mientras registrabas el abono. Vuelve a intentarlo.', 'balance_changed');
  const entry = await store.addEntry({
    tenantId, customerId, type: 'payment', amount: value, method, note: String(note).trim().slice(0, 140), cashSessionId, createdBy: user,
  });
  return { entry, balance: updated.balance };
}

/** Deshace el fiado de una venta anulada: baja el saldo en lo que se había dejado a deber. */
async function reverseSale(store, { tenantId, customerId, orderId, amount, user = '', note = '' }) {
  const value = money(cents(amount));
  if (!(value > 0) || !customerId) return { skipped: true };
  try {
    await store.addEntry({ tenantId, customerId, type: 'void', amount: value, orderId: String(orderId), note, createdBy: user });
  } catch (err) {
    if (err.code === 11000) return { duplicated: true };
    throw err;
  }
  const updated = await store.incBalance(tenantId, customerId, -value, {});
  return { balance: updated?.balance };
}

/** Totales de abonos recibidos en una caja, por forma de pago. */
function paymentTotals(entries) {
  const t = { cash: 0, card: 0, transfer: 0, total: 0, count: 0 };
  for (const e of entries) {
    if (e.type !== 'payment' || !(e.method in t)) continue;
    t[e.method] = money(cents(t[e.method]) + cents(e.amount));
    t.total = money(cents(t.total) + cents(e.amount));
    t.count += 1;
  }
  return t;
}

module.exports = { METHODS, splitSale, limitMessage, agingOf, chargeSale, undoCharge, registerPayment, reverseSale, paymentTotals, httpError };
