/**
 * Códigos de un solo uso por tiempo (TOTP, RFC 6238): los de Google Authenticator, Authy, etc.
 * HMAC-SHA1, 6 dígitos, periodo de 30 s.
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

function stepAt(now = Date.now()) {
  return Math.floor(now / 1000 / PERIOD);
}

/**
 * Verifica un código aceptando ±1 periodo (relojes desfasados).
 * Devuelve el periodo usado (para no aceptar el mismo código dos veces) o null.
 * @param {number} [lastStep] último periodo ya usado: no se acepta ese ni anteriores
 */
function verifyTotp(secret, code, { now = Date.now(), window = 1, lastStep = -1 } = {}) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return null;
  const current = stepAt(now);
  for (let d = -window; d <= window; d++) {
    const step = current + d;
    if (step <= lastStep) continue;
    const expected = codeAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

function otpauthUrl({ secret, account, issuer = 'Mi Tiendita' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Códigos de respaldo («ABCD-EFGH»), para entrar si se pierde el celular. */
function generateRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

function hashRecoveryCode(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  return crypto.createHash('sha256').update(`mt-recovery:${clean}`).digest('hex');
}

module.exports = {
  base32Encode,
  base32Decode,
  generateSecret,
  codeAt,
  stepAt,
  verifyTotp,
  otpauthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
};
