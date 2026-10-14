const router = require('express').Router();
const billing = require('../controllers/billing.controller');
const { requireAuth, requireRoles } = require('../middleware/auth.middleware');
const db = require('../database/mongodb');

/** Las sucursales no pagan solas: la suscripción es una sola y vive en la matriz de la organización. */
async function matrixPays(req, res, next) {
  try {
    const tenant = await db.GetTenantById(req.tenantId);
    if (tenant?.isBranch) {
      return res.status(409).json({
        code: 'BILLED_BY_MATRIX',
        message: 'Las sucursales se pagan desde la matriz. Cámbiate a la matriz para ver o cambiar el plan.',
      });
    }
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).send('No se pudo validar la suscripción');
  }
}

// Público / sin suscripción (para poder pagar aunque esté bloqueado)
router.get('/plans', billing.getPlans);
router.post('/webhook', billing.webhook);

router.get('/status', requireAuth, requireRoles('admin', 'cashier'), billing.getStatus);
router.get('/history', requireAuth, requireRoles('admin', 'cashier'), billing.history);
router.post('/checkout', requireAuth, requireRoles('admin'), matrixPays, billing.checkout);
router.post('/sync', requireAuth, requireRoles('admin'), matrixPays, billing.sync);
router.post('/cancel', requireAuth, requireRoles('admin'), matrixPays, billing.cancel);
router.post('/dev/activate', requireAuth, requireRoles('admin'), matrixPays, billing.devActivate);

module.exports = router;
