const db = require('../database/mongodb');
const { normalizeCashSession } = require('../models/cashSession.model');
const creditDb = require('../database/credit.db');
const saleAudit = require('../services/sale-audit.service');
const { paymentTotals } = require('../services/credit.service');
const { summarizeOrders } = require('../services/cash-summary');
const cutsDb = require('../database/cash-cuts.db');
const { segmentsOf, expectedSince } = require('../services/cash-cuts.service');

/** Abonos de clientes recibidos en esta caja (entran al corte como dinero cobrado). */
async function abonosOf(tenantId, sessionId) {
  return paymentTotals(await creditDb.paymentsBySession(tenantId, sessionId));
}

async function current(req, res) {
  try {
    const session = await db.GetOpenCashSession(req.tenantId, req.registerId);
    if (!session) return res.status(200).json({ open: false, session: null });
    const orders = await db.GetOrdersByCashSession(session.id, req.tenantId);
    return res.status(200).json({
      ...(await currentSegment(req.tenantId, session)),
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

/** Con Cortes X, el último cajero responde solo por su tramo: esperado desde el último corte y diferencia contra eso. */
async function segmentInfo(tenantId, session, cuts, countedCash) {
  if (!cuts.length) return {};
  const lastSegment = await expectedSince(cutsDb, { tenantId, session });
  const out = { lastSegment };
  if (countedCash != null) out.segmentDifference = Number((countedCash - lastSegment.expected).toFixed(2));
  return out;
}

/** Para la pantalla de caja: el tramo del cajero si hay cortes; si algo falla aquí, la caja sigue funcionando sin él. */
async function currentSegment(tenantId, session) {
  try { return await segmentInfo(tenantId, session, await cutsDb.cutsBySession(tenantId, session.id), null); } catch (e) { console.error('[tramo]', e.message); return {}; }
}

/** Bitácora: nunca debe tumbar la apertura ni el corte. */
async function logCash(entry) {
  try { await db.CreateActivityLog(entry); } catch (e) { console.error('[bitácora]', e.message); }
}

/** La caja ya tiene una sesión abierta: 409 con quién la tiene. */
function alreadyOpen(res, existing) {
  const openedBy = existing?.openedBy || null;
  return res.status(409).json({ code: 'register_open', openedBy, message: `Esta caja ya está abierta por ${openedBy || 'otro usuario'}.` });
}

async function open(req, res) {
  try {
    const existing = await db.GetOpenCashSession(req.tenantId, req.registerId);
    if (existing) return alreadyOpen(res, existing);
    let session;
    try {
      session = await db.CreateCashSession({
        ...normalizeCashSession(req.body || {}, req.tenantId, req.user.username, req.registerId),
        // Candado por navegador: solo este navegador puede vender y cerrar la caja (ver register.middleware.js)
        deviceId: req.deviceId || null,
      });
    } catch (err) {
      // Otra apertura de la misma caja ganó al mismo tiempo (índice único de una sesión abierta por caja)
      if (err.code === 11000) return alreadyOpen(res, await db.GetOpenCashSession(req.tenantId, req.registerId));
      throw err;
    }
    await logCash(saleAudit.cashOpenEntry({ tenantId: req.tenantId, user: req.user.username, session }));
    return res.status(201).json(session);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al abrir caja');
  }
}

async function close(req, res) {
  try {
    const session = await db.GetOpenCashSession(req.tenantId, req.registerId);
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
        expectedUsd: totals.usd,
        usdPesos: totals.usdPesos,
        difference,
        notes: String(req.body?.notes || ''),
        updatedAt: new Date(),
      },
      req.tenantId
    );

    await logCash(saleAudit.cashCloseEntry({ tenantId: req.tenantId, user: req.user.username, session: closed }));
    const cuts = await cutsDb.cutsBySession(req.tenantId, session.id);
    return res.status(200).json({ session: closed, totals, segments: segmentsOf(orders, cuts), cuts, ...(await segmentInfo(req.tenantId, session, cuts, countedCash)) });
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
    const cuts = await cutsDb.cutsBySession(req.tenantId, session.id);
    return res.status(200).json({
      session,
      totals: { ...summarizeOrders(orders), abonos: await abonosOf(req.tenantId, session.id) },
      orders,
      segments: segmentsOf(orders, cuts),
      cuts,
      ...(await segmentInfo(req.tenantId, session, cuts, Number.isFinite(Number(session.countedCash)) && session.countedCash != null ? Number(session.countedCash) : null)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener sesión');
  }
}

module.exports = { current, open, close, getById };
