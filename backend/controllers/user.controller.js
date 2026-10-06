const schema = require('../models/usuario.model');
const service = require('../services/usuario.service');
const hasher = require('../utils/bcrypt.utils');
const jwtCreator = require('../utils/jwt.utils');
const db = require('../database/db');
const { createTenantDoc, newResetToken, ROLES, TRIAL_DAYS, isPartnerRole, isOutsideTenant } = require('../models/tenant.model');
const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  hasSmtpConfig,
  safeSend,
} = require('../utils/mail.utils');
const { resolveAppUrl } = require('../utils/app-url.utils');
const { passwordProblem } = require('../utils/password-policy');
const sessions = require('../services/session.service');
const totp = require('../utils/totp');
const secretBox = require('../utils/secret-box');
const referrals = require('../services/referral.service');

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

function minutesLeft(date) {
  return Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 60000));
}

function lockedMessage(user) {
  return `Cuenta bloqueada por varios intentos fallidos. Intenta de nuevo en ${minutesLeft(user.lockedUntil)} min o restablece tu contraseña.`;
}

function isLocked(user) {
  return Boolean(user?.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());
}

/** Intento fallido (contraseña o código): suma y avisa si ya quedó bloqueada. */
async function failAttempt(res, user, message) {
  const after = await db.RecordLoginFailure(String(user._id), { max: MAX_FAILED_LOGINS, lockMs: LOCK_MS });
  if (isLocked(after)) return res.status(423).send(lockedMessage(after));
  return res.status(401).send(message);
}

/** Revisa un código de la app o uno de respaldo. Devuelve los cambios a guardar o null. */
function checkSecondFactor(user, code) {
  const secret = secretBox.open(user.mfaSecretEnc);
  const step = totp.verifyTotp(secret, code, { lastStep: Number(user.mfaLastStep) || -1 });
  if (step != null) return { mfaLastStep: step };
  const hash = totp.hashRecoveryCode(code);
  const list = Array.isArray(user.mfaRecovery) ? user.mfaRecovery : [];
  if (String(code || '').replace(/[^a-z0-9]/gi, '').length === 8 && list.includes(hash)) {
    return { mfaRecovery: list.filter((h) => h !== hash) };
  }
  return null;
}

/** Para el formulario de registro: ¿ese código es de un vendedor activo? Solo da el nombre de pila. */
const CheckReferralCode = async (req, res) => {
  try {
    const ref = await referrals.findActiveByCode(req.params.code);
    if (!ref) return res.status(200).json({ valid: false });
    return res.status(200).json({ valid: true, seller: ref.name.split(' ')[0] });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ valid: false });
  }
};

/** Solicitud pública para ser proveedor oficial (socio). Queda en revisión. */
const ApplyPartner = async (req, res) => {
  const partners = require('../services/partner.service');
  try {
    const body = req.body || {};
    const { partner, user } = await partners.apply({
      name: body.name,
      lastName: body.lastName,
      email: body.email,
      username: body.username,
      password: body.password,
      cellphone: body.cellphone,
      state: body.state,
      city: body.city,
      notes: body.notes,
    });
    await db
      .CreatePlatformAudit({
        tenantId: null,
        type: 'partner_applied',
        message: `Nueva solicitud de proveedor: ${partner.name} (${partner.state || 'sin estado'})`,
        meta: { referrerId: partner.id },
        actor: user.username,
        actorRole: 'partner_admin',
        createdAt: new Date(),
      })
      .catch(() => {});
    const inbox = String(process.env.SUPPORT_EMAIL || process.env.SMTP_USER || '').trim();
    if (inbox.includes('@')) {
      const { sendMail } = require('../utils/mail.utils');
      const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      safeSend(() =>
        sendMail({
          to: inbox,
          subject: `Nueva solicitud de proveedor: ${partner.name}`,
          html: `<p><strong>${esc(partner.name)}</strong> quiere ser proveedor oficial.</p><p>${esc(partner.email)} · ${esc(partner.phone || 'sin teléfono')} · ${esc([partner.city, partner.state].filter(Boolean).join(', '))}</p><p>Revísalo en Admin → Vendedores para aprobarlo.</p>`,
        })
      );
    }
    return res.status(201).json({ ok: true, status: 'pending', username: user.username });
  } catch (err) {
    if (err.status) return res.status(err.status).send(err.message);
    console.error(err);
    return res.status(500).send('No pudimos registrar tu solicitud. Intenta de nuevo.');
  }
};

