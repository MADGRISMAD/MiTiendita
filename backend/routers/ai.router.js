const router = require('express').Router();
const ai = require('../controllers/ai.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const admin = [requireAuth, requireActiveSubscription, requireRoles('admin')];

router.get('/quota', ...admin, ai.quota);
router.post('/preview', ...admin, ai.preview);
router.post('/apply', ...admin, ai.apply);

module.exports = router;
