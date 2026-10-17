const router = require('express').Router();
const { hideCostsFromCashiers } = require('../middleware/cost-guard');
const orders = require('../controllers/orders.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

// El cajero nunca recibe costos (ver middleware/cost-guard.js)
router.use(hideCostsFromCashiers);

router.get(
  '/',
  requireAuth, requireLicense,
  requireRoles('admin', 'cashier'),
  orders.list
);
// Reportes de ventas por rango de fechas (va antes de /:id para evitar conflicto)
router.get(
  '/report',
  requireAuth, requireLicense, requireRoles('admin', 'cashier'),
  orders.report
);
router.get(
  '/report/summary',
  requireAuth, requireLicense, requireRoles('admin', 'cashier'),
  orders.reportSummary
);

router.get(
  '/:id',
  requireAuth, requireLicense,
  requireRoles('admin', 'cashier'),
  orders.getById
);
router.post('/', requireAuth, requireLicense, requireRoles('admin', 'cashier'), orders.create);
router.post('/removed-lines', requireAuth, requireLicense, requireRoles('admin', 'cashier'), orders.removedLines);
router.post('/sale', requireAuth, requireLicense, requireRoles('admin', 'cashier'), orders.sale);
router.put(
  '/:id/status',
  requireAuth, requireLicense,
  requireRoles('admin', 'cashier'),
  orders.updateStatus
);
router.put('/:id/pay', requireAuth, requireLicense, requireRoles('admin', 'cashier'), orders.pay);
router.post('/:id/return', requireAuth, requireLicense, requireRoles('admin', 'cashier'), orders.returnItems);
router.put('/:id/void', requireAuth, requireLicense, requireRoles('admin', 'cashier'), orders.voidSale);
router.put(
  '/:id/invoice',
  requireAuth, requireLicense,
  requireRoles('admin', 'cashier'),
  orders.markInvoiceIssued
);

module.exports = router;
