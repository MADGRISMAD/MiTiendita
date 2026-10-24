const router = require('express').Router();
const { hideCostsFromCashiers } = require('../middleware/cost-guard');
const menus = require('../controllers/menus.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier');
const writeRoles = requireRoles('admin');

// El cajero nunca recibe costos (ver middleware/cost-guard.js)
router.use(hideCostsFromCashiers);

router.get('/', requireAuth, requireActiveSubscription, readRoles, menus.listFoods);
router.get('/lookup', requireAuth, requireActiveSubscription, readRoles, menus.lookupFood);
router.get('/low-stock', requireAuth, requireActiveSubscription, readRoles, menus.lowStockFoods);
router.get('/search', requireAuth, requireActiveSubscription, readRoles, menus.searchFoods);
router.get('/:id', requireAuth, requireActiveSubscription, readRoles, menus.getFood);
router.post('/', requireAuth, requireActiveSubscription, writeRoles, menus.createFood);
router.put('/prices/bulk', requireAuth, requireActiveSubscription, writeRoles, menus.bulkPrices);
router.delete('/bulk', requireAuth, requireActiveSubscription, writeRoles, menus.deleteFoodsBulk);
router.delete('/all', requireAuth, requireActiveSubscription, writeRoles, menus.deleteAllFoods);
router.put('/:id', requireAuth, requireActiveSubscription, writeRoles, menus.updateFood);
router.delete('/:id', requireAuth, requireActiveSubscription, writeRoles, menus.deleteFood);

module.exports = router;
