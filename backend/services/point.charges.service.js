/**
 * backend/services/point.charges.service.js
 * El cobro en la terminal va PRIMERO; la venta lo "consume" al registrarse (una sola vez).
 */
const crypto = require('crypto');
const db = require('../database/point.db');
const svc = require('./mercadopago.point.service');

const PAID = new Set(['processed']);
// El pago puede figurar aprobado en la transacción antes de que la orden cambie a «processed». Por esa vía solo se acepta si el monto
// es exacto y el pago SIGUE aprobado en una segunda revisión unos segundos después (así un aprobado que no se concreta no cuenta).
const PAYMENT_PAID = new Set(['processed', 'approved', 'accredited']);
const CONFIRM_MS = 5000;
const FAILED = new Set(['failed', 'canceled', 'cancelled', 'expired']);
// Mercado Pago no resuelve este estado solo: hay que confirmar en la terminal si el pago se hizo
const NEEDS_REVIEW = new Set(['action_required']);
const STALE_MS = 30 * 60 * 1000; // un cobro pendiente más viejo que esto ya venció (MP lo expira a los 15 min)
const ORPHAN_WINDOW_MS = 7 * 24 * 3600 * 1000;
const ORPHAN_MIN_AGE_MS = 3 * 60 * 1000; // un cobro recién aprobado todavía se está registrando como venta

/** Estado para la UI (Configuración y diálogo de cobro). */
async function status(tenantId, registerId) {
  const { tenant, terminalId, terminalLabel } = await svc.terminalOf(tenantId, registerId);
  const p = tenant?.point;
  if (!terminalId) {
    const connected = Boolean(p?.accessToken);
    return {
      configured: false,
      connected,
      ok: false,
      code: connected ? 'no_terminal' : 'not_connected',
      message: connected ? 'Elige tu terminal para cobrar con tarjeta.' : 'Conecta tu cuenta de Mercado Pago.',
    };
  }
  const r = await svc.preflight(tenantId, registerId);
  return { configured: true, connected: true, shared: Boolean(p.sharedTerminal), terminalLabel, ...r };
}

async function disconnect(tenantId) {
  await db.ClearTenantPoint(tenantId);
}

/**
 * Antes de mandar un cobro nuevo: si la terminal sigue con el cobro de un intento anterior, se resuelve o se avisa.
 * Mercado Pago solo deja cancelar por API un cobro que la terminal aún no muestra («created»); uno que ya está en pantalla
 * («at_terminal») solo se cancela en la terminal, y mientras siga ahí no recibe otro.
 */
async function assertTerminalFree(tenantId, clientSaleId, terminalId) {
  const tenant = await db.GetTenantById(tenantId);
  const recent = await db.ListPointChargesSince(tenantId, new Date(Date.now() - STALE_MS));
  for (const c of recent) {
    if (c.status !== 'pending' || c.clientSaleId === clientSaleId) continue;
    // Solo cuenta lo pendiente en ESA terminal (los cobros viejos, sin terminal, eran de la terminal de la tienda)
    if ((c.terminalId || tenant?.point?.terminalId) !== terminalId) continue;
    let now = await syncCharge(tenantId, c.id).catch(() => c);
    if (now.status === 'pending') now = await cancelCharge(tenantId, c.id).catch(() => now);
    if (now.status === 'pending') {
      const mins = Math.max(1, Math.round((Date.now() - new Date(c.createdAt).getTime()) / 60000));
      throw svc.httpError(
        `La terminal sigue mostrando un cobro anterior de $${Number(c.amount).toFixed(2)} (de hace ${mins} min). Termínalo o cancélalo en la terminal (sal de Servicios, Ajustes o de la confirmación) y vuelve a intentar.`,
        409,
        'terminal_busy'
      );
    }
  }
}

/** Crea el cobro en la terminal. Idempotente por clientSaleId + monto mientras siga pendiente. */
async function startCharge({ tenantId, clientSaleId, amount, registerId }) {
  if (!clientSaleId) throw svc.httpError('Falta clientSaleId', 400);
  const value = Number(amount).toFixed(2);
  if (!(Number(value) > 0)) throw svc.httpError('Monto inválido', 400);

  const check = await svc.preflight(tenantId, registerId);
  if (!check.ok) throw svc.httpError(check.message, 409, check.code);

  const { terminalId } = await svc.terminalOf(tenantId, registerId);
  await assertTerminalFree(tenantId, String(clientSaleId), terminalId);

  const prev = await db.GetPointChargeBySale(clientSaleId, tenantId);
  if (prev && prev.status === 'pending' && prev.amount === Number(value)) return { id: prev.id, status: 'pending' };
  if (prev && prev.status === 'paid' && !prev.consumedBy) return { id: prev.id, status: 'paid' };
  const attempt = (prev?.attempt || 0) + 1;

  const idem = crypto.createHash('sha256').update(`${tenantId}:${clientSaleId}:${value}:${attempt}`).digest('hex');

  let mpOrder;
  try {
    mpOrder = await svc.mp(tenantId, '/v1/orders', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idem },
      body: {
        type: 'point',
        external_reference: String(clientSaleId),
        description: `Venta ${String(clientSaleId).slice(-6).toUpperCase()}`,
        transactions: { payments: [{ amount: value }] },
        config: {
          point: { terminal_id: terminalId },
          payment_method: { default_type: 'debit_card' },
        },
      },
    });
  } catch (err) {
    if (/already has an order|already_queued|queued|en espera|ocupad|busy/i.test(err.message)) {
      throw svc.httpError('La terminal tiene un cobro pendiente. Termínalo o cancélalo en la terminal.', 409, 'terminal_busy');
    }
    throw err;
  }

  const charge = await db.CreatePointCharge({
    tenantId,
    clientSaleId: String(clientSaleId),
    amount: Number(value),
    mpOrderId: String(mpOrder.id),
    mpStatus: mpOrder.status,
    terminalId,
    registerId: registerId ?? null,
    status: 'pending',
    attempt,
    consumedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id: charge.id, status: 'pending' };
}

