/**
 * Sucursales. Se monta en /org. Solo cuentas de tienda con rol administrador; el servicio vuelve a comprobar
 * en cada petición que sea el DUEÑO de la organización (nada del cliente decide a qué sucursal se entra).
 */
const express = require('express');
const ctrl = require('../controllers/org.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
const { rateLimit } = require('../services/rate-limit.service');

const router = express.Router();
const who = (req) => req.user?.username || req.ip;
const readLimit = rateLimit({ name: 'org-read', windowMs: 10 * 60 * 1000, max: 600, key: who });
const writeLimit = rateLimit({ name: 'org-write', windowMs: 10 * 60 * 1000, max: 40, key: who });
const switchLimit = rateLimit({ name: 'org-switch', windowMs: 10 * 60 * 1000, max: 60, key: who });
const admin = [requireAuth, requireRoles('admin')];
const adminActive = [...admin, requireActiveSubscription];

router.get('/', ...admin, readLimit, ctrl.overview);
router.put('/', ...adminActive, writeLimit, ctrl.rename);
router.post('/branches', ...adminActive, writeLimit, ctrl.createBranch);
router.post('/branches/:id/suspend', ...adminActive, writeLimit, ctrl.suspend);
router.post('/branches/:id/reactivate', ...adminActive, writeLimit, ctrl.reactivate);
router.post('/switch', ...admin, switchLimit, ctrl.switchTo);
router.get('/reports/summary', ...adminActive, readLimit, ctrl.summary);
router.get('/reports/summary.csv', ...adminActive, readLimit, ctrl.summaryCsv);

module.exports = router;
