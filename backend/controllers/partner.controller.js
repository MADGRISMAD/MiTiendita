const partners = require('../services/partner.service');
const db = require('../database/db');

function fail(res, err) {
  if (err instanceof partners.PartnerError) return res.status(err.status).send(err.message);
  console.error('[socios]', err);
  return res.status(500).send('No pude completar la acción. Intenta de nuevo.');
}

const handle = (fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    return fail(res, err);
  }
};

const home = handle(async (req, res) => res.status(200).json(await partners.home(req.user)));
const clients = handle(async (req, res) => res.status(200).json(await partners.listClients(req.user)));
const client = handle(async (req, res) => res.status(200).json(await partners.clientDetail(req.user, req.params.id)));
const commissions = handle(async (req, res) => res.status(200).json(await partners.commissions(req.user)));

const addNote = handle(async (req, res) => {
  const me = await db.FindUserByUsername(req.user.username);
  const author = { ...req.user, displayName: `${me?.name || ''} ${me?.lastName || ''}`.trim() || req.user.username };
  return res.status(201).json(await partners.addNote(author, req.params.id, req.body?.text));
});

const assign = handle(async (req, res) =>
  res.status(200).json(await partners.assign(req.user, req.params.id, req.body?.username || null))
);

const team = handle(async (req, res) => res.status(200).json(await partners.listTeam(req.partnerId)));
const createMember = handle(async (req, res) => res.status(201).json(await partners.createMember(req.partnerId, req.body || {})));
const deactivate = handle(async (req, res) => res.status(200).json(await partners.setActive(req.partnerId, req.params.id, false, req.user)));
const reactivate = handle(async (req, res) => res.status(200).json(await partners.setActive(req.partnerId, req.params.id, true, req.user)));
const changeRole = handle(async (req, res) =>
  res.status(200).json(await partners.changeRole(req.partnerId, req.params.id, req.body?.role, req.user))
);

module.exports = { home, clients, client, commissions, addNote, assign, team, createMember, deactivate, reactivate, changeRole, fail };
