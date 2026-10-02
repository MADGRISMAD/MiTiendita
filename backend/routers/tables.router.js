const router = require('express').Router();
const tables = require('../controllers/tables.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const floorRoles = requireRoles('admin', 'hosstess', 'waiter', 'cashier');

router.get('/', requireAuth, requireActiveSubscription, floorRoles, tables.list);
router.get('/:id', requireAuth, requireActiveSubscription, floorRoles, tables.getById);
router.post('/', requireAuth, requireActiveSubscription, requireRoles('admin', 'hosstess'), tables.create);
router.put('/:id', requireAuth, requireActiveSubscription, floorRoles, tables.update);
router.delete('/:id', requireAuth, requireActiveSubscription, requireRoles('admin'), tables.remove);

module.exports = router;
