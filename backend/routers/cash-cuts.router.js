const router = require('express').Router();
const db = require('../database/mongodb');
const cutsDb = require('../database/cash-cuts.db');
const svc = require('../services/cash-cuts.service');
const saleAudit = require('../services/sale-audit.service');
const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
const { attachRegister } = require('../middleware/register.middleware');

const cashRoles = requireRoles('admin', 'cashier');
const base = [requireAuth, requireActiveSubscription];

/** Bitácora: nunca debe tumbar el corte. */
async function logCut(entry) {
  try { await db.CreateActivityLog(entry); } catch (e) { console.error('[bitácora]', e.message); }
}

/** Responde con el código del error del servicio (httpError) o 500. */
function fail(res, err) {
  if (err.status) return res.status(err.status).json({ code: err.code || null, message: err.message });
  console.error(err);
  return res.status(500).send(err.message || 'Error en el Corte X');
}

const openSession = (req) => db.GetOpenCashSession(req.tenantId, req.registerId);

// Lo esperado en el cajón desde el último punto de partida (lectura: sin candado de navegador)
router.get('/expected', ...base, cashRoles, attachRegister({ allowOverPlan: true }), async (req, res) => {
  try {
    const session = await openSession(req);
    if (!session) return res.status(400).json({ code: 'cash_closed', message: 'Abre la caja antes de hacer un Corte X.' });
    return res.json(await svc.expectedSince(cutsDb, { tenantId: req.tenantId, session }));
  } catch (err) { return fail(res, err); }
});

// Compañeros de la tienda a quienes entregar la caja (sin quien consulta)
router.get('/team', ...base, cashRoles, async (req, res) => {
  try {
    const users = await db.ListUsersByTenant(req.tenantId);
    return res.json(users
      .filter((u) => u.username && u.username !== req.user.username && !u.disabled)
      .map((u) => ({ username: u.username, name: [u.name, u.lastName].filter(Boolean).join(' ') || u.username })));
  } catch (err) { return fail(res, err); }
});

router.get('/pending', ...base, cashRoles, async (req, res) => {
  try { return res.json(await svc.pendingFor(cutsDb, req.tenantId, req.user.username)); } catch (err) { return fail(res, err); }
});

router.post('/', ...base, cashRoles, attachRegister({ allowOverPlan: true }), async (req, res) => {
  try {
    const session = await openSession(req);
    const cut = await svc.createCut(cutsDb, {
      tenantId: req.tenantId, session, fromUser: req.user.username, toUser: req.body?.toUser, countedCash: req.body?.countedCash,
    });
    await logCut(saleAudit.cashCutEntry({ tenantId: req.tenantId, user: req.user.username, cut }));
    return res.status(201).json(cut);
  } catch (err) { return fail(res, err); }
});

// Sin attachRegister a propósito: quien recibe puede estar en otro navegador y no debe toparse con el candado
router.post('/:id/confirm', ...base, cashRoles, async (req, res) => {
  try {
    const cut = await svc.confirmCut(cutsDb, { tenantId: req.tenantId, cutId: req.params.id, user: req.user.username, confirmedCash: req.body?.confirmedCash });
    await logCut(saleAudit.cashCutConfirmEntry({ tenantId: req.tenantId, user: req.user.username, cut }));
    return res.json(cut);
  } catch (err) { return fail(res, err); }
});

// Historial de cortes (solo el dueño)
router.get('/', ...base, requireRoles('admin'), async (req, res) => {
  try {
    const date = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
    const { registerId, user, status } = req.query;
    return res.json(await svc.listCuts(cutsDb, req.tenantId, {
      from: date(req.query.from), to: date(req.query.to),
      registerId: registerId ? Number(registerId) : null, user: user || null, status: status || null,
    }));
  } catch (err) { return fail(res, err); }
});

module.exports = router;
