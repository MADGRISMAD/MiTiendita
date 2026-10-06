const db = require('../database/db');
const mp = require('../services/mercadopago.service');
const limits = require('../services/plan-limits.service');
const { PUBLIC_PLANS, isSubscriptionActive, trialEndsFrom } = require('../models/tenant.model');
const { hasAiFeatures, isPerpetual, formatAiQuota, planAiQuota, PROMO, promoPrice } = require('../services/plans.catalog');
const {
  safeSend,
  sendPaymentConfirmedEmail,
  sendSubscriptionCancelledEmail,
} = require('../utils/mail.utils');
const { resolveAppUrl } = require('../utils/app-url.utils');
const { verifyMpSignature } = require('../utils/mp-signature');
const referrals = require('../services/referral.service');
const promo = require('../services/promo.service');

function daysLeft(trialEndsAt) {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Días que le quedan de prueba (0 si ya terminó o no está en prueba). */
function trialDaysLeftNow(tenant) {
  if ((tenant?.billingStatus || 'trialing') !== 'trialing' || !tenant?.trialEndsAt) return 0;
  const ms = new Date(tenant.trialEndsAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
}

function periodEndFor(interval, from) {
  const periodEnd = from ? new Date(from) : new Date();
  if (interval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);
  return periodEnd;
}

async function applyPreapprovalToTenant(tenant, pre, dataId) {
  if (isPerpetual(tenant?.plan)) return tenant;
  const billingStatus = mp.mapMpStatusToBilling(pre.status);
  if (!tenant || !billingStatus) return null;

  const patch = {
    billingStatus,
    mpPreapprovalId: String(dataId || pre.id || tenant.mpPreapprovalId || ''),
  };

  // Se suscribió durante la prueba: la prueba se respeta completa y el primer cobro llega al terminar
  const waitingTrial = billingStatus === 'active' && Boolean(tenant.subscribedInTrial) && trialDaysLeftNow(tenant) > 0;

  if (billingStatus === 'active') {
    const parts = String(pre.external_reference || '').split(':');
    const plan = parts[1];
    const interval = parts[2] === 'year' ? 'year' : 'month';
    patch.currentPeriodEnd = periodEndFor(interval, waitingTrial ? tenant.trialEndsAt : undefined);
    patch.billingInterval = interval;
    if (waitingTrial) patch.billingStatus = 'trialing';
    patch.suspendedAt = null;
    patch.suspendedReason = null;
    patch.cancelAtPeriodEnd = false;
    if (PUBLIC_PLANS.includes(plan)) patch.plan = plan;
  }
  if (billingStatus === 'suspended') {
    const stillCovered =
      tenant.cancelAtPeriodEnd &&
      tenant.currentPeriodEnd &&
      new Date(tenant.currentPeriodEnd).getTime() > Date.now();
    if (stillCovered) {
      patch.billingStatus = 'active';
      patch.cancelAtPeriodEnd = true;
    } else {
      patch.suspendedAt = new Date();
      patch.suspendedReason = 'mercado_pago';
    }
  }

  const updated = await db.UpdateTenant(tenant.id, patch);
  await recordEvent({
    tenantId: tenant.id,
    type: waitingTrial ? 'subscribed_in_trial' : billingStatus === 'active' ? 'activated' : billingStatus || 'webhook',
    plan: updated?.plan || tenant.plan,
    interval: updated?.billingInterval || tenant.billingInterval,
    amount: chargedAmount(updated || tenant, null),
    mpStatus: pre.status,
    note: waitingTrial
      ? 'Suscripción lista: el primer cobro es al terminar la prueba'
      : billingStatus === 'active'
        ? 'Pago confirmado'
        : `Mercado Pago: ${pre.status || billingStatus}`,
  });
  if (billingStatus === 'active' && !waitingTrial && tenant.billingStatus !== 'active') {
    notifyPayment(updated || tenant).catch(() => {});
    // Primer cobro: la promoción avanza y el vendedor que refirió la tienda gana su comisión (sobre lo realmente cobrado)
    const activationKey = `act:${patch.mpPreapprovalId}:${new Date(patch.currentPeriodEnd).toISOString().slice(0, 10)}`;
    const afterPromo = await promo.onPayment(updated || tenant, { key: activationKey, source: 'activation' }).catch(() => null);
    creditReferral({ ...(updated || tenant), promo: afterPromo || (updated || tenant).promo }, {
      amount: chargedAmount(updated || tenant, afterPromo),
      source: 'activation',
      key: activationKey,
      note: 'Activación de la suscripción',
    });
  }
  return updated;
}

/** Comisión del vendedor por un cobro. Nunca debe romper el cobro de la tienda. */
async function creditReferral(tenant, payment) {
  try {
    if (!tenant?.referrerId) return null;
    return await referrals.recordPayment({ tenant, ...payment });
  } catch (err) {
    console.warn('[referidos] no se pudo registrar la comisión:', err.message);
    return null;
  }
}

/**
 * Lo que se cobró en este pago: el precio de promoción mientras dure (pending/active en su primer cobro) o el normal.
 * `after` es el estado de la promoción ya con este cobro contado.
 */
function chargedAmount(tenant, after) {
  const state = after || tenant.promo;
  if (state && state.amount && ['pending', 'active'].includes(state.state)) return Number(state.amount);
  return mp.planPrice(tenant.plan, tenant.billingInterval || 'month');
}

async function recordEvent(data) {
  try {
    return await db.CreateBillingEvent(data);
  } catch (err) {
    console.warn('[billing] no se pudo guardar evento:', err.message);
    return null;
  }
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: process.env.MP_CURRENCY || 'MXN',
    maximumFractionDigits: 0,
  });
}

function formatDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

async function payerEmailFor(tenant) {
  if (tenant?.mpPayerEmail) return tenant.mpPayerEmail;
  const emails = await db.ListTenantAdminEmails(tenant.id);
  return emails[0] || null;
}

async function notifyPayment(tenant) {
  const to = await payerEmailFor(tenant);
  if (!to) return;
  const settings = await db.GetSettings(tenant.id);
  await safeSend(() =>
    sendPaymentConfirmedEmail({
      to,
      businessName: settings?.businessName || tenant.name,
      planName: limits.planName(tenant.plan),
      interval: tenant.billingInterval || 'month',
      amount: formatMoney(chargedAmount(tenant, null)),
      periodEnd: formatDate(tenant.currentPeriodEnd),
      appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
    })
  );
}

async function getPlans(req, res) {
  return res.status(200).json({
    plans: mp.listPlans(),
    mock: !mp.hasMpConfig(),
    sandbox: mp.hasMpConfig() ? mp.isMpSandbox() : false,
  });
}

async function getStatus(req, res) {
  try {
    let tenant = await db.GetTenantById(req.tenantId);
    if (!tenant) return res.status(404).send('Tenant no encontrado');
    // Si ya pasó la fecha del 3er cobro de la promoción, se sube al precio normal
    if (await promo.sweepTenant(tenant)) tenant = (await db.GetTenantById(req.tenantId)) || tenant;
    const plan = tenant.plan || 'basic';
    const usage = await limits.usageFor(req.tenantId, plan);
    const aiOn = hasAiFeatures(plan);
    return res.status(200).json({
      plan,
      planName: limits.planName(plan),
      isPerpetual: isPerpetual(plan),
      aiEnabled: aiOn,
      billingInterval: tenant.billingInterval || 'month',
      billingStatus: tenant.billingStatus || 'trialing',
      trialEndsAt: tenant.trialEndsAt || null,
      trialDaysLeft: daysLeft(tenant.trialEndsAt),
      currentPeriodEnd: tenant.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(tenant.cancelAtPeriodEnd),
      active: isSubscriptionActive(tenant),
      mpConfigured: mp.hasMpConfig(),
      mpSandbox: mp.hasMpConfig() ? mp.isMpSandbox() : false,
      mpPreapprovalId: tenant.mpPreapprovalId || null,
      mpPayerEmail: tenant.mpPayerEmail || null,
      aiQuota: aiOn ? planAiQuota(plan) : 0,
      aiQuotaLabel: aiOn ? formatAiQuota(planAiQuota(plan)) : 'No incluido',
      limits: usage,
      promo: promo.describe(tenant),
      subscribedInTrial: Boolean(tenant.subscribedInTrial) && daysLeft(tenant.trialEndsAt) > 0,
      firstChargeAt: tenant.subscribedInTrial && daysLeft(tenant.trialEndsAt) > 0 ? tenant.trialEndsAt : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al leer facturación');
  }
}

async function checkout(req, res) {
  try {
    const plan = String(req.body?.plan || 'basic');
    const interval = String(req.body?.interval || 'month') === 'year' ? 'year' : 'month';
    if (!PUBLIC_PLANS.includes(plan)) {
      return res.status(400).send('plan debe ser basic, growth o pro');
    }

    const tenant = await db.GetTenantById(req.tenantId);
    if (!tenant) return res.status(404).send('Tenant no encontrado');
    if (isPerpetual(tenant.plan)) {
      return res.status(400).send('Esta tienda tiene licencia perpetua. Para un plan con magia, pídelo en soporte.');
    }

    const payerEmail =
      String(req.body?.email || '').trim() ||
      tenant.mpPayerEmail ||
      null;

    let email = payerEmail;
    if (!email && mp.isMpSandbox() && process.env.MP_TEST_PAYER_EMAIL) {
      email = String(process.env.MP_TEST_PAYER_EMAIL).trim();
    }
    if (!email) {
      const user = await db.FindUserByUsername(req.user.username);
      email = user?.email || null;
    }
    if (!email) {
      return res
        .status(400)
        .send(
          mp.isMpSandbox()
            ? 'En modo prueba indica el email del usuario Comprador (Cuentas de prueba en Mercado Pago).'
            : 'Necesitamos un correo para cobrar en Mercado Pago.'
        );
    }

    if (mp.isMpSandbox()) {
      const looksPersonal =
        /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me)\./i.test(email) ||
        email === 'madgrismad@gmail.com';
      // No bloqueamos del todo (a veces MP da @testuser.com), pero avisamos en logs
      if (looksPersonal) {
        console.warn(
          '[mp] Sandbox con email personal:',
          email,
          '— MP suele exigir usuario de prueba (Comprador).'
        );
      }
    }

    // Promoción de lanzamiento (clientes nuevos, plan mensual): los primeros cobros a 1/3 del precio
    const withPromo = promo.isEligible(tenant, plan, interval);
    // La prueba se respeta completa: si aún le quedan días, el primer cobro espera a que termine
    const freeTrialDays = trialDaysLeftNow(tenant);
    const preapproval = await mp.createPreapproval({
      plan,
      tenantId: req.tenantId,
      payerEmail: email,
      interval,
      externalReference: `${req.tenantId}:${plan}:${interval}`,
      amountOverride: withPromo ? promoPrice(plan) : null,
      freeTrialDays,
    });
    await promo.onCheckout(tenant, plan, interval);

    await db.UpdateTenant(req.tenantId, {
      plan,
      billingInterval: interval,
      cancelAtPeriodEnd: false,
      mpPreapprovalId: preapproval.id || null,
      mpPayerEmail: email,
      subscribedInTrial: freeTrialDays > 0,
    });
    await recordEvent({
      tenantId: req.tenantId,
      type: 'checkout',
      plan,
      interval,
      amount: preapproval.amount || mp.planPrice(plan, interval),
      note: (preapproval.mock ? 'Checkout (modo desarrollo)' : 'Checkout Mercado Pago') + (withPromo ? ` · promoción ${PROMO.months} meses a 1/3` : '') + (freeTrialDays > 0 ? ` · primer cobro al terminar la prueba (${freeTrialDays} días)` : ''),
    });

    return res.status(200).json({
      mock: Boolean(preapproval.mock),
      preapprovalId: preapproval.id,
      interval,
      amount: preapproval.amount || mp.planPrice(plan, interval),
      init_point: preapproval.init_point || preapproval.sandbox_init_point,
      sandbox_init_point: preapproval.sandbox_init_point || preapproval.init_point,
      sandbox: mp.isMpSandbox(),
      localReturn: Boolean(preapproval.localReturn),
    });
  } catch (err) {
    console.error(err);
    let msg = err.message || 'Error al crear checkout';
    if (/payer|collector/i.test(msg)) {
      msg =
        'En modo prueba, pagador y cobrador deben ser usuarios de prueba de Mercado Pago. Crea un Comprador en «Cuentas de prueba» y usa ese correo (no tu Gmail).';
    }
    return res.status(err.status || 500).send(msg);
  }
}

/** Solo desarrollo: activar plan sin Mercado Pago */
async function devActivate(req, res) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).send('Not found');
    }
    const plan = String(req.body?.plan || 'basic');
    const interval = String(req.body?.interval || 'month') === 'year' ? 'year' : 'month';
    if (!PUBLIC_PLANS.includes(plan)) {
      return res.status(400).send('plan debe ser basic, growth o pro');
    }
    const tenant = await db.GetTenantById(req.tenantId);
    if (!tenant) return res.status(404).send('Tenant no encontrado');
    if (isPerpetual(tenant.plan)) {
      return res.status(400).send('Esta tienda tiene licencia perpetua. Para un plan con magia, pídelo en soporte.');
    }

    const keepTrial = trialDaysLeftNow(tenant) > 0;
    const updated = await db.UpdateTenant(req.tenantId, {
      plan,
      billingInterval: interval,
      billingStatus: keepTrial ? 'trialing' : 'active',
      subscribedInTrial: keepTrial,
      currentPeriodEnd: periodEndFor(interval, keepTrial ? tenant.trialEndsAt : undefined),
      cancelAtPeriodEnd: false,
      suspendedAt: null,
      suspendedReason: null,
      mpPreapprovalId: req.body?.preapprovalId || `mock_dev_${Date.now()}`,
    });
    await recordEvent({
      tenantId: req.tenantId,
      type: 'activated',
      plan,
      interval,
      amount: promo.isEligible(tenant, plan, interval) ? promoPrice(plan) : mp.planPrice(plan, interval),
      note: 'Activación en modo desarrollo',
    });
    if (keepTrial) {
      await promo.onCheckout(tenant, plan, interval);
      return res.status(200).json({
        ok: true,
        plan: updated.plan,
        billingInterval: interval,
        billingStatus: updated.billingStatus,
        currentPeriodEnd: updated.currentPeriodEnd,
      });
    }
    const devKey = `act:${updated.mpPreapprovalId}:${new Date(updated.currentPeriodEnd).toISOString().slice(0, 10)}`;
    await promo.onCheckout(tenant, plan, interval);
    const fresh = (await db.GetTenantById(req.tenantId)) || updated;
    const afterPromo = await promo.onPayment(fresh, { key: devKey, source: 'activation' }).catch(() => null);
    notifyPayment({ ...updated, promo: afterPromo || fresh.promo }).catch(() => {});
    await creditReferral({ ...updated, promo: afterPromo || fresh.promo }, {
      amount: chargedAmount(updated, afterPromo),
      source: 'activation',
      key: devKey,
      note: 'Activación en modo desarrollo',
    });

    return res.status(200).json({
      ok: true,
      plan: updated.plan,
      billingInterval: interval,
      billingStatus: updated.billingStatus,
      currentPeriodEnd: updated.currentPeriodEnd,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al activar');
  }
}

