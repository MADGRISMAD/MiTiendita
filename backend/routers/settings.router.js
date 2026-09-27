const router = require('express').Router();
const multer = require('multer');
const upload = multer();
const settingsController = require('../controllers/settings.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

// Lectura permitida aunque el trial haya vencido (banner / billing)
router.get('/', requireAuth, upload.none(), settingsController.GetSettings);
router.get('/onboarding', requireAuth, settingsController.GetOnboarding);
router.post('/onboarding/dismiss', requireAuth, requireRoles('admin'), settingsController.DismissOnboarding);
router.get('/support', requireAuth, requireRoles('admin'), settingsController.GetSupport);
router.post('/support', requireAuth, requireRoles('admin'), settingsController.SendSupport);
router.post(
  '/',
  requireAuth,
  requireActiveSubscription,
  requireRoles('admin'),
  upload.none(),
  settingsController.SaveSettings
);
router.put(
  '/',
  requireAuth,
  requireActiveSubscription,
  requireRoles('admin'),
  upload.none(),
  settingsController.SaveSettings
);

module.exports = router;
