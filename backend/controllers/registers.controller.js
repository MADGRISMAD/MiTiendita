const db = require('../database/mongodb');
const registersDb = require('../database/registers.db');
const { listRegisters, saveRegisters } = require('../services/registers.service');
const { registerLimitOf } = require('../services/plans.catalog');
const limits = require('../services/plan-limits.service');

/** Cajas del plan con quién las tiene abiertas (`openBy`, `sessionId`). */
async function view(req) {
  const plan = req.tenant?.plan;
  const [registers, open] = await Promise.all([listRegisters(registersDb, req.tenantId, plan), db.ListOpenCashSessions(req.tenantId)]);
  const byNumber = new Map(open.map((s) => [s.registerId ?? 1, s]));
  return {
    plan,
    limit: registerLimitOf(plan),
    registers: registers.map((r) => ({ ...r, openBy: byNumber.get(r.number)?.openedBy || null, sessionId: byNumber.get(r.number)?.id || null })),
  };
}

async function list(req, res) {
  try {
    return res.status(200).json(await view(req));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener las cajas');
  }
}

async function save(req, res) {
  try {
    try {
      await saveRegisters(registersDb, req.tenantId, req.tenant?.plan, req.body || {});
    } catch (err) {
      if (limits.sendLimit(res, err)) return;
      if (err.status) return res.status(err.status).send(err.message);
      throw err;
    }
    return res.status(200).json(await view(req));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al guardar las cajas');
  }
}

/** El dueño libera una caja que se quedó abierta en otro equipo: se cierra sin corte de efectivo. */
async function release(req, res) {
  try {
    const number = Number(req.params.number);
    const session = (await db.ListOpenCashSessions(req.tenantId)).find((s) => (s.registerId ?? 1) === number);
    if (!session) return res.status(404).send('Esa caja no está abierta');
    const closed = await db.UpdateCashSession(
      session.id,
      { status: 'closed', closedAt: new Date(), closedBy: req.user.username, notes: 'Liberada por el dueño', updatedAt: new Date() },
      req.tenantId
    );
    try {
      await db.CreateActivityLog({
        tenantId: String(req.tenantId),
        type: 'register_released',
        message: `Caja ${number} liberada por el dueño (estaba abierta por ${session.openedBy || 'otro usuario'})`,
        meta: { sessionId: String(session.id), registerId: number, openedBy: session.openedBy || null },
        user: req.user.username,
        createdAt: new Date(),
      });
    } catch (e) { console.error('[bitácora]', e.message); }
    return res.status(200).json({ session: closed });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al liberar la caja');
  }
}

module.exports = { list, save, release };
