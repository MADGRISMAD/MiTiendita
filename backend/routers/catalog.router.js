const router = require('express').Router();
const catalog = require('../controllers/catalog.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

// Solo el dueño arma el catálogo de la tienda.
const admin = [requireAuth, requireActiveSubscription, requireRoles('admin')];

router.get('/', ...admin, catalog.list);
router.post('/add', ...admin, catalog.add);

module.exports = router;
