const db = require('../database/mongodb');
const { normalizeCashSession } = require('../models/cashSession.model');
const creditDb = require('../database/credit.db');
const saleAudit = require('../services/sale-audit.service');
const { paymentTotals } = require('../services/credit.service');

function summarizeOrders(orders) {
  const totals = { cash: 0, card: 0, transfer: 0, other: 0, credit: 0, total: 0, count: orders.length };
  for (const o of orders) {
    if (o.paymentStatus !== 'paid') continue;
    const method = o.paymentMethod || 'other';
    const amount = Number(o.total || 0);

    if (method === 'split') {
      // Mixto: la parte de tarjeta va a card, el resto se queda en efectivo
      const cardPart = Math.min(amount, Math.max(0, Number(o.cardAmount || 0)));
      totals.card += cardPart;
      totals.cash += Number((amount - cardPart).toFixed(2));
    } else if (method === 'credit') {
      // Fiado: lo que quedó a deber no es dinero en caja; el anticipo sí es efectivo
      const down = Math.min(amount, Math.max(0, Number(o.downPayment || 0)));
      totals.cash += down;
      totals.credit += Number((amount - down).toFixed(2));
    } else if (totals[method] != null) {
      totals[method] += amount;
    } else {
      totals.other += amount;
    }
    totals.total += amount;
  }
  totals.cash = Number(totals.cash.toFixed(2));
  totals.card = Number(totals.card.toFixed(2));
  totals.credit = Number(totals.credit.toFixed(2));
  totals.total = Number(totals.total.toFixed(2));
  return totals;
}

/** Abonos de clientes recibidos en esta caja (entran al corte como dinero cobrado). */
async function abonosOf(tenantId, sessionId) {
  return paymentTotals(await creditDb.paymentsBySession(tenantId, sessionId));
}

async function current(req, res) {
  try {
    const session = await db.GetOpenCashSession(req.tenantId);
    if (!session) return res.status(200).json({ open: false, session: null });
    const orders = await db.GetOrdersByCashSession(session.id, req.tenantId);
    return res.status(200).json({
      open: true,
      session,
      totals: { ...summarizeOrders(orders), abonos: await abonosOf(req.tenantId, session.id) },
      orders,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener sesión de caja');
  }
}

/** Bitácora: nunca debe tumbar la apertura ni el corte. */
async function logCash(entry) {
  try { await db.CreateActivityLog(entry); } catch (e) { console.error('[bitácora]', e.message); }
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
    await logCash(saleAudit.cashOpenEntry({ tenantId: req.tenantId, user: req.user.username, session }));
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
    const abonos = await abonosOf(req.tenantId, session.id);
    const totals = { ...summarizeOrders(orders), abonos };
    const countedCash = Number(req.body?.countedCash ?? 0);
    // El efectivo esperado incluye los abonos de clientes recibidos en efectivo
    const expectedCash = Number((Number(session.openingFloat || 0) + totals.cash + abonos.cash - Number(session.cashRefunds || 0)).toFixed(2));
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
        expectedCredit: totals.credit,
        abonos,
        expectedOther: totals.other,
        expectedTotal: totals.total,
        difference,
        notes: String(req.body?.notes || ''),
        updatedAt: new Date(),
      },
      req.tenantId
    );

    await logCash(saleAudit.cashCloseEntry({ tenantId: req.tenantId, user: req.user.username, session: closed }));
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
    return res.status(200).json({
      session,
      totals: { ...summarizeOrders(orders), abonos: await abonosOf(req.tenantId, session.id) },
      orders,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener sesión');
  }
}

module.exports = { current, open, close, getById };
