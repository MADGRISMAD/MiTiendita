const router = require('express').Router();
const { limits, rateLimit } = require('../services/rate-limit.service');
const invites = require('../controllers/invites.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

router.get('/token/:token', limits.publicRead(), invites.getByToken);
router.post('/accept', limits.publicWrite(), invites.accept);

router.get('/', requireAuth, requireLicense, requireRoles('admin'), invites.list);
router.get('/team', requireAuth, requireLicense, requireRoles('admin'), invites.team);
router.post('/', requireAuth, requireLicense, requireRoles('admin'), invites.create);
// Cambios de equipo: solo el dueño, con límite por tienda para frenar abusos o scripts
const teamWrite = [
  requireAuth,
  requireLicense,
  requireRoles('admin'),
  rateLimit({ name: 'team-write', windowMs: 10 * 60 * 1000, max: 60, key: (req) => req.tenantId || req.ip }),
];
router.put('/team/:id/deactivate', ...teamWrite, invites.deactivateUser);
router.put('/team/:id/reactivate', ...teamWrite, invites.reactivateUser);
router.put('/team/:id/role', ...teamWrite, invites.changeUserRole);
router.put('/:id/revoke', requireAuth, requireLicense, requireRoles('admin'), invites.revoke);
router.delete('/:id', requireAuth, requireLicense, requireRoles('admin'), invites.remove);

module.exports = router;
