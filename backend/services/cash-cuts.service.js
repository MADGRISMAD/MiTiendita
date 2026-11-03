/**
 * backend/services/cash-cuts.service.js
 * Corte X: entrega de la caja entre cajeros sin cerrarla. Lo contado se vuelve el nuevo punto de partida.
 *
 * Toda la lógica pasa por `store` para probarla sin base de datos (ver database/cash-cuts.db.js). Store:
 *   cutsBySession(tenantId, sessionId) -> Cut[] (más antiguo primero)   insertCut(cut) -> Cut con id
 *   getCut(tenantId, id) -> Cut|null    updateCut(tenantId, id, patch, fromStatus) -> Cut|null
 *   pendingFor(tenantId, username) -> Cut[]    listCuts(tenantId, filtros) -> Cut[]
 *   findUser(tenantId, username) -> usuario|null
 *   ordersBySession(tenantId, sessionId) -> pedidos    abonosBySession(tenantId, sessionId) -> abonos
 */
const { httpError } = require('../utils/http-error');
const { summarizeOrders } = require('./cash-summary');
const { paymentTotals } = require('./credit.service');

const cents = (n) => Math.round(Number(n || 0) * 100);
const money = (c) => c / 100;

/**
 * Lo esperado en el cajón desde el último punto de partida (último Corte X, o la apertura).
 * Se calcula con acumulados de TODA la sesión menos la instantánea guardada en el último corte, así una anulación
 * o devolución posterior de una venta anterior al corte también baja el tramo (sin depender de fechas).
 */
async function expectedSince(store, { tenantId, session }) {
  const cuts = await store.cutsBySession(tenantId, session.id);
  const last = cuts[cuts.length - 1] || null;
  const baseline = last ? Number(last.countedCash) : Number(session.openingFloat || 0);
  const since = last ? new Date(last.createdAt) : new Date(session.openedAt || 0);

  const cashTotal = summarizeOrders(await store.ordersBySession(tenantId, session.id)).cash;
  const abonosCashTotal = paymentTotals(await store.abonosBySession(tenantId, session.id)).cash;
  const refundsTotal = Number(session.cashRefunds || 0);
  const cash = money(cents(cashTotal) - cents(last ? last.cashSalesAtCut : 0));
  const abonosCash = money(cents(abonosCashTotal) - cents(last ? last.abonosCashAtCut : 0));
  const refunds = money(cents(refundsTotal) - cents(last ? last.refundsAtCut : 0));
  const expected = money(cents(baseline) + cents(cash) + cents(abonosCash) - cents(refunds));
  return { baseline, since, cash, abonosCash, refunds, expected, cashTotal, abonosCashTotal, refundsTotal };
}

async function createCut(store, { tenantId, session, fromUser, toUser, countedCash }) {
  if (!session || session.status !== 'open' || session.closedAt) throw httpError(400, 'Abre la caja antes de hacer un Corte X.', 'cash_closed');
  const numeric = typeof countedCash === 'number' || (typeof countedCash === 'string' && countedCash.trim() !== '');
  const counted = numeric ? Number(countedCash) : NaN;
  if (!Number.isFinite(counted) || counted < 0) throw httpError(400, 'Indica el efectivo contado (0 o más).');
  const to = String(toUser || '').trim();
  if (!to) throw httpError(400, 'Elige quién recibe la caja.');
  if (to === fromUser) throw httpError(400, 'No puedes entregarte la caja a ti mismo.');
  if (!(await store.findUser(tenantId, to))) throw httpError(400, 'Ese usuario no existe en tu tienda.');

  const { expected, cashTotal, abonosCashTotal, refundsTotal } = await expectedSince(store, { tenantId, session });
  const countedCents = cents(counted);
  return store.insertCut({
    tenantId: String(tenantId),
    registerId: Number(session.registerId) || 1,
    sessionId: String(session.id),
    fromUser,
    toUser: to,
    countedCash: money(countedCents),
    expectedCash: expected,
    difference: money(countedCents - cents(expected)),
    refundsAtCut: refundsTotal,
    cashSalesAtCut: cashTotal,
    abonosCashAtCut: abonosCashTotal,
    status: 'pending',
    confirmedCash: null,
    confirmedAt: null,
    createdAt: new Date(),
  });
}

async function confirmCut(store, { tenantId, cutId, user, confirmedCash }) {
  const cut = await store.getCut(tenantId, cutId);
  if (!cut) throw httpError(404, 'Ese Corte X no existe.');
  if (cut.toUser !== user) throw httpError(403, 'Solo quien recibe la caja puede confirmarla.');
  if (cut.status !== 'pending') throw httpError(409, 'Ese Corte X ya fue respondido.');
  let confirmed = cut.countedCash;
  if (confirmedCash !== undefined && confirmedCash !== null && confirmedCash !== '') {
    confirmed = Number(confirmedCash);
    if (!Number.isFinite(confirmed) || confirmed < 0) throw httpError(400, 'Indica el efectivo que cuentas (0 o más).');
    confirmed = money(cents(confirmed));
  }
  const status = cents(confirmed) === cents(cut.countedCash) ? 'confirmed' : 'disputed';
  const updated = await store.updateCut(tenantId, cutId, { status, confirmedCash: confirmed, confirmedAt: new Date() }, 'pending');
  if (!updated) throw httpError(409, 'Ese Corte X ya fue respondido.');
  return updated;
}

const pendingFor = (store, tenantId, username) => store.pendingFor(tenantId, username);
const listCuts = (store, tenantId, filters = {}) => store.listCuts(tenantId, filters);

/** Ventas cobradas agrupadas por cajero (`order.user`). `cuts` se acepta por compatibilidad con el desglose del corte final. */
function segmentsOf(orders, cuts) { // eslint-disable-line no-unused-vars
  const by = new Map();
  for (const o of orders) {
    if (o.paymentStatus !== 'paid') continue;
    const user = o.user || '';
    if (!by.has(user)) by.set(user, []);
    by.get(user).push(o);
  }
  return [...by].map(([user, rows]) => {
    const t = summarizeOrders(rows);
    return { user, cash: t.cash, card: t.card, total: t.total, count: t.count };
  });
}

module.exports = { expectedSince, createCut, confirmCut, pendingFor, listCuts, segmentsOf };
