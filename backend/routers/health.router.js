/**
 * Salud, sin autenticación ni datos sensibles.
 *  - GET /health        el proceso vive (para el monitor de uptime)
 *  - GET /health/ready  además la base contesta (503 si no)
 * `db` se inyecta para poder probarlo sin Mongo.
 */
module.exports = function healthRouter(db = require('../database/mongodb')) {
  const router = require('express').Router();
  router.get('/', (_req, res) => res.status(200).json({ ok: true }));
  router.get('/ready', async (_req, res) => {
    try {
      await db.ensureConnection();
      await db.Ping();
      res.status(200).json({ ok: true, db: 'up' });
    } catch (err) {
      console.error('[health] base no disponible:', err.message);
      res.status(503).json({ ok: false, db: 'down' });
    }
  });
  return router;
};
