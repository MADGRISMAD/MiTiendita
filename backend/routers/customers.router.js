const router = require('express').Router();
const db = require('../database/mongodb');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');

// Listar clientes (con búsqueda opcional por query ?q=)
router.get(
  '/',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  async (req, res) => {
    try {
      const q = req.query.q;
      const list = q
        ? await db.SearchCustomers(req.tenantId, q)
        : await db.GetCustomers(req.tenantId);
      return res.status(200).json(list);
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || 'Error al listar clientes');
    }
  }
);

// Obtener cliente por id
router.get(
  '/:id',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  async (req, res) => {
    try {
      const customer = await db.GetCustomerById(req.params.id, req.tenantId);
      if (!customer) return res.status(404).send('Cliente no encontrado');
      return res.status(200).json(customer);
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || 'Error al obtener cliente');
    }
  }
);

// Crear cliente
router.post(
  '/',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  async (req, res) => {
    try {
      const { name, phone, email, notes } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).send('El nombre es obligatorio');
      }
      const now = new Date();
      const customer = await db.CreateCustomer({
        name: String(name).trim(),
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
        notes: String(notes || '').trim(),
        tenantId: req.tenantId,
        createdAt: now,
        updatedAt: now,
      });
      return res.status(201).json(customer);
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || 'Error al crear cliente');
    }
  }
);

// Actualizar cliente
router.put(
  '/:id',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  async (req, res) => {
    try {
      const { name, phone, email, notes } = req.body || {};
      const data = {};
      if (name !== undefined) data.name = String(name).trim();
      if (phone !== undefined) data.phone = String(phone).trim();
      if (email !== undefined) data.email = String(email).trim();
      if (notes !== undefined) data.notes = String(notes).trim();
      const updated = await db.UpdateCustomer(req.params.id, data, req.tenantId);
      if (!updated) return res.status(404).send('Cliente no encontrado');
      return res.status(200).json(updated);
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || 'Error al actualizar cliente');
    }
  }
);

// Eliminar cliente
router.delete(
  '/:id',
  requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'),
  async (req, res) => {
    try {
      const result = await db.DeleteCustomer(req.params.id, req.tenantId);
      if (!result.deletedCount) return res.status(404).send('Cliente no encontrado');
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || 'Error al eliminar cliente');
    }
  }
);

module.exports = router;
