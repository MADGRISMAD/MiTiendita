const router = require('express').Router();
const { limits, rateLimit } = require('../services/rate-limit.service');
const invites = require('../controllers/invites.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

router.get('/token/:token', limits.publicRead(), invites.getByToken);
router.post('/accept', limits.publicWrite(), invites.accept);

router.get('/', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.list);
router.get('/team', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.team);
router.post('/', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.create);
// Cambios de equipo: solo el dueño, con límite por tienda para frenar abusos o scripts
const teamWrite = [
  requireAuth,
  requireActiveSubscription,
  requireRoles('admin'),
  rateLimit({ name: 'team-write', windowMs: 10 * 60 * 1000, max: 60, key: (req) => req.tenantId || req.ip }),
];
router.put('/team/:id/deactivate', ...teamWrite, invites.deactivateUser);
router.put('/team/:id/reactivate', ...teamWrite, invites.reactivateUser);
router.put('/team/:id/role', ...teamWrite, invites.changeUserRole);
router.put('/:id/revoke', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.revoke);
router.delete('/:id', requireAuth, requireActiveSubscription, requireRoles('admin'), invites.remove);

module.exports = router;
