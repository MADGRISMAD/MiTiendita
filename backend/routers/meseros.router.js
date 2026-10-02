const router = require('express').Router();
const multer = require('multer');
const upload = multer();
const meseroController = require('../controllers/mesero.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const staffRoles = requireRoles('admin');

router.get('/', requireAuth, requireActiveSubscription, requireRoles('admin', 'hosstess', 'waiter', 'cashier'), upload.none(), meseroController.GetWaiters);
router.get('/dispon/:disponibility', requireAuth, requireActiveSubscription, staffRoles, upload.none(), meseroController.GetWaiterByDisponibility);
router.get('/:cellphone', requireAuth, requireActiveSubscription, staffRoles, upload.none(), meseroController.GetWaiterByCellphone);
router.post('/add', requireAuth, requireActiveSubscription, staffRoles, upload.none(), meseroController.AddWaiter);
router.put('/:cellphone', requireAuth, requireActiveSubscription, staffRoles, upload.none(), meseroController.UpdateWaiter);
router.delete('/:cellphone', requireAuth, requireActiveSubscription, staffRoles, upload.none(), meseroController.DeleteWaiter);

module.exports = router;
