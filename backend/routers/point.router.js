/**
 * Terminal de cobro Mercado Pago Point. Se monta en /point.
 * Dueño (admin): conecta la cuenta y elige la terminal. Dueño y cajero: ven el estado y cobran.
 */
const express = require('express');
const svc = require('../services/mercadopago.point.service');
const charges = require('../services/point.charges.service');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
const { rateLimit } = require('../services/rate-limit.service');

/* ───────────── Middleware ───────────── */
const auth = [requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier')];
const adminOnly = requireRoles('admin');

const router = express.Router();
const who = (req) => req.user?.username || req.ip;
const startLimit = rateLimit({ name: 'point-start', windowMs: 10 * 60 * 1000, max: 60, key: who });
const pollLimit = rateLimit({ name: 'point-poll', windowMs: 10 * 60 * 1000, max: 1500, key: who });
const adminLimit = rateLimit({ name: 'point-admin', windowMs: 10 * 60 * 1000, max: 40, key: who });
const outcome = (c) => (['paid', 'pending', 'review'].includes(c.status) ? c.status : 'failed');
const fail = (res, err) => res.status(err.status || 500).json({ message: err.message, code: err.code });

/* ───────────── Conexión de cuenta (admin) ───────────── */
router.get('/connect', auth, adminOnly, adminLimit, (req, res) => {
  try { res.json({ url: svc.buildAuthUrl(req.tenantId) }); } catch (e) { fail(res, e); }
});

// Lo abre el navegador al volver de Mercado Pago: SIN auth
router.get('/oauth/callback', async (req, res) => {
  const back = `${String(process.env.APP_URL || '').replace(/\/$/, '')}/settings?s=terminal`;
  try {
    if (req.query.error || !req.query.code) throw new Error('cancelled');
    await svc.handleOAuthCallback({ code: req.query.code, state: req.query.state });
    res.redirect(`${back}&mp=ok`);
  } catch (err) {
    console.error('[point oauth]', err.code || '', err.status || '', err.message);
    const reason = err.message === 'cancelled' ? 'cancelled' : err.code || (err.status === 400 ? 'state' : 'unknown');
    res.redirect(`${back}&mp=error&reason=${encodeURIComponent(reason)}&detail=${encodeURIComponent(String(err.message).slice(0, 120))}`);
  }
});

router.delete('/connection', auth, adminOnly, adminLimit, async (req, res) => {
  try { await charges.disconnect(req.tenantId); res.sendStatus(204); } catch (e) { fail(res, e); }
});

/* ───────────── Terminal (admin) ───────────── */
router.get('/terminals', auth, adminOnly, async (req, res) => {
  try { res.json(await svc.listTerminals(req.tenantId)); } catch (e) { fail(res, e); }
});
router.post('/terminal', auth, adminOnly, adminLimit, async (req, res) => {
  try { res.json(await svc.registerTerminal(req.tenantId, String(req.body?.terminalId || ''))); } catch (e) { fail(res, e); }
});

/* ───────────── Estado y cobros (admin y cajero) ───────────── */
router.get('/status', auth, async (req, res) => {
  try { res.json(await charges.status(req.tenantId)); } catch (e) { fail(res, e); }
});

router.post('/charges', auth, startLimit, async (req, res) => {
  try {
    const { clientSaleId, amount } = req.body || {};
    res.status(201).json(await charges.startCharge({ tenantId: req.tenantId, clientSaleId, amount }));
  } catch (e) { fail(res, e); }
});

router.get('/charges/:id', auth, pollLimit, async (req, res) => {
  try {
    const c = await charges.syncCharge(req.tenantId, req.params.id);
    res.json({ status: outcome(c), mpStatus: c.mpStatus });
  } catch (e) { fail(res, e); }
});

router.post('/charges/:id/cancel', auth, startLimit, async (req, res) => {
  try {
    const c = await charges.cancelCharge(req.tenantId, req.params.id);
    res.json({ status: outcome(c) });
  } catch (e) { fail(res, e); }
});

/* ───────────── Webhook de Mercado Pago (SIN auth, valida firma) ───────────── */
router.post('/webhook', async (req, res) => {
  if (!svc.verifyWebhookSignature(req)) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    const id = req.body?.data?.id || req.query['data.id'];
    if (id) await charges.onWebhook(id);
  } catch (err) {
    console.error('[point webhook]', err.message);
  }
});

module.exports = router;