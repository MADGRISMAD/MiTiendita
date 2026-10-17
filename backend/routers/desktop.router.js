const router = require('express').Router();
const licenses = require('../services/license.service');
const db = require('../database/mongodb');
const { rateLimit } = require('../services/rate-limit.service');

const reactivateLimit = rateLimit({ name: 'desktop-reactivate', windowMs: 15 * 60 * 1000, max: 10, message: 'Demasiados intentos. Espera 15 minutos.' });

/** Estado de la licencia de esta computadora y si ya existe la tienda (para que la interfaz sepa a dónde ir). */
router.get('/status', async (_req, res) => {
  const hasStore = (await db.ListTenants()).length > 0;
  return res.json({ ...licenses.publicState(), hasStore });
});

/** Reactivar en línea (licencia de otra computadora o archivo dañado). No crea ni toca la tienda. */
router.post('/reactivate', reactivateLimit, async (req, res) => {
  try {
    const { code, email } = req.body || {};
    await licenses.activateOnline({ code, email: String(email || '').trim().toLowerCase(), ownerName: '', businessName: '' });
    return res.json(licenses.publicState());
  } catch (err) {
    if (err.status) return res.status(err.status).json({ code: err.code, message: err.message });
    console.error('[licencia]', err);
    return res.status(500).json({ code: 'ERROR', message: 'No se pudo reactivar.' });
  }
});

module.exports = router;
