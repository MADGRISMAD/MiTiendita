const router = require('express').Router();
const menus = require('../controllers/menus.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier', 'waiter', 'kitchen');
const writeRoles = requireRoles('admin');

router.get('/', requireAuth, requireActiveSubscription, readRoles, menus.listFoods);
router.get('/lookup', requireAuth, requireActiveSubscription, readRoles, menus.lookupFood);
router.get('/low-stock', requireAuth, requireActiveSubscription, readRoles, menus.lowStockFoods);
router.get('/search', requireAuth, requireActiveSubscription, readRoles, menus.searchFoods);
router.get('/:id', requireAuth, requireActiveSubscription, readRoles, menus.getFood);
router.post('/', requireAuth, requireActiveSubscription, writeRoles, menus.createFood);
router.put('/:id', requireAuth, requireActiveSubscription, writeRoles, menus.updateFood);
router.delete('/:id', requireAuth, requireActiveSubscription, writeRoles, menus.deleteFood);

module.exports = router;
