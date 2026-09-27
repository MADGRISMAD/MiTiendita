const router = require('express').Router();
const menus = require('../controllers/menus.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier', 'waiter', 'kitchen');
const writeRoles = requireRoles('admin');

router.post('/seed-starter', requireAuth, requireActiveSubscription, writeRoles, menus.seedStarter);
router.get('/', requireAuth, requireActiveSubscription, readRoles, menus.listMenus);
router.get('/:id', requireAuth, requireActiveSubscription, readRoles, menus.getMenu);
router.post('/', requireAuth, requireActiveSubscription, writeRoles, menus.createMenu);
router.put('/:id', requireAuth, requireActiveSubscription, writeRoles, menus.updateMenu);
router.delete('/:id', requireAuth, requireActiveSubscription, writeRoles, menus.deleteMenu);

module.exports = router;
