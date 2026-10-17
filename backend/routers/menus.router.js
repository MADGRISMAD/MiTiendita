const router = require('express').Router();
const menus = require('../controllers/menus.controller');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

const readRoles = requireRoles('admin', 'cashier');
const writeRoles = requireRoles('admin');

router.get('/', requireAuth, requireLicense, readRoles, menus.listMenus);
router.get('/:id', requireAuth, requireLicense, readRoles, menus.getMenu);
router.post('/', requireAuth, requireLicense, writeRoles, menus.createMenu);
router.put('/:id', requireAuth, requireLicense, writeRoles, menus.updateMenu);
router.delete('/:id', requireAuth, requireLicense, writeRoles, menus.deleteMenu);

module.exports = router;
