const router = require('express').Router();
const { hideCostsFromCashiers } = require('../middleware/cost-guard');
const orders = require('../controllers/orders.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
const { attachRegister } = require('../middleware/register.middleware');

// El cajero nunca recibe costos (ver middleware/cost-guard.js)
router.use(hideCostsFromCashiers);

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
router.post('/removed-lines', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), orders.removedLines);
// Cobrar, devolver y anular usan la caja de esta computadora (X-Register) con su candado por navegador
router.post('/sale', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), attachRegister, orders.sale);
router.put(
  '/:id/status',
  requireAuth, requireActiveSubscription,
  requireRoles('admin', 'cashier'),
  orders.updateStatus
);
router.put('/:id/pay', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), attachRegister, orders.pay);
router.post('/:id/return', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), attachRegister, orders.returnItems);
router.put('/:id/void', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), attachRegister, orders.voidSale);
router.put(
  '/:id/invoice',
  requireAuth, requireActiveSubscription,
  requireRoles('admin', 'cashier'),
  orders.markInvoiceIssued
);

module.exports = router;
