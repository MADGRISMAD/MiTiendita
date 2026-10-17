const router = require('express').Router();
const db = require('../database/mongodb');
const queue = require('../services/print-queue.service');
const { rateLimit } = require('../services/rate-limit.service');
const { hideCostsFromCashiers } = require('../middleware/cost-guard');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

// El cajero que hace de estación recibe la venta completa: sin costos (ver middleware/cost-guard.js)
router.use(hideCostsFromCashiers);

const staff = [requireAuth, requireLicense, requireRoles('admin', 'cashier')];
const byUser = (req) => req.user?.username || req.ip;
const sendLimit = rateLimit({ name: 'print-send', windowMs: 10 * 60 * 1000, max: 300, key: byUser });
const claimLimit = rateLimit({ name: 'print-claim', windowMs: 5 * 60 * 1000, max: 600, key: byUser });

const fail = (res, err) => {
  if (!err.status) console.error(err);
  return res.status(err.status || 500).json({ message: err.message || 'Error en la cola de impresión', code: err.code });
};

// ¿Está conectada la computadora de la caja? (el celular lo consulta antes de mandar el ticket)
router.get('/station', ...staff, async (req, res) => {
  try {
    return res.status(200).json(await queue.stationStatus(db, req.tenantId));
  } catch (err) {
    return fail(res, err);
  }
});

// Mandar un ticket a imprimir en la estación
router.post('/', ...staff, sendLimit, async (req, res) => {
  try {
    const job = await queue.enqueue(db, {
      tenantId: req.tenantId,
      orderId: req.body?.orderId,
      kind: req.body?.kind || 'receipt',
      openDrawer: req.body?.openDrawer,
      user: req.user?.username || '',
    });
    return res.status(201).json(job);
  } catch (err) {
    return fail(res, err);
  }
});

// La estación pide su siguiente trabajo (petición larga: responde en cuanto hay uno o a los ~12 s con null)
router.post('/claim', ...staff, claimLimit, async (req, res) => {
  try {
    const job = await queue.claimNext(db, {
      tenantId: req.tenantId,
      stationId: String(req.body?.stationId || '').slice(0, 64),
      stationName: String(req.body?.name || ''),
      waitMs: 12000,
    });
    return res.status(200).json({ job });
  } catch (err) {
    return fail(res, err);
  }
});

// La estación avisa que imprimió (o que falló)
router.post('/:id/result', ...staff, claimLimit, async (req, res) => {
  try {
    await queue.report(db, {
      tenantId: req.tenantId,
      jobId: req.params.id,
      stationId: String(req.body?.stationId || ''),
      ok: req.body?.ok === true,
      error: req.body?.error,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return fail(res, err);
  }
});

// El celular consulta cómo va su ticket
router.get('/:id', ...staff, async (req, res) => {
  try {
    const job = await db.GetPrintJob(req.params.id, req.tenantId);
    if (!job) return res.status(404).json({ message: 'Trabajo no encontrado' });
    return res.status(200).json({ id: String(job.id), status: job.status, error: job.error || null });
  } catch (err) {
    return fail(res, err);
  }
});

module.exports = router;
