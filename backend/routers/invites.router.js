const router = require('express').Router();
const { limits } = require('../services/rate-limit.service');
const invites = require('../controllers/invites.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

router.get('/token/:token', limits.publicRead(), invites.getByToken);
router.post('/accept', limits.publicWrite(), invites.accept);

router.get('/', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.list);
router.get('/team', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.team);
router.post('/', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.create);
router.put('/:id/revoke', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.revoke);
router.delete('/:id', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.remove);

module.exports = router;
