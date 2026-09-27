const router = require('express').Router();
const billing = require('../controllers/billing.controller');
const { requireAuth, requireRoles } = require('../middleware/auth.middleware');

// Público / sin suscripción (para poder pagar aunque esté bloqueado)
router.get('/plans', billing.getPlans);
router.post('/webhook', billing.webhook);

router.get('/status', requireAuth, requireRoles('admin', 'cashier'), billing.getStatus);
router.get('/history', requireAuth, requireRoles('admin', 'cashier'), billing.history);
router.post('/checkout', requireAuth, requireRoles('admin'), billing.checkout);
router.post('/sync', requireAuth, requireRoles('admin'), billing.sync);
router.post('/cancel', requireAuth, requireRoles('admin'), billing.cancel);
router.post('/dev/activate', requireAuth, requireRoles('admin'), billing.devActivate);

module.exports = router;
