/**
 * Portal de socios (/partner). Solo cuentas partner_admin / partner_staff, siempre limitadas a su socio.
 */
const router = require('express').Router();
const partner = require('../controllers/partner.controller');
const { requireAuth, requireRoles } = require('../middleware/auth.middleware');
const { rateLimit } = require('../services/rate-limit.service');

const anyone = [requireAuth, requireRoles('partner_admin', 'partner_staff')];
const owner = [requireAuth, requireRoles('partner_admin')];
const writeLimit = rateLimit({ name: 'partner-write', windowMs: 10 * 60 * 1000, max: 120, key: (req) => req.user?.username || req.ip });

router.get('/home', ...anyone, partner.home);
router.get('/clients', ...anyone, partner.clients);
router.get('/clients/:id', ...anyone, partner.client);
router.post('/clients/:id/notes', ...anyone, writeLimit, partner.addNote);
router.put('/clients/:id/assignee', ...owner, writeLimit, partner.assign);

router.get('/commissions', ...owner, partner.commissions);

router.get('/team', ...anyone, partner.team);
router.post('/team', ...owner, writeLimit, partner.createMember);
router.put('/team/:id/deactivate', ...owner, writeLimit, partner.deactivate);
router.put('/team/:id/reactivate', ...owner, writeLimit, partner.reactivate);
router.put('/team/:id/role', ...owner, writeLimit, partner.changeRole);

module.exports = router;
