const router = require('express').Router();
const multer = require('multer');
const upload = multer();
const userController = require('../controllers/user.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

router.post('/register', upload.none(), userController.CreateUser);
router.post('/login', upload.none(), userController.LoginUsuario, (req, res) => {
  return res.status(200).json({
    token: req.token,
    role: req.role,
    tenantId: req.tenantId,
    username: req.username,
  });
});
router.post('/forgot-password', upload.none(), userController.ForgotPassword);
router.post('/reset-password', upload.none(), userController.ResetPassword);

router.get('/me', requireAuth, userController.Me);
router.put('/change-password', requireAuth, upload.none(), userController.ChangePassword);

router.get('/find', requireAuth, requireActiveSubscription, requireRoles('admin'), upload.none(), userController.FindUserByEmail);
router.get(
  '/waitlist/',
  requireAuth,
  requireActiveSubscription,
  requireRoles('admin', 'hosstess'),
  upload.none(),
  userController.GetWaitList
);
router.post(
  '/waitlist/add',
  requireAuth,
  requireActiveSubscription,
  requireRoles('admin', 'hosstess'),
  upload.none(),
  userController.AddWaitList
);
router.delete(
  '/waitlist/delete/:id',
  requireAuth,
  requireActiveSubscription,
  requireRoles('admin', 'hosstess'),
  upload.none(),
  userController.DeleteWaitList
);

module.exports = router;