/**
 * Tras volver de Mercado Pago (?mp=return), consulta el preapproval
 * y actualiza el tenant. Útil en local sin webhook público.
 */
async function sync(req, res) {
  try {
    const tenant = await db.GetTenantById(req.tenantId);
    if (!tenant) return res.status(404).send('Tenant no encontrado');

    const preapprovalId =
      String(req.body?.preapprovalId || '').trim() || tenant.mpPreapprovalId;

    if (!preapprovalId) {
      return res.status(400).send('No hay suscripción de Mercado Pago pendiente');
    }

    if (!mp.hasMpConfig()) {
      return res.status(400).send('Mercado Pago no está configurado');
    }

    const pre = await mp.getPreapproval(preapprovalId);
    const updated = await applyPreapprovalToTenant(tenant, pre, preapprovalId);

    return res.status(200).json({
      ok: true,
      mpStatus: pre.status,
      billingStatus: updated?.billingStatus || tenant.billingStatus,
      plan: updated?.plan || tenant.plan,
      active: isSubscriptionActive(updated || tenant),
      pending: String(pre.status || '').toLowerCase() === 'pending',
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'Error al sincronizar pago');
  }
}

async function webhook(req, res) {
  try {
    const body = req.body || {};
    const query = req.query || {};

    // Solo se aceptan avisos firmados por Mercado Pago. Sin la clave, en desarrollo se deja pasar con aviso.
    const secret = String(process.env.MP_WEBHOOK_SECRET || '').trim();
    const isProd = process.env.NODE_ENV === 'production';
    if (secret || isProd) {
      const check = verifyMpSignature({ headers: req.headers || {}, query, body, secret });
      if (!check.ok) {
        console.warn('[mp:webhook] rechazado:', check.reason);
        // Bitácora de la plataforma (no es de ninguna tienda)
        const requestId = String(req.headers?.['x-request-id'] || '').slice(0, 80);
        await recordEvent({
          tenantId: '_mercadopago',
          type: 'webhook_rejected',
          note: `Webhook de Mercado Pago rechazado: ${check.reason}${requestId ? ` (request-id ${requestId})` : ''}`,
        });
        return res.status(401).json({ ok: false });
      }
    } else {
      console.warn('[mp:webhook] MP_WEBHOOK_SECRET sin configurar: no se verifica la firma (solo desarrollo)');
    }

    const topic = body.type || body.topic || query.topic || query.type;
    const dataId =
      body.data?.id ||
      body.id ||
      query.id ||
      query['data.id'] ||
      null;

    console.log('[mp:webhook]', { topic, dataId });

    const topicStr = String(topic || '').toLowerCase();
    // Cobro recurrente de la suscripción (no es una suscripción: es un pago de ella)
    const isAuthorizedPayment = topicStr.includes('authorized_payment');
    const isPreapproval =
      !isAuthorizedPayment && (topicStr.includes('preapproval') || topicStr.includes('subscription'));

    if (dataId && isAuthorizedPayment) {
      const payment = await mp.getAuthorizedPayment(dataId);
      if (String(payment.status || '').toLowerCase() === 'processed') {
        const tenant = payment.preapproval_id ? await db.GetTenantByMpPreapprovalId(payment.preapproval_id) : null;
        if (tenant) {
          const amount = Number(payment.transaction_amount ?? payment.payment?.transaction_amount ?? 0);
          await recordEvent({
            tenantId: tenant.id,
            type: 'payment',
            plan: tenant.plan,
            interval: tenant.billingInterval,
            amount,
            mpStatus: payment.status,
            note: 'Cobro de la suscripción',
          });
          // Primer cobro tras la prueba (o cobro que regulariza un atraso): la tienda pasa a plan activo
          if (['trialing', 'past_due'].includes(tenant.billingStatus || 'trialing') && !tenant.suspendedReason) {
            const interval = tenant.billingInterval === 'year' ? 'year' : 'month';
            const activated = await db.UpdateTenant(tenant.id, {
              billingStatus: 'active',
              currentPeriodEnd: periodEndFor(interval),
              subscribedInTrial: false,
              suspendedAt: null,
              suspendedReason: null,
            });
            if (tenant.billingStatus === 'trialing') notifyPayment({ ...(activated || tenant), promo: tenant.promo }).catch(() => {});
          }
          const paymentKey = `ap:${payment.id || dataId}`;
          const afterPromo = await promo.onPayment(tenant, { key: paymentKey, source: 'authorized_payment' }).catch(() => null);
          await creditReferral(tenant, {
            amount,
            source: 'authorized_payment',
            key: paymentKey,
            mpPaymentId: payment.id || dataId,
            note: 'Cobro de la suscripción',
          });
        }
      }
    }

    if (dataId && isPreapproval) {
      const pre = await mp.getPreapproval(dataId);
      let tenant = (await db.GetTenantByMpPreapprovalId(dataId)) || null;

      if (!tenant && pre.external_reference) {
        const tenantId = String(pre.external_reference).split(':')[0];
        tenant = await db.GetTenantById(tenantId);
      }

      if (tenant) {
        await applyPreapprovalToTenant(tenant, pre, dataId);
      } else {
        console.warn('[mp:webhook] tenant no encontrado para', dataId, pre.external_reference);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('MP webhook error:', err.message);
    return res.status(200).json({ ok: false });
  }
}

async function history(req, res) {
  try {
    const events = await db.ListBillingEvents(req.tenantId);
    return res.status(200).json({ events });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al leer historial');
  }
}

async function cancel(req, res) {
  try {
    const tenant = await db.GetTenantById(req.tenantId);
    if (!tenant) return res.status(404).send('Tenant no encontrado');
    if (isPerpetual(tenant.plan)) {
      return res.status(400).send('La licencia perpetua no se cancela aquí. Escríbenos a soporte.');
    }
    if (tenant.billingStatus !== 'active') {
      return res.status(400).send('No hay una suscripción activa para cancelar.');
    }
    if (tenant.cancelAtPeriodEnd) {
      return res.status(200).json({
        ok: true,
        already: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: tenant.currentPeriodEnd,
        message: 'Esta suscripción ya está programada para no renovarse.',
      });
    }

    if (tenant.mpPreapprovalId) {
      await mp.cancelPreapproval(tenant.mpPreapprovalId);
    }

    const updated = await db.UpdateTenant(req.tenantId, {
      cancelAtPeriodEnd: true,
    });
    await recordEvent({
      tenantId: req.tenantId,
      type: 'cancelled',
      plan: tenant.plan,
      interval: tenant.billingInterval,
      amount: mp.planPrice(tenant.plan, tenant.billingInterval || 'month'),
      note: 'Cancelación al fin del periodo',
    });

    const to = await payerEmailFor(updated || tenant);
    if (to) {
      const settings = await db.GetSettings(req.tenantId);
      const appUrl = resolveAppUrl(req);
      safeSend(() =>
        sendSubscriptionCancelledEmail({
          to,
          businessName: settings?.businessName || tenant.name,
          planName: limits.planName(tenant.plan),
          periodEnd: formatDate(tenant.currentPeriodEnd),
          appUrl,
        })
      ).catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: updated?.currentPeriodEnd || tenant.currentPeriodEnd,
      active: isSubscriptionActive(updated || tenant),
      message: 'Cancelamos el cargo recurrente. Sigues usando el sistema hasta el fin del periodo pagado.',
    });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).send(err.message || 'Error al cancelar');
  }
}

module.exports = {
  getPlans,
  getStatus,
  checkout,
  sync,
  cancel,
  history,
  devActivate,
  webhook,
  daysLeft,
  trialEndsFrom,
};
