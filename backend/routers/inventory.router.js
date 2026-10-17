const router = require('express').Router();
const { hideCostsFromCashiers } = require('../middleware/cost-guard');
const inventory = require('../controllers/inventory.controller');
const stocktake = require('../controllers/stocktake.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier');
const writeRoles = requireRoles('admin');

// El cajero nunca recibe costos (ver middleware/cost-guard.js)
router.use(hideCostsFromCashiers);

router.get('/suppliers', requireAuth, requireLicense, readRoles, inventory.listSuppliers);
router.get('/suppliers/:id', requireAuth, requireLicense, readRoles, inventory.getSupplier);
router.post('/suppliers', requireAuth, requireLicense, writeRoles, inventory.createSupplier);
router.put('/suppliers/:id', requireAuth, requireLicense, writeRoles, inventory.updateSupplier);
router.delete('/suppliers/:id', requireAuth, requireLicense, writeRoles, inventory.deleteSupplier);

router.get('/purchases', requireAuth, requireLicense, writeRoles, inventory.listPurchases);
router.get('/purchases/:id', requireAuth, requireLicense, writeRoles, inventory.getPurchase);
router.post('/purchases', requireAuth, requireLicense, writeRoles, inventory.createPurchase);

router.get('/lots/expiring', requireAuth, requireLicense, readRoles, inventory.expiringLots);
router.get('/suggestions', requireAuth, requireLicense, writeRoles, inventory.suggestions);
// La bitácora es del dueño: el cajero no la lee
router.get('/activity', requireAuth, requireLicense, requireRoles('admin'), inventory.activity);
router.post('/adjust', requireAuth, requireLicense, writeRoles, inventory.adjustStock);
router.post('/exchange', requireAuth, requireLicense, writeRoles, inventory.exchange);
router.get('/exchanges', requireAuth, requireLicense, writeRoles, inventory.listExchanges);

// Conteo de inventario: cualquiera de caja puede contar; aplicar y cancelar es del administrador
router.get('/counts', requireAuth, requireLicense, readRoles, stocktake.list);
router.post('/counts', requireAuth, requireLicense, writeRoles, stocktake.create);
router.get('/counts/:id', requireAuth, requireLicense, readRoles, stocktake.get);
router.put('/counts/:id/lines', requireAuth, requireLicense, readRoles, stocktake.saveCounts);
router.post('/counts/:id/apply', requireAuth, requireLicense, writeRoles, stocktake.apply);
router.post('/counts/:id/cancel', requireAuth, requireLicense, writeRoles, stocktake.cancel);

module.exports = router;
