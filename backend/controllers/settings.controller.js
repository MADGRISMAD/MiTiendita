const settingsSchema = require('../models/settings.model');
const db = require('../database/mongodb');
const limits = require('../services/plan-limits.service');
const masterCatalog = require('../services/master-catalog.service');
const { isSubscriptionActive } = require('../models/tenant.model');
const supportMail = require('../services/support-mail.service');

async function GetSettings(req, res) {
  try {
    // Cuentas sin tienda (plataforma, socios) no tienen configuración de tienda
    if (!req.tenantId) return res.status(404).send({ setupCompleted: false });
    const settings = await db.GetSettings(req.tenantId);
    if (!settings) {
      return res.status(404).send({ setupCompleted: false });
    }
    return res.status(200).send(settings);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Error al obtener la configuración');
  }
}

async function SaveSettings(req, res) {
  try {
    const { error, value } = settingsSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).send(error.details.map((d) => d.message).join(', '));
    }

    const payload = {
      ...value,
      tenantId: req.tenantId,
      setupCompleted: true,
      updatedAt: new Date(),
    };

    const existing = await db.GetSettings(req.tenantId);
    if (!existing) {
      payload.createdAt = new Date();
      let created = await db.CreateSettings(payload);
      try {
        if (await masterCatalog.syncForGiro(db, req.tenantId, created)) created = await db.GetSettings(req.tenantId);
      } catch (err) {
        console.warn('[catálogo maestro]', err.message);
      }
      return res.status(201).send(created);
    }

    let updated = await db.UpdateSettings(payload, req.tenantId);
    // El catálogo maestro se carga (o se retira) según el giro que eligió; si falla, lo ajustado igual se guardó
    try {
      if (await masterCatalog.syncForGiro(db, req.tenantId, updated)) updated = await db.GetSettings(req.tenantId);
    } catch (err) {
      console.warn('[catálogo maestro]', err.message);
    }
    return res.status(200).send(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Error al guardar la configuración');
  }
}

async function GetOnboarding(req, res) {
  try {
    if (!req.tenantId) return res.status(404).send('Sin tienda');
    const [settings, tenant, productCount, userCount, paidSales, cashSessions] = await Promise.all([
      db.GetSettings(req.tenantId),
      db.GetTenantById(req.tenantId),
      db.CountPlanFoods(req.tenantId),
      db.CountUsersByTenant(req.tenantId),
      db.CountPaidOrders(req.tenantId),
      db.CountCashSessions(req.tenantId),
    ]);
    const plan = tenant?.plan || 'basic';
    const usage = await limits.usageFor(req.tenantId, plan);
    const steps = [
      {
        id: 'setup',
        label: 'Nombra y configura tu tienda',
        done: Boolean(settings?.setupCompleted && settings?.businessName),
        to: '/setup',
      },
      {
        id: 'catalog',
        label: settings?.masterCatalogVersion
          ? 'Ponle precio a lo que vendes (al escanearlo, la caja te lo pide)'
          : 'Carga productos al catálogo',
        done: productCount > 0,
        to: '/products',
      },
      {
        id: 'cash',
        label: 'Abre caja para cobrar',
        done: cashSessions > 0,
        to: '/orders',
      },
      {
        id: 'sale',
        label: 'Cobra tu primer ticket',
        done: paidSales > 0,
        to: '/pos',
      },
      {
        id: 'plan',
        label: tenant?.billingStatus === 'active' ? 'Plan activo' : 'Activa un plan (o sigue la prueba)',
        done: tenant?.billingStatus === 'active',
        to: '/billing',
      },
    ];
    const remaining = steps.filter((s) => !s.done).length;
    return res.status(200).json({
      setupCompleted: Boolean(settings?.setupCompleted),
      dismissed: Boolean(settings?.gettingStartedDismissed),
      productCount,
      userCount,
      paidSales,
      cashSessions,
      limits: usage,
      billing: {
        plan,
        billingStatus: tenant?.billingStatus || 'trialing',
        active: isSubscriptionActive(tenant),
        trialDaysLeft: tenant?.trialEndsAt
          ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000))
          : 0,
      },
      steps,
      remaining,
      complete: remaining === 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al leer el avance');
  }
}

async function DismissOnboarding(req, res) {
  try {
    await db.UpdateSettings({ gettingStartedDismissed: true, updatedAt: new Date() }, req.tenantId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al ocultar el asistente');
  }
}

async function GetSupport(req, res) {
  try {
    const users = await db.ListUsersByTenant(req.tenantId);
    const me = users.find((user) => user.username === req.user?.username);
    const clientEmail = String(me?.email || '').trim().toLowerCase();
    if (!clientEmail.includes('@')) {
      return res.status(400).send('Tu usuario no tiene un correo. Agrégalo para ver tus mensajes.');
    }
    return res.status(200).json(await supportMail.threadForLocal(req.tenantId, { clientEmail }));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al leer soporte');
  }
}

async function SendSupport(req, res) {
  try {
    const subject = String(req.body?.subject || '').trim().slice(0, 140);
    const message = String(req.body?.message || '').trim();
    if (subject.length < 3) return res.status(400).send('Escribe un asunto (mín. 3 caracteres).');
    if (message.length < 8) return res.status(400).send('Cuéntanos el problema con un poco más de detalle.');

    const [settings, users] = await Promise.all([
      db.GetSettings(req.tenantId),
      db.ListUsersByTenant(req.tenantId),
    ]);
    const me = users.find((u) => u.username === req.user?.username) || users[0];
    const from = me?.email || '';
    if (!from.includes('@')) {
      return res.status(400).send('Tu usuario no tiene un correo. Agrégalo o escribe desde otra cuenta.');
    }

    const thread = await supportMail.sendFromClient({
      tenantId: req.tenantId,
      from,
      storeName: settings?.businessName || 'Tienda',
      subject,
      message,
    });
    return res.status(201).json(thread);
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'Error al enviar a soporte');
  }
}

module.exports = {
  GetSettings,
  SaveSettings,
  GetOnboarding,
  DismissOnboarding,
  GetSupport,
  SendSupport,
};
