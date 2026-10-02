const router = require('express').Router();
const cash = require('../controllers/cash.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const cashRoles = requireRoles('admin', 'cashier');

router.get('/session', requireAuth, requireActiveSubscription, cashRoles, cash.current);
router.post('/session/open', requireAuth, requireActiveSubscription, cashRoles, cash.open);
router.post('/session/close', requireAuth, requireActiveSubscription, cashRoles, cash.close);
router.get('/session/:id', requireAuth, requireActiveSubscription, cashRoles, cash.getById);

module.exports = router;
