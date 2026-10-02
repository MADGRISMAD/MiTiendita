/**
 * Mercado Pago Preapproval (suscripciones) — con fallback mock sin token.
 * Docs: frequency_type solo "days" | "months" (anual = frequency 12 + months).
 */
const {
  PLANS,
  planPrice,
  planLabel,
  planAiQuota,
  formatAiQuota,
  listPlans: catalogList,
} = require('./plans.catalog');

const MP_API = 'https://api.mercadopago.com';

function hasMpConfig() {
  return Boolean(String(process.env.MP_ACCESS_TOKEN || '').trim());
}

/** El modo de prueba (sin token o ids mock_) solo existe fuera de producción. */
function mockAllowed() {
  return process.env.NODE_ENV !== 'production';
}

function mockDisabledError() {
  const err = new Error('Mercado Pago no está configurado en producción (MP_ACCESS_TOKEN).');
  err.status = 503;
  return err;
}

function isMpSandbox() {
  if (String(process.env.MP_SANDBOX || '').toLowerCase() === 'true') return true;
  if (String(process.env.MP_SANDBOX || '').toLowerCase() === 'false') return false;
  const t = String(process.env.MP_ACCESS_TOKEN || '');
  return t.startsWith('TEST-') || /TEST/i.test(t);
}

function listPlans() {
  return catalogList(process.env.MP_CURRENCY || 'MXN');
}

function isLocalHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');
}

/**
 * MP rechaza localhost y ciertos TLDs poco comunes.
 * Si MP_BACK_URL está definido se usa tal cual (URL completa ya lista).
 * Si no, se construye desde APP_URL.
 */
function resolveBackUrl() {
  const explicit = String(process.env.MP_BACK_URL || '').trim();
  if (explicit) return explicit;

  const candidates = [process.env.APP_PUBLIC_URL, process.env.APP_URL];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const u = new URL(String(raw).trim());
      if (isLocalHostname(u.hostname)) continue;
      const base = `${u.protocol}//${u.host}`.replace(/\/$/, '');
      return `${base}/billing`;
    } catch {
      /* next */
    }
  }
  return 'https://www.mercadopago.com.mx';
}

function resolveNotificationUrl() {
  const apiUrl = (
    process.env.API_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 8081}`
  ).replace(/\/$/, '');
  try {
    const u = new URL(apiUrl);
    if (isLocalHostname(u.hostname)) {
      return undefined;
    }
    return `${apiUrl}/billing/webhook`;
  } catch {
    return undefined;
  }
}

function autoRecurringFor(interval, amount, currency) {
  if (interval === 'year') {
    return {
      frequency: 12,
      frequency_type: 'months',
      transaction_amount: amount,
      currency_id: currency,
    };
  }
  return {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: amount,
    currency_id: currency,
  };
}

async function createPreapproval({
  plan,
  tenantId,
  payerEmail,
  externalReference,
  interval = 'month',
}) {
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const billingInterval = interval === 'year' ? 'year' : 'month';
  const amount = planPrice(plan, billingInterval);
  const currency = process.env.MP_CURRENCY || 'MXN';
  const ref = externalReference || `${tenantId}:${plan}:${billingInterval}`;

  if (!hasMpConfig()) {
    if (!mockAllowed()) throw mockDisabledError();
    return {
      mock: true,
      id: `mock_${tenantId}_${plan}_${billingInterval}_${Date.now()}`,
      init_point: `${appUrl}/billing?mock=1&plan=${plan}&interval=${billingInterval}`,
      sandbox_init_point: `${appUrl}/billing?mock=1&plan=${plan}&interval=${billingInterval}`,
      status: 'pending',
      amount,
      interval: billingInterval,
    };
  }

  const backUrl = resolveBackUrl();
  const notificationUrl = resolveNotificationUrl();
  const usedLocalFallback = backUrl.includes('mercadopago.com');

  const body = {
    reason: planLabel(plan, billingInterval),
    external_reference: ref,
    payer_email: payerEmail,
    auto_recurring: autoRecurringFor(billingInterval, amount, currency),
    back_url: backUrl,
    status: 'pending',
  };
  if (notificationUrl) body.notification_url = notificationUrl;

  if (usedLocalFallback) {
    console.warn(
      '[mp] back_url pública no configurada (APP_URL es localhost). ' +
        'Usando fallback; tras pagar vuelve a /billing y pulsa «Sincronizar pago». ' +
        'Para retorno automático define MP_BACK_URL=https://tu-dominio.com/billing'
    );
  }

  console.log('[mp] createPreapproval →', { plan, interval: billingInterval, amount, backUrl, notificationUrl });

  const res = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const cause = Array.isArray(data.cause)
      ? data.cause.map((c) => c.description || c.code).filter(Boolean).join('; ')
      : '';
    const msg =
      cause || data.message || data.error || `Mercado Pago error ${res.status}`;
    console.error('[mp] createPreapproval failed:', res.status, JSON.stringify(data));
    const err = new Error(msg);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return {
    ...data,
    mock: false,
    amount,
    interval: billingInterval,
    backUrl,
    localReturn: usedLocalFallback,
  };
}

async function getPreapproval(id) {
  if (!hasMpConfig() || String(id).startsWith('mock_')) {
    // En producción nunca se inventa una suscripción autorizada
    if (!mockAllowed()) throw mockDisabledError();
    return { id, status: 'authorized' };
  }
  const res = await fetch(`${MP_API}/preapproval/${id}`, {
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'No se pudo leer preapproval');
    err.status = res.status;
    throw err;
  }
  return data;
}

function mapMpStatusToBilling(mpStatus) {
  const s = String(mpStatus || '').toLowerCase();
  if (s === 'authorized') return 'active';
  if (s === 'pending') return null;
  if (s === 'paused') return 'past_due';
  if (s === 'cancelled' || s === 'canceled') return 'suspended';
  return null;
}

async function cancelPreapproval(id) {
  if (!id) return { id: null, status: 'cancelled', mock: true };
  if (!hasMpConfig() || String(id).startsWith('mock_')) {
    return { id, status: 'cancelled', mock: true };
  }
  const res = await fetch(`${MP_API}/preapproval/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'No se pudo cancelar la suscripción en Mercado Pago');
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = {
  PLANS,
  hasMpConfig,
  isMpSandbox,
  planPrice,
  planLabel,
  planAiQuota,
  formatAiQuota,
  listPlans,
  createPreapproval,
  getPreapproval,
  cancelPreapproval,
  mapMpStatusToBilling,
};
