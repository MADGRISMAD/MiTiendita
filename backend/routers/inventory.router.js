const router = require('express').Router();
const inventory = require('../controllers/inventory.controller');
const stocktake = require('../controllers/stocktake.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier');
const writeRoles = requireRoles('admin');

router.get('/suppliers', requireAuth, requireActiveSubscription, readRoles, inventory.listSuppliers);
router.get('/suppliers/:id', requireAuth, requireActiveSubscription, readRoles, inventory.getSupplier);
router.post('/suppliers', requireAuth, requireActiveSubscription, writeRoles, inventory.createSupplier);
router.put('/suppliers/:id', requireAuth, requireActiveSubscription, writeRoles, inventory.updateSupplier);
router.delete('/suppliers/:id', requireAuth, requireActiveSubscription, writeRoles, inventory.deleteSupplier);

router.get('/purchases', requireAuth, requireActiveSubscription, readRoles, inventory.listPurchases);
router.get('/purchases/:id', requireAuth, requireActiveSubscription, readRoles, inventory.getPurchase);
router.post('/purchases', requireAuth, requireActiveSubscription, writeRoles, inventory.createPurchase);

router.get('/lots/expiring', requireAuth, requireActiveSubscription, readRoles, inventory.expiringLots);
router.get('/suggestions', requireAuth, requireActiveSubscription, readRoles, inventory.suggestions);
router.get('/activity', requireAuth, requireActiveSubscription, readRoles, inventory.activity);
router.post('/adjust', requireAuth, requireActiveSubscription, writeRoles, inventory.adjustStock);

// Conteo de inventario: cualquiera de caja puede contar; aplicar y cancelar es del administrador
router.get('/counts', requireAuth, requireActiveSubscription, readRoles, stocktake.list);
router.post('/counts', requireAuth, requireActiveSubscription, writeRoles, stocktake.create);
router.get('/counts/:id', requireAuth, requireActiveSubscription, readRoles, stocktake.get);
router.put('/counts/:id/lines', requireAuth, requireActiveSubscription, readRoles, stocktake.saveCounts);
router.post('/counts/:id/apply', requireAuth, requireActiveSubscription, writeRoles, stocktake.apply);
router.post('/counts/:id/cancel', requireAuth, requireActiveSubscription, writeRoles, stocktake.cancel);

module.exports = router;
