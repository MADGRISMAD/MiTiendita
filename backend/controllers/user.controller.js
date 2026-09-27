const schema = require('../models/usuario.model');
const service = require('../services/usuario.service');
const hasher = require('../utils/bcrypt.utils');
const waitlist = require('../models/waitlist.model');
const jwtCreator = require('../utils/jwt.utils');
const db = require('../database/mongodb');
const { createTenantDoc, newResetToken, ROLES, TRIAL_DAYS } = require('../models/tenant.model');
const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  hasSmtpConfig,
  safeSend,
} = require('../utils/mail.utils');
const { resolveAppUrl } = require('../utils/app-url.utils');

const CreateUser = async (req, res) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).send(error.message);
    }
    if (await service.FindUserByUsername(value.username)) {
      return res.status(400).send('Usuario con el nombre de usuario ya registrado');
    }
    if (await service.FindUserByEmail(value.email)) {
      return res.status(400).send('Usuario con el correo ya registrado');
    }

    const tenant = await db.CreateTenant(
      createTenantDoc(value.businessName || `${value.name} ${value.lastName}`)
    );
    const tenantId = tenant.id;

    value.password = await hasher.hashPassword(value.password);
    value.role = 'admin';
    value.tenantId = tenantId;
    delete value.businessName;

    await service.CreateUser(value);

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

    const token = jwtCreator.generateJWT({
      userId: value.username,
      userRole: 'admin',
      tenantId,
    });

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
      token,
      role: 'admin',
      tenantId,
      username: value.username,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};

const FindUserByEmail = async (req, res) => {
  try {
    const search = await service.FindUserByEmail(req.body.email);
    if (search) return res.status(200).send(search);
    return res.status(404).send('Usuario no encontrado');
  } catch (error) {
    return res.status(500).send(error);
  }
};

const LoginUsuario = async (req, res, next) => {
  try {
    const search = await service.LoginUsuario(req.body.data);
    if (search) {
      const compare = await hasher.checkPassword(req.body.password, search.password);
      if (compare) {
        const isPlatform = search.role === 'platform_admin';
        if (!isPlatform && !search.tenantId) {
          return res.status(403).send('Usuario sin tenant asignado');
        }
        const token = jwtCreator.generateJWT({
          userId: search.username,
          userRole: search.role,
          tenantId: search.tenantId || null,
        });
        req.token = token;
        req.role = search.role;
        req.tenantId = search.tenantId || null;
        req.username = search.username;
        return next();
      }
    }
    return res.status(404).send('Correo o contraseña incorrecta');
  } catch (error) {
    console.error(error.message);
    return res.status(500).send(error.message);
  }
};

const FindUserByUsername = async (req, res) => {
  try {
    const search = await service.FindUserByUsername(req.body.username);
    if (search) return res.status(200).send(search);
    return res.status(404).send('Usuario no encontrado');
  } catch (err) {
    console.error(err);
    return res.status(500).send(err);
  }
};

const FindWaiters = async (req, res) => {
  try {
    const search = await db.GetWaiters(req.tenantId);
    return res.status(200).send(search || []);
  } catch (err) {
    console.error(err.message);
    return res.status(500).send(err.message);
  }
};

const GetWaitList = async (req, res) => {
  try {
    const Search = await db.GetWaitList(req.tenantId);
    return res.status(200).send(Search);
  } catch (exp) {
    console.error(exp.message);
    return res.status(500).send(exp);
  }
};

const DeleteWaitList = async (req, res) => {
  try {
    const result = await db.DeleteWaitList(req.params.id, req.tenantId);
    return res.status(200).send(result);
  } catch (exp) {
    console.error(exp.message);
    return res.status(500).send(exp);
  }
};

const AddWaitList = async (req, res) => {
  try {
    const { error, value } = waitlist.validate(req.body);
    if (error) return res.status(400).send(error.message);
    value.tenantId = req.tenantId;
    await db.AddWaitList(value);
    return res.status(200).send('Añadido a la wait list');
  } catch (exp) {
    console.error(exp.message);
    return res.status(500).send(exp);
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
    if (!token || !password || String(password).length < 6) {
      return res.status(400).send('Token y contraseña (mín. 6) requeridos');
    }
    const user = await db.FindUserByResetToken(token);
    if (!user) return res.status(400).send('Token inválido o expirado');

    const hashed = await hasher.hashPassword(password);
    await db.UpdateUserById(String(user._id), {
      password: hashed,
      resetToken: null,
      resetExpires: null,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al restablecer contraseña');
  }
};

const Me = async (req, res) => {
  return res.status(200).json({
    username: req.user.username,
    role: req.user.role,
    tenantId: req.tenantId,
    roles: ROLES,
  });
};

module.exports = {
  CreateUser,
  FindUserByEmail,
  LoginUsuario,
  FindUserByUsername,
  FindWaiters,
  GetWaitList,
  DeleteWaitList,
  AddWaitList,
  ForgotPassword,
  ResetPassword,
  Me,
};
