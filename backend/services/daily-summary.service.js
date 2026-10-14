/**
 * Resumen diario por correo al dueño. Se envía una vez al día, pasada la hora de cierre en la zona de la tienda,
 * y solo si hubo movimiento. El día se reserva antes de enviar (atómico), así dos instancias no mandan dos correos.
 */
const { round2 } = require('../utils/tax');
const { storeParts, storeDayKey, storeDayRange } = require('../utils/store-time');

const SEND_FROM_HOUR = 21; // 9 pm hora de la tienda
const MAX_LOW_STOCK = 15;


/** Arma los números del día. Funciones puras: reciben lo que ya leyó la base. */
function buildSummary({ orders = [], sessions = [], lowStock = [] }) {
  const paid = orders.filter((o) => o.paymentStatus === 'paid');
  const voided = orders.filter((o) => o.paymentStatus === 'refunded' || o.status === 'cancelled');
  const byMethod = { cash: 0, card: 0, transfer: 0, other: 0 };
  let total = 0;
  let credit = 0;
  let profit = 0;
  let costKnown = false;
  for (const o of paid) {
    const amount = Number(o.total) || 0;
    total += amount;
    const method = o.paymentMethod || 'cash';
    if (method === 'credit') credit += Number(o.creditAmount) || 0;
    if (method === 'cash') byMethod.cash += amount;
    else if (method === 'card') byMethod.card += amount;
    else if (method === 'transfer') byMethod.transfer += amount;
    else if (method !== 'credit') byMethod.other += amount;
    for (const it of o.items || []) {
      const cost = Number(it.unitCost) || 0;
      if (cost > 0) {
        costKnown = true;
        profit += ((Number(it.price) || 0) - cost) * (Number(it.quantity) || 0);
      }
    }
  }
  const lastCut = sessions.slice().sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))[0];
  return {
    count: paid.length,
    total: round2(total),
    avgTicket: paid.length ? round2(total / paid.length) : 0,
    profit: costKnown ? round2(profit) : null,
    byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, round2(v)])),
    credit: round2(credit),
    voids: { count: voided.length, total: round2(voided.reduce((a, o) => a + (Number(o.total) || 0), 0)) },
    cash: lastCut ? { difference: round2(lastCut.difference), counted: round2(lastCut.countedCash) } : null,
    lowStock: lowStock
      .slice()
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0))
      .slice(0, MAX_LOW_STOCK)
      .map((f) => ({ name: f.name, stock: Number(f.stock) || 0 })),
    hadActivity: paid.length > 0 || voided.length > 0 || sessions.length > 0,
  };
}

/** ¿Toca enviar ahora? Pasada la hora de cierre y sin haber enviado ya el día de hoy. */
function isDue(settings, now = new Date()) {
  const parts = storeParts(now, settings.timezone);
  if (!parts || parts.hour < SEND_FROM_HOUR) return false;
  return settings.lastDailySummary !== storeDayKey(now, settings.timezone);
}

function dayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Revisa todas las tiendas con el resumen activado y envía las que toquen. Devuelve cuántos correos salieron. */
async function sendDue(db, mail, { now = new Date(), appUrl = process.env.APP_URL || 'https://www.mitiendita.software' } = {}) {
  let sent = 0;
  for (const settings of await db.ListSettingsWithDailySummary()) {
    if (!isDue(settings, now)) continue;
    const tenantId = String(settings.tenantId);
    const key = storeDayKey(now, settings.timezone);
    if (!(await db.ClaimDailySummary(tenantId, key))) continue;
    try {
      const range = storeDayRange(key, settings.timezone);
      const [orders, sessions, lowStock] = await Promise.all([
        db.GetOrdersByDateRange(tenantId, range.from, range.to),
        db.GetClosedCashSessionsBetween(tenantId, range.from, range.to),
        db.GetLowStockFoods(tenantId),
      ]);
      const summary = buildSummary({ orders, sessions, lowStock });
      if (!summary.hadActivity) continue; // día sin movimiento: no se manda nada (ya quedó reservado)
      const res = await mail.sendDailySummaryEmail({
        to: settings.dailySummaryEmail,
        storeName: settings.businessName,
        dayLabel: dayLabel(key),
        summary,
        appUrl,
      });
      if (res?.sent === false) throw new Error(res.error || 'no se envió');
      sent += 1;
    } catch (err) {
      console.warn('[resumen diario] falló, se reintenta en la siguiente revisión:', err.message);
      await db.ReleaseDailySummary(tenantId, key).catch(() => {});
    }
  }
  return sent;
}

module.exports = { buildSummary, isDue, sendDue, dayLabel, SEND_FROM_HOUR };
