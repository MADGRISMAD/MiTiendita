const router = require('express').Router();
const invites = require('../controllers/invites.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

router.get('/token/:token', invites.getByToken);
router.post('/accept', invites.accept);

router.get('/', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.list);
router.post('/', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.create);
router.put('/:id/revoke', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.revoke);
router.delete('/:id', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.remove);

module.exports = router;
