const router = require('express').Router();
const platform = require('../controllers/platform.controller');
const { requireAuth, requireRoles } = require('../middleware/auth.middleware');
const { rateLimit } = require('../services/rate-limit.service');
const { refuseBranch } = require('../middleware/refuse-branch');
const db = require('../database/mongodb');

// Las sucursales se consultan pero no se modifican desde la plataforma
const notBranch = refuseBranch(db);

const staff = [requireAuth, requireRoles('platform_admin', 'platform_support')];
const adminOnly = [requireAuth, requireRoles('platform_admin')];
// Todo lo que cambia algo lleva límite por persona: frena errores de script y abuso de una cuenta robada
const writeLimit = rateLimit({ name: 'platform-write', windowMs: 10 * 60 * 1000, max: 120, key: (req) => req.user?.username || req.ip });

router.get('/overview', ...adminOnly, platform.overview);
router.get('/report', ...adminOnly, platform.report);
router.get('/activity', ...adminOnly, platform.activity);
// Cobros reales y la parte de cada socio: el controlador además exige ser admin permanente
router.get('/payments', ...adminOnly, platform.ownerPayments);
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

router.patch('/tenants/:id', ...adminOnly, writeLimit, notBranch, platform.updateTenant);
router.post('/tenants/:id/suspend', ...adminOnly, writeLimit, notBranch, platform.suspend);
router.post('/tenants/:id/reactivate', ...adminOnly, writeLimit, notBranch, platform.reactivate);
router.patch('/tenants/:id/plan', ...adminOnly, writeLimit, notBranch, platform.setPlan);
router.put('/tenants/:id/referrer', ...adminOnly, writeLimit, notBranch, platform.setTenantReferrer);
router.post('/tenants/:id/manual-payment', ...adminOnly, writeLimit, notBranch, platform.manualPayment);

router.get('/referrers', ...adminOnly, platform.listReferrers);
router.post('/referrers', ...adminOnly, writeLimit, platform.createReferrer);
router.get('/referrers/:id', ...adminOnly, platform.getReferrer);
router.patch('/referrers/:id', ...adminOnly, writeLimit, platform.updateReferrer);
router.post('/referrers/:id/payouts', ...adminOnly, writeLimit, platform.payReferrer);
router.get('/referrers/:id/users', ...adminOnly, platform.referrerUsers);
router.post('/referrers/:id/users', ...adminOnly, writeLimit, platform.createReferrerUser);
router.put('/referrers/:id/users/:userId/active', ...adminOnly, writeLimit, platform.setReferrerUserActive);
router.post('/commissions/:id/void', ...adminOnly, writeLimit, platform.voidCommission);

module.exports = router;
