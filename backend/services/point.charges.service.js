/**
 * backend/services/point.charges.service.js
 * El cobro en la terminal va PRIMERO; la venta lo "consume" al registrarse (una sola vez).
 */
const crypto = require('crypto');
const db = require('../database/point.db');
const svc = require('./mercadopago.point.service');

const PAID = new Set(['processed']);
const FAILED = new Set(['failed', 'canceled', 'cancelled', 'expired']);

/** Estado para la UI (Configuración y diálogo de cobro). */
async function status(tenantId) {
  const tenant = await db.GetTenantById(tenantId);
  const p = tenant?.point;
  if (!p?.terminalId) {
    const connected = Boolean(p?.accessToken);
    return {
      configured: false,
      connected,
      ok: false,
      code: connected ? 'no_terminal' : 'not_connected',
      message: connected ? 'Elige tu terminal para cobrar con tarjeta.' : 'Conecta tu cuenta de Mercado Pago.',
    };
  }
  const r = await svc.preflight(tenantId);
  return { configured: true, connected: true, terminalLabel: p.terminalLabel || p.terminalId, ...r };
}

async function disconnect(tenantId) {
  await db.UpdateTenant(tenantId, { point: null, updatedAt: new Date() });
}

/** Crea el cobro en la terminal. Idempotente por clientSaleId + monto mientras siga pendiente. */
async function startCharge({ tenantId, clientSaleId, amount }) {
  if (!clientSaleId) throw svc.httpError('Falta clientSaleId', 400);
  const value = Number(amount).toFixed(2);
  if (!(Number(value) > 0)) throw svc.httpError('Monto inválido', 400);

  const check = await svc.preflight(tenantId);
  if (!check.ok) throw svc.httpError(check.message, 409, check.code);

  const prev = await db.GetPointChargeBySale(clientSaleId, tenantId);
  if (prev && prev.status === 'pending' && prev.amount === Number(value)) return { id: prev.id, status: 'pending' };
  if (prev && prev.status === 'paid' && !prev.consumedBy) return { id: prev.id, status: 'paid' };
  const attempt = (prev?.attempt || 0) + 1;

  const tenant = await db.GetTenantById(tenantId);
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
        config: { point: { terminal_id: tenant.point.terminalId } },
      },
    });
  } catch (err) {
    if (/already has an order|en espera/i.test(err.message)) {
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

  if (PAID.has(s)) {
    const paid = Number(payment?.paid_amount ?? payment?.amount ?? 0);
    const mismatch = Math.abs(paid - charge.amount) > 0.01;
    return db.UpdatePointCharge(chargeId, {
      status: mismatch ? 'review' : 'paid',
      mpStatus: s,
      mpPaymentId: payment?.id || null,
      paidAmount: paid,
      paidAt: new Date(),
      updatedAt: new Date(),
    }, tenantId);
  }
  if (FAILED.has(s)) {
    return db.UpdatePointCharge(chargeId, { status: 'failed', mpStatus: s, updatedAt: new Date() }, tenantId);
  }
  if (s !== charge.mpStatus) await db.UpdatePointCharge(chargeId, { mpStatus: s, updatedAt: new Date() }, tenantId);
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
  if (charge.consumedBy === String(clientSaleId)) return charge;
  const claimed = await db.ClaimPointCharge(chargeId, tenantId, String(clientSaleId));
  if (!claimed) throw svc.httpError('Este cobro ya se usó en otra venta', 409, 'charge_used');
  return claimed;
}

/** Webhook: solo refresca el cobro (el POS ya espera por polling). */
async function onWebhook(mpOrderId) {
  const charge = await db.GetPointChargeByMpOrderId(String(mpOrderId));
  if (charge) await syncCharge(charge.tenantId, charge.id);
}

module.exports = { status, disconnect, startCharge, syncCharge, cancelCharge, consumeCharge, onWebhook };