const db = require('../database/mongodb');
const { normalizeOrder, orderStatuses, paymentMethods, newToken } = require('../models/order.model');

async function ensureInvoiceToken(order) {
  if (!order || order.invoiceToken) return order;
  return db.UpdateOrder(order.id, { invoiceToken: newToken(), updatedAt: new Date() }, order.tenantId);
}

async function list(req, res) {
  try {
    return res.status(200).json(await db.GetOrders(req.tenantId));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar pedidos');
  }
}

async function getById(req, res) {
  try {
    const order = await ensureInvoiceToken(await db.GetOrderById(req.params.id, req.tenantId));
    if (!order) return res.status(404).send('Pedido no encontrado');
    return res.status(200).json(order);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener pedido');
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    if ((!body.items || !body.items.length) && Array.isArray(body.foods)) {
      body.items = body.foods.map((f) => ({
        foodId: f.food || f.foodId || f.id,
        name: f.name || 'Producto',
        price: Number(f.price || 0),
        quantity: Number(f.quantity || 1),
      }));
    }
    if (typeof body.modality === 'number') {
      body.modality = body.modality === 2 ? 'takeaway' : 'dine-in';
    }

    const payload = normalizeOrder(body);
    payload.tenantId = req.tenantId;
    payload.invoiceToken = newToken();
    if (!payload.items.length) {
      return res.status(400).send('El pedido necesita al menos un producto');
    }

    const created = await db.CreateOrder(payload);

    if (payload.tableId && payload.modality === 'dine-in') {
      try {
        await db.UpdateStatusMesa(
          payload.tableId,
          {
            disponible: false,
            personaTitular: body.personaTitular || payload.tableName,
          },
          req.tenantId
        );
      } catch (e) {
        console.warn('No se pudo ocupar la mesa:', e.message);
      }
    }

    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al crear pedido');
  }
}

async function updateStatus(req, res) {
  try {
    const status = req.body?.status;
    if (!orderStatuses.includes(status)) {
      return res.status(400).send('Estado inválido');
    }
    const updated = await db.UpdateOrder(
      req.params.id,
      { status, updatedAt: new Date() },
      req.tenantId
    );
    if (!updated) return res.status(404).send('Pedido no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al actualizar estado');
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function settlePayment(req, existing, body, { requireCash = true, paidAt } = {}) {
  const method = body?.paymentMethod || 'cash';
  if (!paymentMethods.includes(method)) {
    throw httpError(400, 'Método de pago inválido');
  }
  if (existing.paymentStatus === 'paid') return existing;

  const session = await db.GetOpenCashSession(req.tenantId);
  if (requireCash && !session) {
    throw httpError(400, 'Debes abrir la caja antes de cobrar');
  }

  const { cartTotals, DEFAULT_TAX_RATE } = require('../utils/tax');
  const cardExtraIva = method === 'card' && Boolean(body?.cardExtraIva);
  const totals = cartTotals(existing.items || [], {
    discountPercent: existing.discountPercent || 0,
    taxRate: existing.taxRate || DEFAULT_TAX_RATE,
    cardExtraIva,
  });
  const deliveryFee = Number(existing.deliveryFee || 0);
  const total = Number((totals.total + deliveryFee).toFixed(2));

  const settings = await db.GetSettings(req.tenantId);
  if (settings?.inventoryEnabled && !existing.inventoryApplied) {
    const nextItems = [];
    for (const item of existing.items || []) {
      const foodId = item.foodId || item.food;
      const qty = Number(item.quantity) || 0;
      if (!foodId || !qty) {
        nextItems.push(item);
        continue;
      }
      try {
        const result = await db.ApplySaleDecrement(foodId, qty, req.tenantId);
        nextItems.push({
          ...item,
          lotAllocations: result.allocations || [],
        });
      } catch (e) {
        console.warn('No se pudo descontar stock:', foodId, e.message);
        nextItems.push(item);
      }
    }
    existing = { ...existing, items: nextItems };
  }

  const cashReceived = Number(body?.cashReceived ?? 0);
  const cardAmount = Number(body?.cardAmount ?? 0);
  const change =
    cashReceived > 0
      ? Number((cashReceived - (method === 'split' ? total - cardAmount : total)).toFixed(2))
      : 0;

  const updated = await db.UpdateOrder(
    existing.id,
    {
      paymentStatus: 'paid',
      paymentMethod: method,
      status: existing.status === 'cancelled' ? existing.status : 'served',
      paidAt: paidAt || new Date(),
      updatedAt: new Date(),
      cashSessionId: session?.id || null,
      tax: totals.tax,
      cardExtraIva,
      cardExtraTax: totals.cardExtraTax,
      total,
      cashReceived: cashReceived || null,
      cardAmount: method === 'split' ? cardAmount : null,
      change: change > 0 ? change : 0,
      inventoryApplied: Boolean(settings?.inventoryEnabled),
      items: existing.items || [],
    },
    req.tenantId
  );

  if (existing.tableId) {
    try {
      await db.UpdateStatusMesa(
        existing.tableId,
        { disponible: true, personaTitular: null },
        req.tenantId
      );
    } catch (e) {
      console.warn('No se pudo liberar la mesa:', e.message);
    }
  }

  return updated;
}

async function pay(req, res) {
  try {
    const existing = await db.GetOrderById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).send('Pedido no encontrado');
    if (existing.paymentStatus === 'paid') {
      return res.status(400).send('El pedido ya está cobrado');
    }
    const updated = await settlePayment(req, existing, req.body, { requireCash: true });
    return res.status(200).json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).send(err.message);
    console.error(err);
    return res.status(500).send(err.message || 'Error al cobrar pedido');
  }
}

