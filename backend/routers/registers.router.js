/**
 * Cajas de la tienda (MultiCaja). Se monta en /registers.
 * Dueño y cajero ven la lista; solo el dueño la configura y libera una caja abierta.
 * `release` NO lleva `attachRegister`: el candado por navegador no debe impedir que el dueño libere una caja
 * desde otro equipo.
 */
const router = require('express').Router();
const registers = require('../controllers/registers.controller');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

const auth = [requireAuth, requireActiveSubscription];
const adminOnly = requireRoles('admin');

router.get('/', auth, requireRoles('admin', 'cashier'), registers.list);
router.put('/', auth, adminOnly, registers.save);
router.post('/:number/release', auth, adminOnly, registers.release);

module.exports = router;