/** Consulta a MP (fuente de verdad) y actualiza el cobro. Idempotente. */
async function syncCharge(tenantId, chargeId) {
  const charge = await db.GetPointCharge(chargeId, tenantId);
  if (!charge) throw svc.httpError('Cobro no encontrado', 404);
  if (charge.status !== 'pending') return charge;

  const mpOrder = await svc.mp(tenantId, `/v1/orders/${charge.mpOrderId}`);
  const s = String(mpOrder.status || '').toLowerCase();
  const payment = mpOrder.transactions?.payments?.[0];

  const orderPaid = PAID.has(s);
  const paymentApproved = !orderPaid && !FAILED.has(s) && PAYMENT_PAID.has(String(payment?.status || '').toLowerCase());
  if (paymentApproved) {
    const approvedAmount = Number(payment?.paid_amount ?? 0);
    const firstSeen = charge.approvedSeenAt ? new Date(charge.approvedSeenAt).getTime() : 0;
    const exact = Math.abs(approvedAmount - charge.amount) <= 0.01;
    if (exact && !firstSeen) {
      await db.UpdatePointCharge(chargeId, { approvedSeenAt: new Date(), mpStatus: s, updatedAt: new Date() }, tenantId);
      return { ...charge, mpStatus: s };
    }
    if (!exact || Date.now() - firstSeen < CONFIRM_MS) return { ...charge, mpStatus: s };
  }
  if (orderPaid || paymentApproved) {
    const paid = Number(payment?.paid_amount ?? payment?.amount ?? 0);
    const mismatch = Math.abs(paid - charge.amount) > 0.01;
    return db.UpdatePointCharge(chargeId, {
      status: mismatch ? 'review' : 'paid',
      reviewReason: mismatch ? 'amount' : null,
      mpStatus: s,
      mpPaymentId: payment?.id || null,
      paidAmount: paid,
      paidAt: new Date(),
      updatedAt: new Date(),
    }, tenantId);
  }
  if (NEEDS_REVIEW.has(s)) {
    return db.UpdatePointCharge(chargeId, { status: 'review', reviewReason: 'action_required', mpStatus: s, updatedAt: new Date() }, tenantId);
  }
  if (FAILED.has(s)) {
    return db.UpdatePointCharge(chargeId, { status: 'failed', mpStatus: s, updatedAt: new Date() }, tenantId);
  }
  // Si había un «aprobado» que ya no se sostiene, se descarta
  if (s !== charge.mpStatus || charge.approvedSeenAt) {
    await db.UpdatePointCharge(chargeId, { mpStatus: s, approvedSeenAt: null, updatedAt: new Date() }, tenantId);
  }
  return { ...charge, mpStatus: s };
}

/** Cancela en la terminal. Si ya se pagó justo en ese momento, devuelve 'paid'. */
async function cancelCharge(tenantId, chargeId) {
  const charge = await db.GetPointCharge(chargeId, tenantId);
  if (!charge) throw svc.httpError('Cobro no encontrado', 404);
  if (charge.status === 'pending') {
    try {
      await svc.mp(tenantId, `/v1/orders/${charge.mpOrderId}/cancel`, { method: 'POST' });
    } catch {
      /* si ya no se puede cancelar, el sync de abajo dice qué pasó */
    }
  }
  return syncCharge(tenantId, chargeId);
}

/**
 * Llamar desde syncSale ANTES de guardar la venta.
 * Garantiza: cobro del tenant, aprobado, monto igual y usado UNA sola vez.
 * Reintentos con el mismo clientSaleId son válidos (ventas offline que se reenvían).
 */