function parseSoldAt(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function sale(req, res) {
  try {
    const body = req.body || {};
    const clientSaleId = String(body.clientSaleId || '').trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientSaleId)) {
      return res.status(400).send('clientSaleId inválido');
    }

    let existing = await db.GetOrderByClientSaleId(clientSaleId, req.tenantId);
    if (existing?.paymentStatus === 'paid') {
      return res.status(200).json(existing);
    }

    if (!existing) {
      if (typeof body.modality === 'number') {
        body.modality = body.modality === 2 ? 'takeaway' : 'dine-in';
      }
      if ((!body.items || !body.items.length) && Array.isArray(body.foods)) {
        body.items = body.foods.map((f) => ({
          foodId: f.food || f.foodId || f.id,
          name: f.name || 'Producto',
          price: Number(f.price || 0),
          quantity: Number(f.quantity || 1),
        }));
      }
      const payload = normalizeOrder(body);
      payload.tenantId = req.tenantId;
      payload.invoiceToken = newToken();
      payload.clientSaleId = clientSaleId;
      payload.source = body.offline ? 'offline' : 'pos';
      const soldAt = parseSoldAt(body.soldAt);
      if (soldAt) payload.createdAt = soldAt;
      if (!payload.items.length) {
        return res.status(400).send('El pedido necesita al menos un producto');
      }
      try {
        existing = await db.CreateOrder(payload);
      } catch (err) {
        if (err.code === 11000) {
          existing = await db.GetOrderByClientSaleId(clientSaleId, req.tenantId);
        } else {
          throw err;
        }
      }
    }

    if (!existing) {
      return res.status(500).send('No se pudo registrar la venta');
    }

    const paidAt = parseSoldAt(body.soldAt) || existing.paidAt || new Date();
    const updated = await settlePayment(req, existing, body, {
      requireCash: false,
      paidAt,
    });
    return res.status(200).json(updated);
  } catch (err) {
    if (err.status) return res.status(err.status).send(err.message);
    console.error(err);
    return res.status(500).send(err.message || 'Error al registrar la venta');
  }
}

async function markInvoiceIssued(req, res) {
  try {
    const order = await db.GetOrderById(req.params.id, req.tenantId);
    if (!order) return res.status(404).send('Pedido no encontrado');
    if (!order.invoice || order.invoice.status !== 'requested') {
      return res.status(400).send('Este ticket no tiene una solicitud de factura pendiente');
    }
    const updated = await db.UpdateOrder(
      order.id,
      {
        invoice: {
          ...order.invoice,
          status: 'issued',
          issuedAt: new Date(),
        },
        updatedAt: new Date(),
      },
      req.tenantId
    );
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al marcar la factura');
  }
}

async function voidSale(req, res) {
  try {
    const existing = await db.GetOrderById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).send('Pedido no encontrado');
    if (existing.status === 'cancelled' || existing.paymentStatus === 'refunded') {
      return res.status(400).send('Esta venta ya está cancelada');
    }

    if (existing.paymentStatus !== 'paid') {
      const updated = await db.UpdateOrder(
        existing.id,
        { status: 'cancelled', updatedAt: new Date() },
        req.tenantId
      );
      return res.status(200).json(updated);
    }

    const session = await db.GetOpenCashSession(req.tenantId);
    if (!session) {
      return res.status(400).send('Abre la caja para devolver el dinero.');
    }

    if (existing.inventoryApplied) {
      for (const item of existing.items || []) {
        const foodId = item.foodId || item.food;
        if (!foodId) continue;
        try {
          await db.RestoreSaleStock(foodId, item.quantity, item.lotAllocations || [], req.tenantId);
        } catch (e) {
          console.warn('No se pudo regresar stock:', foodId, e.message);
        }
      }
    }

    const sameSession = String(existing.cashSessionId || '') === String(session.id);
    const method = existing.paymentMethod || 'cash';
    if (!sameSession && method === 'cash') {
      const next = Number(session.cashRefunds || 0) + Number(existing.total || 0);
      await db.UpdateCashSession(
        session.id,
        { cashRefunds: Number(next.toFixed(2)), updatedAt: new Date() },
        req.tenantId
      );
    }

    const updated = await db.UpdateOrder(
      existing.id,
      {
        status: 'cancelled',
        paymentStatus: 'refunded',
        refundedAt: new Date(),
        inventoryApplied: false,
        updatedAt: new Date(),
      },
      req.tenantId
    );
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al cancelar la venta');
  }
}

module.exports = { list, getById, create, updateStatus, pay, sale, markInvoiceIssued, voidSale, report, reportSummary };

async function report(req, res) {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).send('Parámetros from y to son requeridos');
    const orders = await db.GetOrdersByDateRange(req.tenantId, from, to);
    return res.status(200).json(orders);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener reporte');
  }
}

async function reportSummary(req, res) {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).send('Parámetros from y to son requeridos');
    const summary = await db.GetSalesReport(req.tenantId, from, to);
    return res.status(200).json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener resumen de ventas');
  }
}
