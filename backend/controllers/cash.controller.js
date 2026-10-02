const db = require('../database/mongodb');
const { normalizeCashSession } = require('../models/cashSession.model');

function summarizeOrders(orders) {
  const totals = { cash: 0, card: 0, transfer: 0, other: 0, total: 0, count: orders.length };
  for (const o of orders) {
    if (o.paymentStatus !== 'paid') continue;
    const method = o.paymentMethod || 'other';
    const amount = Number(o.total || 0);

    if (method === 'split') {
      // Mixto: la parte de tarjeta va a card, el resto se queda en efectivo
      const cardPart = Math.min(amount, Math.max(0, Number(o.cardAmount || 0)));
      totals.card += cardPart;
      totals.cash += Number((amount - cardPart).toFixed(2));
    } else if (totals[method] != null) {
      totals[method] += amount;
    } else {
      totals.other += amount;
    }
    totals.total += amount;
  }
  totals.cash = Number(totals.cash.toFixed(2));
  totals.card = Number(totals.card.toFixed(2));
  totals.total = Number(totals.total.toFixed(2));
  return totals;
}

async function current(req, res) {
  try {
    const session = await db.GetOpenCashSession(req.tenantId);
    if (!session) return res.status(200).json({ open: false, session: null });
    const orders = await db.GetOrdersByCashSession(session.id, req.tenantId);
    return res.status(200).json({
      open: true,
      session,
      totals: summarizeOrders(orders),
      orders,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener sesión de caja');
  }
}

async function open(req, res) {
  try {
    const existing = await db.GetOpenCashSession(req.tenantId);
    if (existing) {
      return res.status(400).send('Ya hay una caja abierta');
    }
    const session = await db.CreateCashSession(
      normalizeCashSession(req.body || {}, req.tenantId, req.user.username)
    );
    return res.status(201).json(session);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al abrir caja');
  }
}

async function close(req, res) {
  try {
    const session = await db.GetOpenCashSession(req.tenantId);
    if (!session) return res.status(400).send('No hay caja abierta');

    const orders = await db.GetOrdersByCashSession(session.id, req.tenantId);
    const totals = summarizeOrders(orders);
    const countedCash = Number(req.body?.countedCash ?? 0);
    const expectedCash = Number(session.openingFloat || 0) + totals.cash - Number(session.cashRefunds || 0);
    const difference = Number((countedCash - expectedCash).toFixed(2));

    const closed = await db.UpdateCashSession(
      session.id,
      {
        status: 'closed',
        closedAt: new Date(),
        closedBy: req.user.username,
        countedCash,
        expectedCash,
        expectedCard: totals.card,
        expectedTransfer: totals.transfer,
        expectedOther: totals.other,
        expectedTotal: totals.total,
        difference,
        notes: String(req.body?.notes || ''),
        updatedAt: new Date(),
      },
      req.tenantId
    );

    return res.status(200).json({ session: closed, totals });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al cerrar caja');
  }
}

async function getById(req, res) {
  try {
    const session = await db.GetCashSessionById(req.params.id, req.tenantId);
    if (!session) return res.status(404).send('Sesión no encontrada');
    const orders = await db.GetOrdersByCashSession(session.id, req.tenantId);
    return res.status(200).json({ session, totals: summarizeOrders(orders), orders });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener sesión');
  }
}

module.exports = { current, open, close, getById };
