/**
 * backend/middleware/register.middleware.js
 * Caja de la computadora que hace la petición (MultiCaja).
 *
 * - `X-Register`: número de caja (sin encabezado = Caja 1). Debe estar en las cajas del plan → `req.registerId`.
 * - `X-Device`: id aleatorio del navegador → `req.deviceId`.
 * - Candado por navegador: en las peticiones que escriben (todo lo que no es GET), si la sesión abierta de esa caja
 *   la abrió otro navegador, se responde 409 `register_in_use`. Una petición sin `X-Device` cuenta como otro
 *   navegador; las sesiones sin `deviceId` (anteriores a MultiCaja) no se bloquean. El reintento de una venta ya
 *   cobrada sí pasa (ver isPaidSaleRetry).
 *
 * Va después de `requireActiveSubscription` (usa `req.tenant.plan`).
 */
const db = require('../database/mongodb');
const registersDb = require('../database/registers.db');
const { listRegisters } = require('../services/registers.service');

/**
 * Reintento de una venta ya cobrada (p. ej. una venta sin conexión que se sincroniza): `POST /orders/sale` la
 * devuelve tal cual sin tocar la caja, así que el candado no debe hacerla perder.
 */
async function isPaidSaleRetry(req) {
  if (req.method !== 'POST' || !/\/orders\/sale$/.test(`${req.baseUrl}${req.path}`)) return false;
  const clientSaleId = String(req.body?.clientSaleId || '').trim();
  if (!clientSaleId) return false;
  const order = await db.GetOrderByClientSaleId(clientSaleId, req.tenantId);
  return order?.paymentStatus === 'paid';
}

async function attachRegister(req, res, next) {
  try {
    const raw = req.get('x-register');
    const number = raw == null || raw === '' ? 1 : Number(raw);
    req.deviceId = String(req.get('x-device') || '').trim().slice(0, 64) || null;

    const registers = await listRegisters(registersDb, req.tenantId, req.tenant?.plan);
    if (!registers.some((r) => r.number === number)) {
      return res.status(409).json({ code: 'register_unknown', message: 'Esta caja ya no existe. Elige tu caja de nuevo.' });
    }
    req.registerId = number;

    if (req.method !== 'GET') {
      const session = await db.GetOpenCashSession(req.tenantId, number);
      if (session?.deviceId && session.deviceId !== req.deviceId && !(await isPaidSaleRetry(req))) {
        return res.status(409).json({
          code: 'register_in_use',
          openedBy: session.openedBy || null,
          message: `Abierta por ${session.openedBy || 'otro usuario'} en otro equipo.`,
        });
      }
    }
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error al revisar la caja');
  }
}

module.exports = { attachRegister };
