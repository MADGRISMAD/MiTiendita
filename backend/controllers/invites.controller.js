const db = require('../database/mongodb');
const { passwordProblem } = require('../utils/password-policy');
const sessions = require('../services/session.service');
const { newToken } = require('../models/order.model');
const { sendInviteEmail } = require('../utils/mail.utils');
const { resolveAppUrl } = require('../utils/app-url.utils');
const bcrypt = require('../utils/bcrypt.utils');
const { TENANT_ROLES, normalizeRole } = require('../models/tenant.model');
const limits = require('../services/plan-limits.service');
const team = require('../services/team.service');

async function list(req, res) {
  try {
    return res.status(200).json(await db.GetInvites(req.tenantId));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar invitaciones');
  }
}

// Quiénes entran a la app y cuántos lugares quedan en el plan
async function listTeam(req, res) {
  try {
    const tenant = await db.GetTenantById(req.tenantId);
    const plan = tenant?.plan || 'basic';
    const [users, usage] = await Promise.all([
      db.ListUsersByTenant(req.tenantId),
      limits.usageFor(req.tenantId, plan),
    ]);
    return res.status(200).json({
      users,
      me: req.user?.username || '',
      plan,
      planName: limits.planName(plan),
      seats: usage.users,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar el equipo');
  }
}

/** Responde un error del servicio de equipo (o uno inesperado). */
function teamFail(res, err, fallback) {
  if (err instanceof team.TeamError) return res.status(err.status).send(err.message);
  if (limits.sendLimit(res, err)) return res;
  console.error(err);
  return res.status(500).send(fallback);
}

async function deactivateUser(req, res) {
  try {
    const out = await team.deactivate({ tenantId: req.tenantId, actor: req.user, targetId: req.params.id });
    return res.status(200).json(out);
  } catch (err) {
    return teamFail(res, err, 'No se pudo desactivar la cuenta');
  }
}

async function reactivateUser(req, res) {
  try {
    const out = await team.reactivate({ tenantId: req.tenantId, actor: req.user, targetId: req.params.id });
    return res.status(200).json(out);
  } catch (err) {
    return teamFail(res, err, 'No se pudo reactivar la cuenta');
  }
}

async function changeUserRole(req, res) {
  try {
    const out = await team.changeRole({
      tenantId: req.tenantId,
      actor: req.user,
      targetId: req.params.id,
      role: req.body?.role,
    });
    return res.status(200).json(out);
  } catch (err) {
    return teamFail(res, err, 'No se pudo cambiar el rol');
  }
}

async function create(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = req.body?.role || 'cashier';
    if (!email || !email.includes('@')) {
      return res.status(400).send('Email inválido');
    }
    if (!TENANT_ROLES.includes(role)) {
      return res.status(400).send('Rol inválido');
    }

    const tenant = await db.GetTenantById(req.tenantId);
    try {
      await limits.assertUserRoom(req.tenantId, tenant?.plan || 'basic', 1, { includePending: true });
    } catch (limitErr) {
      if (limits.sendLimit(res, limitErr)) return;
      throw limitErr;
    }

    const existingUser = await db.FindUserByEmail(email);
    if (existingUser && existingUser.tenantId === req.tenantId) {
      return res.status(400).send('Ya existe un usuario con ese correo en este negocio');
    }

    const settings = await db.GetSettings(req.tenantId);
    const token = newToken();
    const invite = await db.CreateInvite({
      email,
      role,
      token,
      status: 'pending',
      tenantId: req.tenantId,
      invitedBy: req.user?.username || 'admin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const appUrl = resolveAppUrl(req);
    const inviteUrl = `${appUrl}/invite/${token}`;
    let mail;
    try {
      mail = await sendInviteEmail({
        to: email,
        inviteUrl,
        role,
        businessName: settings?.businessName || settings?.venueName || settings?.name,
      });
    } catch (mailErr) {
      await db.DeleteInvite(String(invite.id), req.tenantId).catch(() => {});
      const status = mailErr.code === 'MAIL_NOT_CONFIGURED' ? 503 : 502;
      return res.status(status).send(mailErr.message || 'No se pudo enviar el correo de invitación');
    }

    return res.status(201).json({ ...invite, mail });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al crear invitación');
  }
}

async function revoke(req, res) {
  try {
    const updated = await db.UpdateInvite(
      req.params.id,
      { status: 'revoked', updatedAt: new Date() },
      req.tenantId
    );
    if (!updated) return res.status(404).send('Invitación no encontrada');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al revocar invitación');
  }
}

async function remove(req, res) {
  try {
    const result = await db.DeleteInvite(req.params.id, req.tenantId);
    if (!result.deletedCount) return res.status(404).send('Invitación no encontrada');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al eliminar invitación');
  }
}

async function getByToken(req, res) {
  try {
    const invite = await db.GetInviteByToken(req.params.token);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).send('Invitación no válida');
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.status(410).send('Invitación expirada');
    }
    return res.status(200).json({
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener invitación');
  }
}

async function accept(req, res) {
  try {
    const { token, name, lastName, username, password, cellphone } = req.body || {};
    if (!token || !name || !lastName || !username || !password) {
      return res.status(400).send('Faltan campos requeridos');
    }

    const invite = await db.GetInviteByToken(token);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).send('Invitación no válida');
    }
    const weak = passwordProblem(password, { email: invite.email, username, name });
    if (weak) return res.status(400).send(weak);
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.status(410).send('Invitación expirada');
    }
    if (!invite.tenantId) {
      return res.status(400).send('Invitación sin tenant');
    }

    const existingEmail = await db.FindUserByEmail(invite.email);
    if (existingEmail) {
      return res.status(400).send('El correo ya está registrado');
    }
    const existingUser = await db.FindUserByUsername(username);
    if (existingUser) {
      return res.status(400).send('El usuario ya existe');
    }

    const tenant = await db.GetTenantById(invite.tenantId);
    try {
      await limits.assertUserRoom(invite.tenantId, tenant?.plan || 'basic', 1);
    } catch (limitErr) {
      if (limits.sendLimit(res, limitErr)) return;
      throw limitErr;
    }

    const role = TENANT_ROLES.includes(normalizeRole(invite.role)) ? normalizeRole(invite.role) : 'cashier';
    const hashed = await bcrypt.hashPassword(password);
    await db.CreateUser({
      name,
      lastName,
      email: invite.email,
      username,
      password: hashed,
      cellphone:
        String(cellphone || '0000000000').replace(/\D/g, '').slice(0, 10) || '0000000000',
      role,
      tenantId: invite.tenantId,
    });

    await db.UpdateInvite(
      String(invite.id || invite._id),
      { status: 'accepted', acceptedAt: new Date() },
      invite.tenantId
    );

    const created = await db.FindUserByUsername(username);
    const session = await sessions.startSession(req, res, created);

    return res.status(201).json({
      ok: true,
      email: invite.email,
      ...session,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al aceptar invitación');
  }
}

module.exports = { list, team: listTeam, create, revoke, remove, getByToken, accept, deactivateUser, reactivateUser, changeUserRole };
