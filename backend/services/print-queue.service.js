/**
 * Cola de impresión entre dispositivos: el celular cobra y manda el ticket; la computadora que tiene la impresora
 * (la «estación») lo recoge y lo imprime. Lógica con `db` inyectado para probarla sin base de datos.
 *
 *  - La estación pide trabajos con una petición larga (hasta `waitMs`): el servidor responde en cuanto hay uno,
 *    así llega al instante aunque la pestaña esté en segundo plano (los temporizadores del navegador se frenan ahí).
 *  - Un trabajo lo toma una sola estación a la vez; si esta no responde en 30 s, otro intento puede tomarlo.
 *  - Un ticket que lleva más de 10 minutos esperando ya no se imprime (no sacar tickets viejos de golpe).
 */
const { httpError } = require('../utils/http-error');

const JOB_TTL_MS = 10 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 30 * 1000;
const STATION_ONLINE_MS = 30 * 1000;
const KINDS = ['receipt'];

/** ¿La estación dio señal hace poco? */
function stationOnline(station, now = Date.now()) {
  const seen = station?.lastSeenAt ? new Date(station.lastSeenAt).getTime() : NaN;
  return Number.isFinite(seen) && now - seen <= STATION_ONLINE_MS;
}

/** Estado de la estación para el celular. */
async function stationStatus(db, tenantId, now = Date.now()) {
  const station = await db.GetPrintStation(tenantId);
  return { online: stationOnline(station, now), name: station?.name || '', lastSeenAt: station?.lastSeenAt || null };
}

/** Crea el trabajo de impresión de un ticket ya cobrado. */
async function enqueue(db, { tenantId, orderId, kind = 'receipt', openDrawer = false, user = '' }) {
  if (!KINDS.includes(kind)) throw httpError(400, 'Tipo de impresión no válido.');
  const order = await db.GetOrderById(String(orderId), tenantId);
  if (!order) throw httpError(404, 'Pedido no encontrado.');
  if (order.paymentStatus !== 'paid') throw httpError(400, 'Solo se imprimen tickets de ventas cobradas.');
  const status = await stationStatus(db, tenantId);
  if (!status.online) throw httpError(409, 'La computadora de la caja no está conectada.', 'STATION_OFFLINE');
  const job = await db.CreatePrintJob({
    tenantId: String(tenantId),
    orderId: String(order.id),
    kind,
    openDrawer: Boolean(openDrawer),
    status: 'pending',
    attempts: 0,
    createdBy: user,
    createdAt: new Date(),
  });
  return { id: String(job.id), status: job.status };
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * La estación pide su siguiente trabajo. Deja señal de vida y espera hasta `waitMs` a que haya uno.
 * Devuelve `{ id, kind, openDrawer, order }` o null si no llegó nada.
 */
async function claimNext(db, { tenantId, stationId, stationName = '', waitMs = 12000, intervalMs = 1000, sleep = sleepFor, now = () => new Date() }) {
  if (!stationId) throw httpError(400, 'Falta el identificador de la estación.');
  const deadline = now().getTime() + waitMs;
  for (;;) {
    await db.TouchPrintStation(tenantId, stationId, stationName);
    const job = await db.ClaimPrintJob(tenantId, stationId, { ttlMs: JOB_TTL_MS, claimTimeoutMs: CLAIM_TIMEOUT_MS, now: now() });
    if (job) {
      const order = await db.GetOrderById(job.orderId, tenantId);
      if (!order) {
        await db.FinishPrintJob(job.id, tenantId, stationId, { ok: false, error: 'La venta ya no existe' });
        continue;
      }
      return { id: String(job.id), kind: job.kind, openDrawer: Boolean(job.openDrawer), order };
    }
    if (now().getTime() + intervalMs > deadline) return null;
    await sleep(intervalMs);
  }
}

/** La estación avisa cómo le fue. */
async function report(db, { tenantId, jobId, stationId, ok, error }) {
  const done = await db.FinishPrintJob(jobId, tenantId, stationId, { ok: Boolean(ok), error });
  if (!done) throw httpError(409, 'Ese trabajo ya no lo tiene esta estación.');
}

module.exports = { enqueue, claimNext, report, stationStatus, stationOnline, JOB_TTL_MS, CLAIM_TIMEOUT_MS, STATION_ONLINE_MS };
