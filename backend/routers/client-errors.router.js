const router = require('express').Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../services/rate-limit.service');
const errorReport = require('../services/error-report.service');

const clip = (v, n) => String(v ?? '').slice(0, n);

/** Errores de la pantalla (JavaScript del navegador) de una persona con sesión. Va a Sentry; nunca falla. */
router.post('/', requireAuth, limits.clientErrors(), (req, res) => {
  const b = req.body || {};
  const err = new Error(clip(b.message, 300) || 'Error en la pantalla');
  err.stack = clip(b.stack, 4000);
  errorReport.captureError(err, {
    tenantId: req.tenantId,
    user: req.user?.username,
    where: `pantalla ${clip(b.route, 80)}`,
    extra: { url: clip(b.url, 200), userAgent: clip(req.get('user-agent'), 200) },
  });
  res.status(204).end();
});

module.exports = router;
