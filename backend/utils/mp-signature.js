const crypto = require('crypto');

// Ventana para aceptar una notificación (evita que reenvíen una vieja)
const MAX_AGE_MS = 5 * 60 * 1000;

/** «ts=1704908010,v1=618c…» → { ts, v1 } */
function parseSignatureHeader(value) {
  const out = {};
  for (const part of String(value || '').split(',')) {
    const [k, ...rest] = part.split('=');
    if (k && rest.length) out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

/** El id que firma Mercado Pago: el `data.id` del query (en minúsculas si es alfanumérico). */
function signedDataId(query = {}, body = {}) {
  const raw = query['data.id'] ?? query.id ?? body?.data?.id ?? body?.id;
  if (raw == null || raw === '') return '';
  const id = String(raw);
  return /^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id;
}

/**
 * Verifica el header x-signature de un webhook de Mercado Pago.
 * Manifest: «id:<data.id>;request-id:<x-request-id>;ts:<ts>;» (se omite lo que no venga),
 * HMAC-SHA256 con la clave secreta del webhook.
 * @returns {{ ok: boolean, reason?: string }}
 */
function verifyMpSignature({ headers = {}, query = {}, body = {}, secret, now = Date.now() } = {}) {
  if (!secret) return { ok: false, reason: 'MP_WEBHOOK_SECRET no configurado' };
  const header = headers['x-signature'];
  if (!header) return { ok: false, reason: 'sin x-signature' };
  const { ts, v1 } = parseSignatureHeader(header);
  if (!ts || !v1) return { ok: false, reason: 'x-signature incompleto' };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'ts inválido' };
  // MP manda segundos; algunos ejemplos traen milisegundos
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
  if (Math.abs(now - tsMs) > MAX_AGE_MS) return { ok: false, reason: 'ts fuera de la ventana de 5 min' };

  const id = signedDataId(query, body);
  const requestId = headers['x-request-id'];
  let manifest = '';
  if (id) manifest += `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', String(secret)).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(v1).toLowerCase(), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'firma inválida' };
  return { ok: true };
}

module.exports = { verifyMpSignature, parseSignatureHeader, signedDataId, MAX_AGE_MS };
