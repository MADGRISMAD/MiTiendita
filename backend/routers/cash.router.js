const router = require('express').Router();
const cash = require('../controllers/cash.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

const cashRoles = requireRoles('admin', 'cashier');

router.get('/session', requireAuth, requireLicense, cashRoles, cash.current);
router.post('/session/open', requireAuth, requireLicense, cashRoles, cash.open);
router.post('/session/close', requireAuth, requireLicense, cashRoles, cash.close);
router.get('/session/:id', requireAuth, requireLicense, cashRoles, cash.getById);

module.exports = router;