const CreateUser = async (req, res) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).send(error.message);
    }
    const weak = passwordProblem(value.password, { email: value.email, username: value.username, name: value.name });
    if (weak) return res.status(400).send(weak);
    if (await service.FindUserByUsername(value.username)) {
      return res.status(400).send('Usuario con el nombre de usuario ya registrado');
    }
    if (await service.FindUserByEmail(value.email)) {
      return res.status(400).send('Usuario con el correo ya registrado');
    }

    // Código de un vendedor (opcional): se valida antes de crear nada para no dejar una tienda a medias
    let referrer = null;
    try {
      referrer = await referrals.resolveForSignup(value.referralCode, { email: value.email });
    } catch (err) {
      if (err instanceof referrals.ReferralError) return res.status(err.status).send(err.message);
      throw err;
    }
    delete value.referralCode;

    const tenant = await db.CreateTenant({
      ...createTenantDoc(value.businessName || `${value.name} ${value.lastName}`),
      ...(referrer ? referrals.referralFields(referrer) : {}),
    });
    const tenantId = tenant.id;

    value.password = await hasher.hashPassword(value.password);
    value.role = 'admin';
    value.tenantId = tenantId;
    delete value.businessName;

    await service.CreateUser(value);

    if (referrer) {
      await db.CreateBillingEvent({
        tenantId,
        type: 'referred',
        note: `Llegó con el código ${referrer.code} (${referrer.name})`,
      }).catch(() => {});
    }
    await db.CreateBillingEvent({
      tenantId,
      type: 'trial_started',
      plan: 'basic',
      interval: 'month',
      note: `Prueba de ${TRIAL_DAYS} días`,
    }).catch(() => {});

    await db.CreateSettings({
      tenantId,
      businessName: tenant.name,
      businessType: 'abarrotes',
      address: '',
      phone: value.cellphone || '',
      logoUrl: '/logo.svg',
      timezone: 'America/Mexico_City',
      initialTables: 8,
      setupCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const created = await service.FindUserByUsername(value.username);
    const session = await sessions.startSession(req, res, created);

    const appUrl = resolveAppUrl(req);
    safeSend(() =>
      sendWelcomeEmail({
        to: value.email,
        name: value.name,
        businessName: tenant.name,
        appUrl,
        trialDays: TRIAL_DAYS,
      })
    ).catch(() => {});

    return res.status(201).json({
      message: 'Usuario creado con exito',
      ...session,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};

const BAD_LOGIN = 'Correo o contraseña incorrecta';

/**
 * Paso 1: usuario y contraseña. Si la cuenta tiene 2FA responde { mfaRequired, mfaToken };
 * si es del equipo de la plataforma y aún no lo tiene, { mfaSetupRequired, mfaToken }.
 */
const LoginUsuario = async (req, res) => {
  try {
    const user = await service.LoginUsuario(String(req.body?.data || '').trim());
    // Misma respuesta si el usuario no existe, para no revelar qué correos hay
    if (!user) return res.status(401).send(BAD_LOGIN);
    if (isLocked(user)) return res.status(423).send(lockedMessage(user));
    if (user.disabled) return res.status(403).send('Esta cuenta está desactivada. Pide acceso al dueño de la tienda.');

    const ok = await hasher.checkPassword(req.body?.password || '', user.password);
    if (!ok) return failAttempt(res, user, BAD_LOGIN);

    const outside = isOutsideTenant(user.role);
    if (isPartnerRole(user.role) && !user.partnerId) {
      return res.status(403).send('Esta cuenta no está ligada a ningún socio.');
    }
    if (!outside && !user.tenantId) {
      return res.status(403).send('Usuario sin tenant asignado');
    }

    if (user.mfaEnabled) {
      return res.status(200).json({
        mfaRequired: true,
        mfaToken: jwtCreator.signPurposeToken('mfa', { uid: String(user._id) }, '5m'),
      });
    }
    if (outside) {
      return res.status(200).json({
        mfaSetupRequired: true,
        mfaToken: jwtCreator.signPurposeToken('mfa-setup', { uid: String(user._id) }, '15m'),
      });
    }

    await db.ClearLoginFailures(String(user._id));
    return res.status(200).json(await sessions.startSession(req, res, user));
  } catch (error) {
    console.error(error.message);
    return res.status(500).send('No se pudo iniciar sesión');
  }
};

/** Paso 2: código de la app de autenticación (o uno de respaldo). */
const LoginMfa = async (req, res) => {
  try {
    const claim = jwtCreator.verifyPurposeToken(req.body?.mfaToken, 'mfa');
    if (!claim) return res.status(401).send('El tiempo para escribir el código terminó. Vuelve a entrar.');
    const user = await db.FindUserById(claim.uid);
    if (!user || !user.mfaEnabled) return res.status(401).send('Vuelve a entrar.');
    if (isLocked(user)) return res.status(423).send(lockedMessage(user));

    const changes = checkSecondFactor(user, req.body?.code);
    if (!changes) return failAttempt(res, user, 'Código incorrecto o vencido.');

    await db.UpdateUserById(String(user._id), changes);
    await db.ClearLoginFailures(String(user._id));
    return res.status(200).json(await sessions.startSession(req, res, user));
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('No se pudo verificar el código');
  }
};

const RefreshSession = async (req, res) => {
  try {
    return res.status(200).json(await sessions.refreshSession(req, res));
  } catch (err) {
    if (err.status) return res.status(err.status).send(err.message);
    console.error(err.message);
    return res.status(500).send('No se pudo renovar la sesión');
  }
};

const Logout = async (req, res) => {
  try {
    await sessions.endSession(req, res);
  } catch (err) {
    console.error(err.message);
  }
  return res.status(200).json({ ok: true });
};

/** Usuario que está activando 2FA: con sesión, o con el token del login (equipo de plataforma). */
async function mfaSubject(req) {
  const claim = req.body?.mfaToken ? jwtCreator.verifyPurposeToken(req.body.mfaToken, 'mfa-setup') : null;
  if (claim) return { user: await db.FindUserById(claim.uid), viaLogin: true };
  const payload = jwtCreator.verifyToken(req.headers.authorization || '');
  if (!payload?.userId) return { user: null };
  const user = await service.FindUserByUsername(payload.userId);
  if (!user || (Number(payload.tv) || 0) !== (Number(user.tokenVersion) || 0)) return { user: null };
  return { user, viaLogin: false };
}

const MfaSetup = async (req, res) => {
  try {
    const { user } = await mfaSubject(req);
    if (!user) return res.status(401).send('No autorizado');
    if (user.mfaEnabled) return res.status(400).send('La verificación en dos pasos ya está activa.');
    const secret = totp.generateSecret();
    await db.UpdateUserById(String(user._id), { mfaPendingEnc: secretBox.seal(secret) });
    return res.status(200).json({
      secret,
      otpauthUrl: totp.otpauthUrl({ secret, account: user.email || user.username }),
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('No se pudo preparar la verificación en dos pasos');
  }
};

const MfaEnable = async (req, res) => {
  try {
    const { user, viaLogin } = await mfaSubject(req);
    if (!user) return res.status(401).send('No autorizado');
    if (user.mfaEnabled) return res.status(400).send('La verificación en dos pasos ya está activa.');
    const secret = secretBox.open(user.mfaPendingEnc);
    if (!secret) return res.status(400).send('Empieza de nuevo: genera el código QR.');
    const step = totp.verifyTotp(secret, req.body?.code);
    if (step == null) return res.status(400).send('Código incorrecto. Revisa que la hora del celular esté bien.');

    const recoveryCodes = totp.generateRecoveryCodes();
    const updated = await db.UpdateUserById(String(user._id), {
      mfaEnabled: true,
      mfaSecretEnc: secretBox.seal(secret),
      mfaPendingEnc: null,
      mfaLastStep: step,
      mfaRecovery: recoveryCodes.map(totp.hashRecoveryCode),
      mfaEnabledAt: new Date(),
    });
    sessions.forgetUser(user.username);
    const out = { ok: true, recoveryCodes };
    // Equipo de plataforma: al activarlo desde el login, ya entra
    if (viaLogin) {
      await db.ClearLoginFailures(String(user._id));
      Object.assign(out, await sessions.startSession(req, res, updated || user));
    }
    return res.status(200).json(out);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('No se pudo activar la verificación en dos pasos');
  }
};

const MfaDisable = async (req, res) => {
  try {
    const user = await service.FindUserByUsername(req.user.username);
    if (!user) return res.status(404).send('Usuario no encontrado');
    if (isOutsideTenant(user.role)) {
      return res.status(400).send('Esta cuenta debe tener la verificación en dos pasos siempre activa.');
    }
    if (!user.mfaEnabled) return res.status(200).json({ ok: true });
    const ok = await hasher.checkPassword(req.body?.password || '', user.password);
    if (!ok) return res.status(400).send('La contraseña es incorrecta.');
    if (!checkSecondFactor(user, req.body?.code)) return res.status(400).send('Código incorrecto o vencido.');
    await db.UpdateUserById(String(user._id), {
      mfaEnabled: false,
      mfaSecretEnc: null,
      mfaPendingEnc: null,
      mfaRecovery: [],
      mfaLastStep: null,
    });
    sessions.forgetUser(user.username);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err.message);
    return res.status(500).send('No se pudo desactivar la verificación en dos pasos');
  }
};

const ForgotPassword = async (req, res) => {
  try {
    if (!hasSmtpConfig()) {
      return res
        .status(503)
        .send(
          'Correo no configurado. En backend/.env agrega SMTP (o RESEND_API_KEY) para enviar emails.'
        );
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).send('Email requerido');

    const user = await db.FindUserByEmail(email);
    if (!user) {
      return res.status(200).json({ ok: true, message: 'Si el correo existe, enviamos un enlace' });
    }

    const token = newResetToken();
    await db.UpdateUserById(String(user._id), {
      resetToken: token,
      resetExpires: new Date(Date.now() + 60 * 60 * 1000),
    });

    const appUrl = resolveAppUrl(req);
    const resetUrl = `${appUrl}/reset/${token}`;
    const mail = await sendPasswordResetEmail({ to: email, resetUrl });

    return res.status(200).json({
      ok: true,
      message: 'Si el correo existe, enviamos un enlace',
      mail,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al solicitar restablecimiento');
  }
};

const ResetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).send('Token y contraseña requeridos');
    }
    const user = await db.FindUserByResetToken(token);
    if (!user) return res.status(400).send('Token inválido o expirado');
    const weak = passwordProblem(password, { email: user.email, username: user.username, name: user.name });
    if (weak) return res.status(400).send(weak);

    const hashed = await hasher.hashPassword(password);
    await db.UpdateUserById(String(user._id), {
      password: hashed,
      resetToken: null,
      resetExpires: null,
      failedLogins: 0,
      lockedUntil: null,
    });
    // Quien tuviera la sesión abierta con la contraseña anterior queda fuera
    await sessions.revokeAll(user, 'password_reset');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al restablecer contraseña');
  }
};

const Me = async (req, res) => {
  try {
    const user = await service.FindUserByUsername(req.user.username);
    return res.status(200).json({
      username: req.user.username,
      role: req.user.role,
      tenantId: req.tenantId,
      partnerId: req.partnerId || null,
      email: String(user?.email || req.user.email || '').trim().toLowerCase(),
      roles: ROLES,
      mfaEnabled: Boolean(user?.mfaEnabled),
      mfaRecoveryLeft: Array.isArray(user?.mfaRecovery) ? user.mfaRecovery.length : 0,
    });
  } catch (err) {
    return res.status(500).send(err.message || 'No pude leer tu sesión');
  }
};

const ChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).send('Contraseña actual y nueva son requeridas');
    }
    const user = await service.FindUserByUsername(req.user.username);
    if (!user) return res.status(404).send('Usuario no encontrado');
    const weak = passwordProblem(newPassword, { email: user.email, username: user.username, name: user.name });
    if (weak) return res.status(400).send(weak);

    const valid = await hasher.checkPassword(currentPassword, user.password);
    if (!valid) return res.status(400).send('La contraseña actual es incorrecta');

    const hashed = await hasher.hashPassword(newPassword);
    await db.UpdateUserById(String(user._id), { password: hashed });
    // Cierra las demás sesiones y deja abierta esta con un token nuevo
    const fresh = await sessions.revokeAll(user, 'password_change');
    const session = await sessions.startSession(req, res, fresh);
    return res.status(200).json({ ok: true, message: 'Contraseña actualizada. Cerramos tus otras sesiones.', ...session });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al cambiar contraseña');
  }
};

module.exports = {
  CreateUser,
  ApplyPartner,
  CheckReferralCode,
  LoginUsuario,
  LoginMfa,
  RefreshSession,
  Logout,
  MfaSetup,
  MfaEnable,
  MfaDisable,
  ForgotPassword,
  ResetPassword,
  Me,
  ChangePassword,
};
