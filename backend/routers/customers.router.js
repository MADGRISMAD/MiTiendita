const router = require('express').Router();
const db = require('../database/mongodb');
const creditDb = require('../database/credit.db');
const credit = require('../services/credit.service');
const insights = require('../services/customer-insights.service');
const { rateLimit } = require('../services/rate-limit.service');
const { requireAuth, requireLicense, requireRoles } = require('../middleware/auth.middleware');

// Listar clientes (con búsqueda opcional por query ?q=)
router.get(
  '/',
  requireAuth, requireLicense, requireRoles('admin', 'cashier'),
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

const staff = [requireAuth, requireLicense, requireRoles('admin', 'cashier')];
const failCredit = (res, err) => {
  if (!err.status) console.error(err);
  return res.status(err.status || 500).json({ message: err.message || 'Error en cuentas por cobrar', code: err.code });
};
const paymentLimit = rateLimit({ name: 'credit-payment', windowMs: 10 * 60 * 1000, max: 120, key: (req) => req.user?.username || req.ip });

// Cuentas por cobrar: quién debe, cuánto y desde cuándo. (Va antes de '/:id' para no confundirse con un id.)
router.get('/credit/summary', ...staff, async (req, res) => {
  try {
    const owing = await creditDb.customersWithBalance(req.tenantId);
    const entries = await creditDb.allEntriesForCustomers(req.tenantId, owing.map((c) => c.id));
    const byCustomer = new Map();
    for (const e of entries) {
      if (!byCustomer.has(e.customerId)) byCustomer.set(e.customerId, []);
      byCustomer.get(e.customerId).push(e);
    }
    const rows = owing.map((c) => {
      const aging = credit.agingOf(byCustomer.get(c.id) || []);
      return { id: c.id, name: c.name, phone: c.phone || '', balance: c.balance, creditLimit: c.creditLimit || 0, since: aging.since, days: aging.days };
    });
    rows.sort((a, b) => b.days - a.days || b.balance - a.balance);
    const total = Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100;
    return res.status(200).json({ total, count: rows.length, customers: rows });
  } catch (err) {
    return failCredit(res, err);
  }
});

// Clientes frecuentes: compras, gasto, última visita y segmento de cada cliente (va antes de '/:id')
router.get('/insights', ...staff, async (req, res) => {
  try {
    const now = new Date();
    const since30 = new Date(now.getTime() - insights.WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [customers, stats] = await Promise.all([db.GetCustomers(req.tenantId), db.CustomerOrderStats(req.tenantId, since30)]);
    return res.status(200).json(insights.withStats(customers, stats, now));
  } catch (err) {
    return failCredit(res, err);
  }
});

// Historial de compras de un cliente
router.get('/:id/history', ...staff, async (req, res) => {
  try {
    const customer = await db.GetCustomerById(req.params.id, req.tenantId);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    const orders = await db.GetOrdersByCustomer(req.tenantId, customer.id);
    return res.status(200).json(insights.historyOf(orders));
  } catch (err) {
    return failCredit(res, err);
  }
});

// Estado de cuenta de un cliente
router.get('/:id/credit', ...staff, async (req, res) => {
  try {
    const customer = await creditDb.getCustomer(req.tenantId, req.params.id);
    if (!customer) return res.status(404).json({ message: 'Cliente no encontrado' });
    const entries = await creditDb.listEntries(req.tenantId, customer.id);
    const aging = credit.agingOf([...entries].reverse());
    return res.status(200).json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone || '' },
      balance: Number(customer.balance) || 0,
      creditLimit: Number(customer.creditLimit) || 0,
      available: Math.max(0, (Number(customer.creditLimit) || 0) - (Number(customer.balance) || 0)),
      since: aging.since,
      days: aging.days,
      entries,
    });
  } catch (err) {
    return failCredit(res, err);
  }
});

// Recibir un abono (entra a la caja abierta)
router.post('/:id/payments', ...staff, paymentLimit, async (req, res) => {
  try {
    const session = await db.GetOpenCashSession(req.tenantId);
    const result = await credit.registerPayment(creditDb, {
      tenantId: req.tenantId,
      customerId: req.params.id,
      amount: req.body?.amount,
      method: String(req.body?.method || 'cash'),
      note: req.body?.note,
      user: req.user?.username || '',
      cashSessionId: session?.id || null,
    });
    return res.status(201).json(result);
  } catch (err) {
    return failCredit(res, err);
  }
});

// Fijar el límite de fiado (solo administrador)
router.put('/:id/credit-limit', requireAuth, requireLicense, requireRoles('admin'), async (req, res) => {
  try {
    const limit = Number(req.body?.creditLimit);
    if (!Number.isFinite(limit) || limit < 0 || limit > 1_000_000) {
      return res.status(400).json({ message: 'El límite debe ser un monto de 0 a 1,000,000 (0 = sin fiado).' });
    }
    const updated = await creditDb.setLimit(req.tenantId, req.params.id, limit);
    if (!updated) return res.status(404).json({ message: 'Cliente no encontrado' });
    return res.status(200).json(updated);
  } catch (err) {
    return failCredit(res, err);
  }
});

// Obtener cliente por id
router.get(
  '/:id',
  requireAuth, requireLicense, requireRoles('admin', 'cashier'),
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
  requireAuth, requireLicense, requireRoles('admin', 'cashier'),
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
  requireAuth, requireLicense, requireRoles('admin', 'cashier'),
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
// Solo el administrador: el cliente lleva su historial y su libro de fiado
router.delete(
  '/:id',
  requireAuth, requireLicense, requireRoles('admin'),
  async (req, res) => {
    try {
      const customer = await creditDb.getCustomer(req.tenantId, req.params.id);
      if (customer && Math.abs(Number(customer.balance) || 0) > 0.004) {
        return res.status(409).send('Este cliente tiene saldo en fiado. Cóbrale o ajústalo antes de eliminarlo.');
      }
      const result = await db.DeleteCustomer(req.params.id, req.tenantId);
      if (!result.deletedCount) return res.status(404).send('Cliente no encontrado');
      await db
        .CreateActivityLog({
          tenantId: String(req.tenantId),
          type: 'customer_deleted',
          message: `Baja del cliente ${customer?.name || req.params.id}`,
          meta: { customerId: String(req.params.id), name: customer?.name || '', creditLimit: Number(customer?.creditLimit) || 0 },
          user: req.user?.username || '',
          createdAt: new Date(),
        })
        .catch(() => {});
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).send(err.message || 'Error al eliminar cliente');
    }
  }
);

module.exports = router;
