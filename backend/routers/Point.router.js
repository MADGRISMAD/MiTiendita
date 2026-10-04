/**
 * backend/routers/point.router.js
 * Se monta con:  app.use('/point', require('./routers/point.router'));
 *
 * ⚠️ AJUSTA SOLO EL BLOQUE "Middleware": copia cómo importa `auth` tu cash.router.js.
 *    Abajo intento detectar el nombre de la función exportada por auth.middleware.js.
 */
const express = require('express');
const svc = require('../services/mercadopago.point.service');
const charges = require('../services/point.charges.service');
const authMw = require('../middleware/auth.middleware');
const { normalizeRole, isPlatformStaff } = require('../models/tenant.model');

/* ───────────── Middleware ───────────── */
const pick = (...names) => {
  if (typeof authMw === 'function') return authMw;
  for (const n of names) if (typeof authMw[n] === 'function') return authMw[n];
  return null;
};
const auth = pick('auth', 'authenticate', 'authMiddleware', 'verifyToken', 'requireAuth', 'authRequired');
if (!auth) {
  throw new Error('point.router.js: no encontré la función de auth en middleware/auth.middleware.js. Copia el import de cash.router.js.');
}
// Solo el dueño (admin) conecta cuenta y terminal; el cajero solo cobra
function adminOnly(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (role === 'admin' || isPlatformStaff(role)) return next();
  return res.status(403).json({ message: 'Solo el administrador puede hacer esto.' });
}

const router = express.Router();
const fail = (res, err) => res.status(err.status || 500).json({ message: err.message, code: err.code });

/* ───────────── Conexión de cuenta (admin) ───────────── */
router.get('/connect', auth, adminOnly, (req, res) => {
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
    console.error('[point oauth]', err.message);
    res.redirect(`${back}&mp=error`);
  }
});

router.delete('/connection', auth, adminOnly, async (req, res) => {
  try { await charges.disconnect(req.tenantId); res.sendStatus(204); } catch (e) { fail(res, e); }
});

/* ───────────── Terminal (admin) ───────────── */
router.get('/terminals', auth, adminOnly, async (req, res) => {
  try { res.json(await svc.listTerminals(req.tenantId)); } catch (e) { fail(res, e); }
});
router.post('/terminal', auth, adminOnly, async (req, res) => {
  try { res.json(await svc.registerTerminal(req.tenantId, String(req.body?.terminalId || ''))); } catch (e) { fail(res, e); }
});

/* ───────────── Estado y cobros (admin y cajero) ───────────── */
router.get('/status', auth, async (req, res) => {
  try { res.json(await charges.status(req.tenantId)); } catch (e) { fail(res, e); }
});

router.post('/charges', auth, async (req, res) => {
  try {
    const { clientSaleId, amount } = req.body || {};
    res.status(201).json(await charges.startCharge({ tenantId: req.tenantId, clientSaleId, amount }));
  } catch (e) { fail(res, e); }
});

router.get('/charges/:id', auth, async (req, res) => {
  try {
    const c = await charges.syncCharge(req.tenantId, req.params.id);
    res.json({ status: c.status === 'paid' ? 'paid' : c.status === 'pending' ? 'pending' : 'failed', mpStatus: c.mpStatus });
  } catch (e) { fail(res, e); }
});

router.post('/charges/:id/cancel', auth, async (req, res) => {
  try {
    const c = await charges.cancelCharge(req.tenantId, req.params.id);
    res.json({ status: c.status === 'paid' ? 'paid' : c.status === 'pending' ? 'pending' : 'failed' });
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