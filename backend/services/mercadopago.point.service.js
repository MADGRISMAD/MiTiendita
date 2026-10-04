/**
 * backend/services/mercadopago.point.service.js
 * Conexión de la cuenta MP del NEGOCIO (OAuth), registro de terminal y verificación previa al cobro.
 * Los cobros por monto están en point.charges.service.js.
 *
 * ⚠️ Endpoints de Point/Orders armados con la documentación de Mercado Pago; pruébalos con una
 *    terminal real: /terminals/v1/list, /terminals/v1/setup, /v1/orders.
 */
const crypto = require('crypto');
const db = require('../database/point.db');

const MP_API = 'https://api.mercadopago.com';

/* ───────────── Cifrado de tokens (AES-256-GCM). TOKEN_ENC_KEY = 32 bytes en hex ───────────── */
const KEY = () => {
  const k = Buffer.from(String(process.env.TOKEN_ENC_KEY || ''), 'hex');
  if (k.length !== 32) throw httpError('TOKEN_ENC_KEY inválida (32 bytes en hex).', 500);
  return k;
};
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('hex')).join('.');
}
function decrypt(blob) {
  const [iv, tag, enc] = String(blob).split('.').map((h) => Buffer.from(h, 'hex'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

function httpError(msg, status = 400, code) {
  const e = new Error(msg);
  e.status = status;
  e.code = code;
  return e;
}

/* ───────────── OAuth: conectar la cuenta MP del negocio ───────────── */
const STATE_TTL_MS = 15 * 60 * 1000;
const stateSecret = () => {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw httpError('Falta OAUTH_STATE_SECRET en el servidor.', 500, 'not_configured');
  return s;
};

function requireOAuthConfig() {
  const missing = ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_OAUTH_REDIRECT', 'OAUTH_STATE_SECRET', 'TOKEN_ENC_KEY'].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    throw httpError('La conexión con Mercado Pago no está configurada en el servidor.', 503, 'not_configured');
  }
}

function buildAuthUrl(tenantId) {
  requireOAuthConfig();
  // El nonce lleva la hora de emisión: el enlace de autorización caduca
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
  const sig = crypto.createHmac('sha256', stateSecret()).update(`${tenantId}.${nonce}`).digest('hex');
  const q = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID,
    response_type: 'code',
    platform_id: 'mp',
    state: `${tenantId}.${nonce}.${sig}`,
    redirect_uri: process.env.MP_OAUTH_REDIRECT,
  });
  return `https://auth.mercadopago.com.mx/authorization?${q}`;
}

function parseState(state) {
  const [tenantId, nonce, sig] = String(state || '').split('.');
  const expected = crypto.createHmac('sha256', stateSecret()).update(`${tenantId}.${nonce}`).digest('hex');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw httpError('state inválido', 400);
  }
  const issuedAt = parseInt(String(nonce).slice(0, -12), 36);
  if (!issuedAt || Date.now() - issuedAt > STATE_TTL_MS) throw httpError('El enlace de conexión caducó', 400);
  return tenantId;
}

async function oauthToken(params) {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID,
      client_secret: process.env.MP_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(data.message || 'OAuth Mercado Pago falló', res.status, 'oauth_failed');
  return data;
}

function tokenPatch(data) {
  return {
    'point.accessToken': encrypt(data.access_token),
    'point.refreshToken': encrypt(data.refresh_token),
    'point.mpUserId': String(data.user_id),
    'point.tokenExpiresAt': new Date(Date.now() + (data.expires_in || 15552000) * 1000),
    'point.status': 'connected',
    'point.lastError': null,
    updatedAt: new Date(),
  };
}

async function handleOAuthCallback({ code, state }) {
  const tenantId = parseState(state);
  const data = await oauthToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.MP_OAUTH_REDIRECT,
  });
  await db.UpdateTenant(tenantId, tokenPatch(data));
  return tenantId;
}

