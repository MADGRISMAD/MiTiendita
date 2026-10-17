const router = require('express').Router();
const multer = require('multer');
const upload = multer();
const meseroController = require('../controllers/mesero.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

const staffRoles = requireRoles('admin');

router.get('/', requireAuth, requireLicense, requireRoles('admin', 'cashier'), upload.none(), meseroController.GetWaiters);
router.get('/dispon/:disponibility', requireAuth, requireLicense, staffRoles, upload.none(), meseroController.GetWaiterByDisponibility);
router.get('/:cellphone', requireAuth, requireLicense, staffRoles, upload.none(), meseroController.GetWaiterByCellphone);
router.post('/add', requireAuth, requireLicense, staffRoles, upload.none(), meseroController.AddWaiter);
router.put('/:cellphone', requireAuth, requireLicense, staffRoles, upload.none(), meseroController.UpdateWaiter);
router.delete('/:cellphone', requireAuth, requireLicense, staffRoles, upload.none(), meseroController.DeleteWaiter);

module.exports = router;
