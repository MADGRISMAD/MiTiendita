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
 * - Caja por encima del plan (se bajó de plan) que aún tiene sesión abierta: no vende ni cobra (403
 *   `register_over_plan`, ver blockOverPlan) pero sí puede hacer su corte (`attachRegister({ allowOverPlan: true })`).
 *
 * Va después de `requireActiveSubscription` (usa `req.tenant.plan`).
 */
const db = require('../database/mongodb');
const registersDb = require('../database/registers.db');
const { listRegisters } = require('../services/registers.service');
const { registerLimitOf } = require('../services/plans.catalog');

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

/** Caja por encima del plan: no puede vender, cobrar, abonar, devolver ni anular; solo hacer su corte. */
function blockOverPlan(req, res, next) {
  if (req.registerId > registerLimitOf(req.tenant?.plan)) {
    return res.status(403).json({ code: 'register_over_plan', message: 'Tu plan ya no incluye esta caja. Haz su corte para cerrarla.' });
  }
  return next();
}

/** Uso: `attachRegister` directo, o `attachRegister({ allowOverPlan: true })` para las rutas del corte. */
function attachRegister(arg, res, next) {
  if (!res) return (req, rs, nx) => handle(req, rs, nx, arg || {});
  return handle(arg, res, next, {});
}

async function handle(req, res, next, { allowOverPlan = false }) {
  try {
    const raw = req.get('x-register');
    const number = raw == null || raw === '' ? 1 : Number(raw);
    req.deviceId = String(req.get('x-device') || '').trim().slice(0, 64) || null;

    const registers = await listRegisters(registersDb, req.tenantId, req.tenant?.plan);
    const known = registers.some((r) => r.number === number);
    // Una caja fuera del plan con la sesión abierta sigue existiendo hasta que se haga su corte
    const overPlanOpen = !known && number > registerLimitOf(req.tenant?.plan) && !!(await db.GetOpenCashSession(req.tenantId, number));
    if (!known && !overPlanOpen) {
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
    return allowOverPlan ? next() : blockOverPlan(req, res, next);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error al revisar la caja');
  }
}

module.exports = { attachRegister, blockOverPlan };
