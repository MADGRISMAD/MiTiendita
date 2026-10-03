const router = require('express').Router();
const platform = require('../controllers/platform.controller');
const { requireAuth, requireRoles } = require('../middleware/auth.middleware');
const { rateLimit } = require('../services/rate-limit.service');

const staff = [requireAuth, requireRoles('platform_admin', 'platform_support')];
const adminOnly = [requireAuth, requireRoles('platform_admin')];
// Todo lo que cambia algo lleva límite por persona: frena errores de script y abuso de una cuenta robada
const writeLimit = rateLimit({ name: 'platform-write', windowMs: 10 * 60 * 1000, max: 120, key: (req) => req.user?.username || req.ip });

router.get('/overview', ...adminOnly, platform.overview);
router.get('/report', ...adminOnly, platform.report);
router.get('/activity', ...adminOnly, platform.activity);
router.post('/expenses', ...adminOnly, writeLimit, platform.createExpense);
router.delete('/expenses/:id', ...adminOnly, writeLimit, platform.deleteExpense);

router.get('/staff', ...adminOnly, platform.listStaff);
router.post('/staff', ...adminOnly, writeLimit, platform.createStaff);
router.delete('/staff/:id', ...adminOnly, writeLimit, platform.deleteStaff);
router.post('/staff/:id/reset-mfa', ...adminOnly, writeLimit, platform.resetStaffMfa);

router.get('/inbox', ...staff, platform.inbox);
router.get('/support', ...staff, platform.support);
router.get('/tenants', ...staff, platform.listTenants);
router.get('/tenants/:id', ...staff, platform.getTenant);
router.get('/tenants/:id/mail', ...staff, platform.clientMail);
router.get('/tenants/:id/activity', ...staff, platform.tenantActivity);
router.post('/tenants/:id/mail', ...staff, writeLimit, platform.sendClientMail);

router.patch('/tenants/:id', ...adminOnly, writeLimit, platform.updateTenant);
router.post('/tenants/:id/suspend', ...adminOnly, writeLimit, platform.suspend);
router.post('/tenants/:id/reactivate', ...adminOnly, writeLimit, platform.reactivate);
router.patch('/tenants/:id/plan', ...adminOnly, writeLimit, platform.setPlan);

module.exports = router;
