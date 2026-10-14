/**
 * Salud, sin autenticación ni datos sensibles.
 *  - GET /health        el proceso vive (para el monitor de uptime)
 *  - GET /health/ready  además la base contesta (503 si no)
 *  - GET /health/jobs   las tareas programadas corrieron a tiempo y sin error (503 si no)
 * `db` se inyecta para poder probarlo sin Mongo.
 */
const { jobsHealth } = require('../services/job-runner.service');

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
  // Las tareas programadas (resumen diario, avisos de pago, promociones): 503 si alguna falló o dejó de correr
  router.get('/jobs', async (_req, res) => {
    try {
      await db.ensureConnection();
      const health = jobsHealth(await db.ListJobRuns());
      res.status(health.ok ? 200 : 503).json(health);
    } catch (err) {
      console.error('[health] no se pudo leer el estado de las tareas:', err.message);
      res.status(503).json({ ok: false, jobs: [] });
    }
  });
  return router;
};
