const router = require('express').Router();
const desktop = require('../controllers/desktop.controller');
const { rateLimit } = require('../services/rate-limit.service');
const { hashCode, normalizeCode } = require('../services/desktop-license.core');

// Activación pública: límite por IP y por código (un código no se puede adivinar a fuerza de intentos)
const byIp = rateLimit({ name: 'desktop-activate-ip', windowMs: 15 * 60 * 1000, max: 10, message: 'Demasiados intentos de activación. Espera 15 minutos.' });
const byCode = rateLimit({
  name: 'desktop-activate-code',
  windowMs: 60 * 60 * 1000,
  max: 10,
  key: (req) => hashCode(normalizeCode(req.body?.code) || 'invalid'),
  message: 'Demasiados intentos con este código. Espera una hora.',
});

router.post('/activate', byIp, byCode, desktop.activate);

module.exports = router;
