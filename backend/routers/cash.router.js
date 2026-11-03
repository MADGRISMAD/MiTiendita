const router = require('express').Router();
const cash = require('../controllers/cash.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
const { attachRegister } = require('../middleware/register.middleware');

const cashRoles = requireRoles('admin', 'cashier');

// La sesión es la de la caja de esta computadora (X-Register); abrir y cerrar llevan el candado por navegador
router.get('/session', requireAuth, requireActiveSubscription, cashRoles, attachRegister({ allowOverPlan: true }), cash.current);
router.post('/session/open', requireAuth, requireActiveSubscription, cashRoles, attachRegister, cash.open);
router.post('/session/close', requireAuth, requireActiveSubscription, cashRoles, attachRegister({ allowOverPlan: true }), cash.close);
router.get('/session/:id', requireAuth, requireActiveSubscription, cashRoles, cash.getById);

module.exports = router;
