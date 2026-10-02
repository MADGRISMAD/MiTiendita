const db = require('../database/mongodb');
const { supplierSchema } = require('../models/supplier.model');
const { purchaseSchema } = require('../models/purchase.model');
const inventory = require('../services/inventory.service');

function errStatus(err) {
  return err.status || 500;
}

async function listSuppliers(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const list = q
      ? await db.SearchSuppliers(req.tenantId, q)
      : await db.GetSuppliers(req.tenantId);
    return res.status(200).json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar proveedores');
  }
}

async function getSupplier(req, res) {
  try {
    const supplier = await db.GetSupplierById(req.params.id, req.tenantId);
    if (!supplier) return res.status(404).send('Proveedor no encontrado');
    const products = await db.GetFoodsBySupplier(supplier.id, req.tenantId);
    return res.status(200).json({ ...supplier, products });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener proveedor');
  }
}

function supplierPayload(value) {
  return {
    name: String(value.name).trim(),
    contact: String(value.contact || '').trim(),
    whatsapp: String(value.whatsapp || '').trim(),
    visitDays: [...new Set((value.visitDays || []).map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))],
    notes: String(value.notes || '').trim(),
  };
}

async function createSupplier(req, res) {
  try {
    const { error, value } = supplierSchema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).send(error.details.map((d) => d.message).join(', '));
    const now = new Date();
    const created = await db.CreateSupplier({
      ...supplierPayload(value),
      tenantId: req.tenantId,
      createdAt: now,
      updatedAt: now,
    });
    await db.CreateActivityLog({
      tenantId: req.tenantId,
      type: 'supplier_created',
      message: `Alta de proveedor ${created.name}`,
      meta: { supplierId: created.id },
      user: req.user?.username || '',
      createdAt: now,
    }).catch(() => {});
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al crear proveedor');
  }
}

async function updateSupplier(req, res) {
  try {
    const { error, value } = supplierSchema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).send(error.details.map((d) => d.message).join(', '));
    const updated = await db.UpdateSupplier(req.params.id, supplierPayload(value), req.tenantId);
    if (!updated) return res.status(404).send('Proveedor no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al actualizar proveedor');
  }
}

async function deleteSupplier(req, res) {
  try {
    const existing = await db.GetSupplierById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).send('Proveedor no encontrado');
    await db.UnlinkSupplierFromFoods(req.params.id, req.tenantId);
    const result = await db.DeleteSupplier(req.params.id, req.tenantId);
    if (!result?.deletedCount) return res.status(404).send('Proveedor no encontrado');
    await db.CreateActivityLog({
      tenantId: req.tenantId,
      type: 'supplier_deleted',
      message: `Baja de proveedor ${existing.name}`,
      meta: { supplierId: existing.id },
      user: req.user?.username || '',
      createdAt: new Date(),
    }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al eliminar proveedor');
  }
}

async function listPurchases(req, res) {
  try {
    const supplierId = String(req.query.supplierId || '').trim() || null;
    const list = await db.GetPurchases(req.tenantId, { supplierId });
    return res.status(200).json(list);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar compras');
  }
}

async function getPurchase(req, res) {
  try {
    const purchase = await db.GetPurchaseById(req.params.id, req.tenantId);
    if (!purchase) return res.status(404).send('Compra no encontrada');
    return res.status(200).json(purchase);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener compra');
  }
}

async function createPurchase(req, res) {
  try {
    const { error, value } = purchaseSchema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).send(error.details.map((d) => d.message).join(', '));
    const purchase = await inventory.confirmPurchase({
      tenantId: req.tenantId,
      user: req.user,
      body: value,
    });
    return res.status(201).json(purchase);
  } catch (err) {
    console.error(err);
    return res.status(errStatus(err)).send(err.message || 'Error al registrar la compra');
  }
}

async function expiringLots(req, res) {
  try {
    const data = await inventory.listExpiring(req.tenantId, req.query.days);
    if (String(req.query.format || '').toLowerCase() === 'csv') {
      const header = 'Producto,Lote,Caducidad,Dias,Cantidad,Costo unitario,Alerta';
      const lines = (data.items || []).map((row) => {
        const exp = row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 10) : '';
        const label = row.bucket === 'expired' ? 'Vencido' : `${row.daysLeft} dias`;
        return [
          csvCell(row.foodName || ''),
          csvCell(row.lot || ''),
          exp,
          row.daysLeft == null ? '' : row.daysLeft,
          Number(row.quantity) || 0,
          Number(row.unitCost) || 0,
          label,
        ].join(',');
      });
      const csv = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="caducidad.csv"');
      return res.status(200).send(`\uFEFF${csv}`);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al consultar caducidad');
  }
}

function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function suggestions(req, res) {
  try {
    return res.status(200).json(await inventory.purchaseSuggestions(req.tenantId));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al armar el sugerido de compra');
  }
}

async function activity(req, res) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
    return res.status(200).json(await db.GetActivityLog(req.tenantId, limit));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al leer la bitácora');
  }
}

module.exports = {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listPurchases,
  getPurchase,
  createPurchase,
  expiringLots,
  suggestions,
  activity,
};
