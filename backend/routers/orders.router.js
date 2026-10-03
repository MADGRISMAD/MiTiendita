const router = require('express').Router();
const orders = require('../controllers/orders.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

router.get(
  '/',
  requireAuth, requireActiveSubscription,
  requireRoles('admin', 'cashier'),
  orders.list
);
// Reportes de ventas por rango de fechas (va antes de /:id para evitar conflicto)
router.get(
  '/report',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  orders.report
);
router.get(
  '/report/summary',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  orders.reportSummary
);

router.get(
  '/:id',
  requireAuth, requireActiveSubscription,
  requireRoles('admin', 'cashier'),
  orders.getById
);
router.post('/', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), orders.create);
router.post('/sale', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), orders.sale);
router.put(
  '/:id/status',
  requireAuth, requireActiveSubscription,
  requireRoles('admin', 'cashier'),
  orders.updateStatus
);
router.put('/:id/pay', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), orders.pay);
router.put('/:id/void', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), orders.voidSale);
router.put(
  '/:id/invoice',
  requireAuth, requireActiveSubscription,
  requireRoles('admin', 'cashier'),
  orders.markInvoiceIssued
);

module.exports = router;