async function consumeCharge(tenantId, chargeId, { clientSaleId, total }) {
  let charge = await db.GetPointCharge(chargeId, tenantId);
  if (!charge) throw svc.httpError('Cobro con terminal no encontrado', 400, 'charge_not_found');
  if (charge.status === 'pending') charge = await syncCharge(tenantId, chargeId);
  if (charge.status !== 'paid') throw svc.httpError('El cobro con terminal no está aprobado', 409, 'charge_not_paid');
  if (Math.abs(Number(total) - charge.amount) > 0.01) {
    throw svc.httpError('El total de la venta no coincide con lo cobrado en la terminal', 409, 'amount_mismatch');
  }
  // Usado por una venta que ya no existe (se borró al fallar el registro): vuelve a quedar libre
  if (charge.consumedBy && charge.consumedBy !== String(clientSaleId)) {
    const sold = await db.FindPaidSaleIds(tenantId, [String(charge.consumedBy)]);
    if (!sold.length) {
      await db.ReleasePointCharge(chargeId, tenantId, charge.consumedBy);
      charge = (await db.GetPointCharge(chargeId, tenantId)) || charge;
    }
  }
  if (charge.consumedBy === String(clientSaleId)) return charge;
  const claimed = await db.ClaimPointCharge(chargeId, tenantId, String(clientSaleId));
  if (!claimed) throw svc.httpError('Este cobro ya se usó en otra venta', 409, 'charge_used');
  return claimed;
}

/**
 * Devuelve el dinero al cliente en Mercado Pago (reembolso total de la orden).
 * Idempotente: si el cobro ya se reembolsó no vuelve a llamar a MP. Lanza si MP lo rechaza.
 */
async function refundCharge(tenantId, chargeId) {
  const charge = await db.GetPointCharge(chargeId, tenantId);
  if (!charge) throw svc.httpError('No encontré el cobro de esta venta en Mercado Pago.', 404, 'charge_not_found');
  if (charge.refundedAt) return charge;
  if (charge.status !== 'paid' && charge.status !== 'review') {
    throw svc.httpError('Este cobro no está aprobado en Mercado Pago, no hay nada que devolver.', 409, 'charge_not_paid');
  }
  try {
    await svc.mp(tenantId, `/v1/orders/${charge.mpOrderId}/refund`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': crypto.createHash('sha256').update(`refund:${charge.mpOrderId}`).digest('hex') },
    });
  } catch (err) {
    if (!/already.*refund|ya.*reembols/i.test(err.message)) {
      throw svc.httpError(`Mercado Pago no pudo devolver el dinero: ${err.message}`, err.status === 409 ? 409 : 502, err.code || 'refund_failed');
    }
  }
  return db.UpdatePointCharge(chargeId, { refundedAt: new Date(), updatedAt: new Date() }, tenantId);
}

/** Libera un cobro cuya venta no llegó a guardarse (para reutilizarlo en el reintento y no cobrar dos veces). */
async function releaseCharge(tenantId, chargeId, clientSaleId) {
  await db.ReleasePointCharge(chargeId, tenantId, String(clientSaleId));
}

/**
 * Cobros que Mercado Pago aprobó pero que no tienen una venta en MiTiendita (los últimos 7 días):
 *  - no_sale: aprobado y nunca se usó en una venta;
 *  - lost_sale: se usó en una venta que ya no existe;
 *  - review: aprobado por otro monto, o Mercado Pago pide confirmar en la terminal.
 */
async function unconsumed(tenantId, { minAgeMs = ORPHAN_MIN_AGE_MS } = {}) {
  const rows = await db.ListPointChargesSince(tenantId, new Date(Date.now() - ORPHAN_WINDOW_MS));
  let refreshed = 0;
  const fresh = await Promise.all(
    rows.map(async (c) => {
      // Un pendiente puede haberse aprobado después (el cliente pagó con la pantalla ya cerrada o recargada)
      if (c.status === 'pending' && refreshed++ < 5) return syncCharge(tenantId, c.id).catch(() => c);
      return c;
    })
  );
  const open = fresh.filter((c) => (c.status === 'paid' || c.status === 'review') && !c.refundedAt);
  const used = open.filter((c) => c.consumedBy).map((c) => String(c.consumedBy));
  const sold = new Set(used.length ? await db.FindPaidSaleIds(tenantId, used) : []);
  return open
    .filter((c) => !c.consumedBy || !sold.has(String(c.consumedBy)))
    .filter((c) => Date.now() - new Date(c.paidAt || c.updatedAt || c.createdAt).getTime() >= minAgeMs)
    .map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      paidAmount: c.paidAmount == null ? null : Number(c.paidAmount),
      status: c.status,
      reason: c.status === 'review' ? 'review' : c.consumedBy ? 'lost_sale' : 'no_sale',
      reviewReason: c.reviewReason || '',
      createdAt: c.createdAt,
      paidAt: c.paidAt || null,
    }));
}

/** Webhook: solo refresca el cobro (el POS ya espera por polling). */
async function onWebhook(mpOrderId) {
  const charge = await db.GetPointChargeByMpOrderId(String(mpOrderId));
  if (charge) await syncCharge(charge.tenantId, charge.id);
}

module.exports = { status, disconnect, startCharge, syncCharge, cancelCharge, consumeCharge, releaseCharge, refundCharge, unconsumed, onWebhook };