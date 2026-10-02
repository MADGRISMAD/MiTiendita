const router = require('express').Router();
const platform = require('../controllers/platform.controller');
const { requireAuth, requireRoles } = require('../middleware/auth.middleware');

const staff = [requireAuth, requireRoles('platform_admin', 'platform_support')];
const adminOnly = [requireAuth, requireRoles('platform_admin')];

router.get('/overview', ...adminOnly, platform.overview);
router.get('/report', ...adminOnly, platform.report);
router.post('/expenses', ...adminOnly, platform.createExpense);
router.delete('/expenses/:id', ...adminOnly, platform.deleteExpense);

router.get('/staff', ...adminOnly, platform.listStaff);
router.post('/staff', ...adminOnly, platform.createStaff);
router.delete('/staff/:id', ...adminOnly, platform.deleteStaff);

router.get('/inbox', ...staff, platform.inbox);
router.get('/tenants', ...staff, platform.listTenants);
router.get('/tenants/:id', ...staff, platform.getTenant);
router.get('/tenants/:id/mail', ...staff, platform.clientMail);
router.post('/tenants/:id/mail', ...staff, platform.sendClientMail);

router.patch('/tenants/:id', ...adminOnly, platform.updateTenant);
router.post('/tenants/:id/suspend', ...adminOnly, platform.suspend);
router.post('/tenants/:id/reactivate', ...adminOnly, platform.reactivate);
router.patch('/tenants/:id/plan', ...adminOnly, platform.setPlan);

module.exports = router;
