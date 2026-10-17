const router = require('express').Router();
const { hideCostsFromCashiers } = require('../middleware/cost-guard');
const menus = require('../controllers/menus.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier');
const writeRoles = requireRoles('admin');

// El cajero nunca recibe costos (ver middleware/cost-guard.js)
router.use(hideCostsFromCashiers);

router.get('/', requireAuth, requireLicense, readRoles, menus.listFoods);
router.get('/lookup', requireAuth, requireLicense, readRoles, menus.lookupFood);
router.get('/low-stock', requireAuth, requireLicense, readRoles, menus.lowStockFoods);
router.get('/search', requireAuth, requireLicense, readRoles, menus.searchFoods);
router.get('/:id', requireAuth, requireLicense, readRoles, menus.getFood);
router.post('/', requireAuth, requireLicense, writeRoles, menus.createFood);
router.put('/prices/bulk', requireAuth, requireLicense, writeRoles, menus.bulkPrices);
router.put('/:id', requireAuth, requireLicense, writeRoles, menus.updateFood);
router.delete('/:id', requireAuth, requireLicense, writeRoles, menus.deleteFood);

module.exports = router;