/** Token válido del tenant (se renueva solo si le queda menos de 1 día). */
async function getTenantToken(tenantId) {
  const tenant = await db.GetTenantById(tenantId);
  const p = tenant?.point;
  if (!p?.accessToken) throw httpError('Cuenta de Mercado Pago no conectada', 409, 'not_connected');

  const expiresSoon = !p.tokenExpiresAt || new Date(p.tokenExpiresAt).getTime() - Date.now() < 24 * 3600 * 1000;
  if (!expiresSoon) return decrypt(p.accessToken);

  try {
    const data = await oauthToken({ grant_type: 'refresh_token', refresh_token: decrypt(p.refreshToken) });
    await db.UpdateTenant(tenantId, tokenPatch(data));
    return data.access_token;
  } catch {
    await db.UpdateTenant(tenantId, { 'point.status': 'disconnected', 'point.lastError': 'token_revoked' });
    throw httpError('La conexión con Mercado Pago expiró. Reconecta tu cuenta.', 409, 'token_revoked');
  }
}

/** Llamada autenticada a MP con el token del negocio. */
async function mp(tenantId, path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getTenantToken(tenantId);
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    await db.UpdateTenant(tenantId, { 'point.status': 'disconnected', 'point.lastError': 'unauthorized' });
    throw httpError('Mercado Pago rechazó la conexión. Reconecta tu cuenta.', 409, 'token_revoked');
  }
  if (!res.ok) {
    const cause = Array.isArray(data?.errors) ? data.errors.map((e) => e.message || e.code).join('; ') : '';
    throw httpError(cause || data.message || `Mercado Pago error ${res.status}`, res.status, 'mp_error');
  }
  return data;
}

/* ───────────── Terminal ───────────── */
async function listTerminals(tenantId) {
  const data = await mp(tenantId, '/terminals/v1/list?limit=50');
  return data?.data?.terminals || data?.terminals || [];
}

async function registerTerminal(tenantId, terminalId) {
  const terminals = await listTerminals(tenantId);
  const t = terminals.find((x) => x.id === terminalId);
  if (!t) throw httpError('Esa terminal no pertenece a tu cuenta de Mercado Pago', 404, 'terminal_not_found');

  // Modo PDV: la terminal recibe cobros desde el sistema
  await mp(tenantId, '/terminals/v1/setup', {
    method: 'PATCH',
    body: { terminals: [{ id: terminalId, operating_mode: 'PDV' }] },
  });

  await db.UpdateTenant(tenantId, {
    'point.terminalId': terminalId,
    'point.terminalLabel': t.external_pos_id || t.id,
    'point.registeredAt': new Date(),
    'point.status': 'ready',
    'point.lastError': null,
    updatedAt: new Date(),
  });
  return { terminalId };
}

/** ¿Se puede cobrar AHORA? Devuelve { ok, code, message }. */
async function preflight(tenantId) {
  const tenant = await db.GetTenantById(tenantId);
  const p = tenant?.point;
  if (!p?.accessToken) return { ok: false, code: 'not_connected', message: 'Conecta tu cuenta de Mercado Pago para cobrar con terminal.' };
  if (!p.terminalId) return { ok: false, code: 'no_terminal', message: 'Registra tu terminal de Mercado Pago para cobrar con tarjeta.' };

  try {
    const terminals = await listTerminals(tenantId);
    const t = terminals.find((x) => x.id === p.terminalId);
    if (!t) {
      await db.UpdateTenant(tenantId, { 'point.status': 'disconnected', 'point.lastError': 'terminal_missing' });
      return { ok: false, code: 'terminal_missing', message: 'Tu terminal ya no aparece vinculada a tu cuenta. Vuelve a registrarla.' };
    }
    if (t.operating_mode && t.operating_mode !== 'PDV') {
      await mp(tenantId, '/terminals/v1/setup', { method: 'PATCH', body: { terminals: [{ id: p.terminalId, operating_mode: 'PDV' }] } });
    }
    await db.UpdateTenant(tenantId, { 'point.status': 'ready', 'point.lastCheckAt': new Date(), 'point.lastError': null });
    return { ok: true, code: 'ready', message: 'Terminal lista' };
  } catch (err) {
    return { ok: false, code: err.code || 'check_failed', message: err.message };
  }
}

/** Valida la firma x-signature del webhook (clave secreta de Webhooks de tu app de MP). */
function verifyWebhookSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const sig = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const ts = /ts=([^,]+)/.exec(sig)?.[1];
  const v1 = /v1=([^,]+)/.exec(sig)?.[1];
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
  if (!ts || !v1) return false;
  const mine = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return mine.length === v1.length && crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(v1));
}

module.exports = {
  encrypt,
  decrypt,
  parseState,
  mp,
  httpError,
  verifyWebhookSignature,
  buildAuthUrl,
  handleOAuthCallback,
  listTerminals,
  registerTerminal,
  preflight,
};