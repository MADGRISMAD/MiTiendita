const router = require('express').Router();
const multer = require('multer');
const upload = multer();
const userController = require('../controllers/user.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
const { limits } = require('../services/rate-limit.service');

router.post('/register', limits.register(), upload.none(), userController.CreateUser);
router.post('/login', limits.login(), upload.none(), userController.LoginUsuario);
router.post('/login/mfa', limits.mfa(), userController.LoginMfa);
router.post('/refresh', limits.refresh(), userController.RefreshSession);
router.post('/logout', userController.Logout);
router.post('/forgot-password', limits.forgot(), upload.none(), userController.ForgotPassword);
router.post('/reset-password', limits.reset(), upload.none(), userController.ResetPassword);

router.get('/me', requireAuth, userController.Me);
router.put('/change-password', requireAuth, limits.mfa(), upload.none(), userController.ChangePassword);

// 2FA: alta con sesión o, para el equipo de la plataforma, con el token del login
router.post('/mfa/setup', limits.mfa(), userController.MfaSetup);
router.post('/mfa/enable', limits.mfa(), userController.MfaEnable);
router.post('/mfa/disable', requireAuth, limits.mfa(), userController.MfaDisable);

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
