const db = require('../database/mongodb');
const { normalizeOrder, orderStatuses, paymentMethods, newToken } = require('../models/order.model');
const { storeDayRange } = require('../utils/store-time');
const pointCharges = require('../services/point.charges.service');

/**
 * Rango de un reporte. Un día «AAAA-MM-DD» se toma en la zona de la tienda
 * (from = 00:00, to = 23:59:59.999); una fecha con hora se usa tal cual.
 */
async function resolveReportRange(tenantId, from, to) {
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (!dayOnly.test(from) && !dayOnly.test(to)) return { from, to };
  const tz = (await db.GetSettings(tenantId))?.timezone;
  return {
    from: dayOnly.test(from) ? storeDayRange(from, tz).from : from,
    to: dayOnly.test(to) ? storeDayRange(to, tz).to : to,
  };
}

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

/**
 * Guarda en cada línea el costo del producto al momento del cobro (0 = costo desconocido),
 * para que cambiar el costo después no altere la utilidad del histórico.
 */
async function withUnitCosts(items, tenantId) {
  return Promise.all(
    items.map(async (item) => {
      if (item.unitCost != null) return item;
      const foodId = item.foodId || item.food;
      const food = foodId ? await db.GetFoodById(foodId, tenantId) : null;
      return { ...item, unitCost: Math.max(0, Number(food?.cost) || 0) };
    })
  );
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

  const { cartTotals, rateOf } = require('../utils/tax');
  const settings = await db.GetSettings(req.tenantId);
  // La comisión por tarjeta solo aplica si la tienda la activó, y con su porcentaje (no el del dispositivo)
  const cardExtraIva = method === 'card' && Boolean(body?.cardExtraIva) && Boolean(settings?.cardFeeEnabled);
  const totals = cartTotals(existing.items || [], {
    discountPercent: existing.discountPercent || 0,
    taxRate: rateOf(existing.taxRate),
    cardExtraIva,
    cardFeeRate: Math.min(30, Math.max(0, Number(settings?.cardFeePercent ?? 4) || 0)) / 100,
  });
  const deliveryFee = Number(existing.deliveryFee || 0);
  const total = Number((totals.total + deliveryFee).toFixed(2));

  // Cobro con terminal Mercado Pago: debe estar aprobado, ser de esta tienda, por este monto y usarse una sola vez
  let pointChargeId = null;
  if (body?.pointChargeId) {
    if (method !== 'card') throw httpError(400, 'El cobro con terminal solo aplica a pagos con tarjeta');
    try {
      const charge = await pointCharges.consumeCharge(req.tenantId, String(body.pointChargeId), {
        clientSaleId: existing.clientSaleId || String(existing.id),
        total,
      });
      pointChargeId = charge.id;
    } catch (err) {
      throw httpError(err.status || 409, err.message);
    }
  }

  let stockShortages = [];
  if (settings?.inventoryEnabled && !existing.inventoryApplied) {
    // Una venta hecha sin internet ya se entregó: se registra aunque falte stock y queda para revisión
    const allowNegative = Boolean(settings.allowNegativeStock) || Boolean(body?.offline);
    const reserved = await db.ReserveSaleStock(existing.items || [], req.tenantId, { allowNegative });
    stockShortages = reserved.shortages;

    const nextItems = [];
    for (const item of existing.items || []) {
      const foodId = item.foodId || item.food;
      const qty = Number(item.quantity) || 0;
      if (!foodId || !qty) {
        nextItems.push(item);
        continue;
      }
      try {
        const allocations = await db.ConsumeSaleLots(foodId, qty, req.tenantId);
        nextItems.push({ ...item, lotAllocations: allocations });
      } catch (e) {
        console.warn('No se pudieron descontar lotes:', foodId, e.message);
        nextItems.push(item);
      }
    }
    existing = { ...existing, items: nextItems };
  }

  const takesCash = method === 'cash' || method === 'split';
  const cashReceived = takesCash ? Number(body?.cashReceived ?? 0) : 0;
  const paymentReference =
    method === 'transfer' || method === 'other' ? String(body?.paymentReference || '').trim().slice(0, 60) : '';
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
      paymentReference: paymentReference || null,
      pointChargeId,
      inventoryApplied: Boolean(settings?.inventoryEnabled),
      stockReview: stockShortages.length > 0,
      stockShortages,
      items: await withUnitCosts(existing.items || [], req.tenantId),
    },
    req.tenantId
  );

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

    let createdHere = false;
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
        createdHere = true;
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
    let updated;
    try {
      updated = await settlePayment(req, existing, body, {
        requireCash: false,
        paidAt,
      });
    } catch (err) {
      // Si el cobro no procede (p. ej. sin existencias), no dejes un pedido huérfano por cobrar
      if (createdHere && err.status) await db.DeleteOrder(existing.id, req.tenantId).catch(() => {});
      throw err;
    }
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
    const r = await resolveReportRange(req.tenantId, String(from), String(to));
    if (Number.isNaN(new Date(r.from).getTime()) || Number.isNaN(new Date(r.to).getTime())) {
      return res.status(400).send('Fechas inválidas');
    }
    const orders = await db.GetOrdersByDateRange(req.tenantId, r.from, r.to);
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
    const r = await resolveReportRange(req.tenantId, String(from), String(to));
    if (Number.isNaN(new Date(r.from).getTime()) || Number.isNaN(new Date(r.to).getTime())) {
      return res.status(400).send('Fechas inválidas');
    }
    const summary = await db.GetSalesReport(req.tenantId, r.from, r.to);
    return res.status(200).json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener resumen de ventas');
  }
}
