/**
 * Núcleo de las licencias de Mi Tiendita de escritorio. Es el MISMO archivo en el servidor (rama main)
 * y en la versión instalable: si cambias algo aquí, cópialo a la otra rama.
 *
 * - Códigos de licencia: 20 caracteres Crockford Base32 (100 bits), «XXXX-XXXX-XXXX-XXXX-XXXX».
 * - Huella del equipo: varias señales de hardware, cada una con su hash. Coincide si al menos 2 señales
 *   coinciden y una de ellas es el UUID de hardware o el número de serie (cambiar la tarjeta de red no bloquea).
 * - Licencia: sobre firmado con Ed25519 {payload, signature} en base64url; se verifican los bytes exactos.
 */
const crypto = require('crypto');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 20;
const PRODUCT = 'mitiendita-desktop';
const FINGERPRINT_RULE = 1;

// ───────── Códigos ─────────
function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31]; // 5 bits por carácter, sin sesgo (32 divide 256)
  return formatCode(out);
}
/** Mayúsculas, sin guiones ni espacios; O→0 e I/L→1 como en Crockford. null si no es un código válido. */
function normalizeCode(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}
const formatCode = (n) => n.match(/.{1,4}/g).join('-');
const hashCode = (normalized) => crypto.createHash('sha256').update(`mt-license-code:${normalized}`).digest('hex');

// ───────── Huella del equipo ─────────
const GENERIC = /^(0+|f+|none|null|unknown|default( string)?|to be filled( by o\.?e\.?m\.?)?|system serial number|not (specified|applicable)|n\/?a|chassis serial number|base board serial number|123456789|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i;
function cleanId(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s.length < 4 || s.length > 200 || GENERIC.test(s)) return null;
  return s;
}
function cleanMac(v) {
  const hex = String(v || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12 || /^0+$/.test(hex) || /^f+$/.test(hex)) return null;
  if (parseInt(hex.slice(0, 2), 16) & 2) return null; // dirección administrada localmente (aleatoria/virtual)
  return hex.match(/.{2}/g).join(':');
}
const hashPart = (kind, value) => crypto.createHash('sha256').update(`mt-fp:v${FINGERPRINT_RULE}:${kind}:${value}`).digest('hex');

/**
 * Huella a partir de lo que reporta el equipo:
 * { uuid, serial, machineGuid, macs: [], hostname, model, cpu, os, osVersion, platform }
 */
function fingerprintFrom(info = {}) {
  const fp = { rule: FINGERPRINT_RULE };
  const uuid = cleanId(info.uuid);
  const serial = cleanId(info.serial);
  const guid = cleanId(info.machineGuid);
  if (uuid) fp.uuid = hashPart('uuid', uuid);
  if (serial) fp.serial = hashPart('serial', serial);
  if (guid) fp.guid = hashPart('guid', guid);
  const macs = [...new Set((Array.isArray(info.macs) ? info.macs : []).slice(0, 16).map(cleanMac).filter(Boolean))].sort();
  if (macs.length) fp.macs = macs.map((m) => hashPart('mac', m));
  return fp;
}
/** Id corto de la huella completa (para mostrar y comparar en el panel). */
function fingerprintId(fp) {
  const parts = ['uuid', 'serial', 'guid'].map((k) => `${k}=${fp[k] || ''}`).concat(`macs=${(fp.macs || []).join(',')}`);
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}
/** ¿La huella actual es del mismo equipo que la registrada al activar? */
function deviceMatches(base = {}, current = {}) {
  let matches = 0;
  let strong = false;
  for (const k of ['uuid', 'serial']) {
    if (base[k] && current[k] && base[k] === current[k]) {
      matches++;
      strong = true;
    }
  }
  if (base.guid && current.guid && base.guid === current.guid) matches++;
  if ((base.macs || []).some((m) => (current.macs || []).includes(m))) matches++;
  return strong && matches >= 2;
}
/** ¿La huella tiene señales suficientes para poder reconocer el equipo después? */
function fingerprintUsable(fp = {}) {
  const strong = ['uuid', 'serial'].filter((k) => fp[k]).length;
  const others = (fp.guid ? 1 : 0) + (fp.macs?.length ? 1 : 0);
  return strong >= 1 && strong + others >= 2;
}
/** Lo que el dueño ve en el panel (en claro). Los identificadores de hardware solo viajan como hash. */
function publicDevice(info = {}) {
  const str = (v, n = 120) => String(v || '').trim().slice(0, n) || null;
  return {
    hostname: str(info.hostname, 80),
    model: str(info.model),
    cpu: str(info.cpu),
    os: str(info.os, 80),
    osVersion: str(info.osVersion, 40),
    platform: str(info.platform, 20),
    macs: [...new Set((Array.isArray(info.macs) ? info.macs : []).slice(0, 16).map(cleanMac).filter(Boolean))].sort(),
  };
}

// ───────── Firma ─────────
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function signEnvelope(payload, privateKeyPem) {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.sign(null, bytes, crypto.createPrivateKey(privateKeyPem));
  return { payload: b64u(bytes), signature: b64u(signature) };
}
/** Verifica la firma de los bytes recibidos y devuelve el contenido, o null si no es válida. */
function verifyEnvelope(envelope, publicKeyPem) {
  try {
    if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') return null;
    const bytes = Buffer.from(envelope.payload, 'base64url');
    const ok = crypto.verify(null, bytes, crypto.createPublicKey(publicKeyPem), Buffer.from(envelope.signature, 'base64url'));
    if (!ok) return null;
    const payload = JSON.parse(bytes.toString('utf8'));
    if (payload?.product !== PRODUCT || payload?.v !== 1 || !payload?.licenseId || !payload?.fingerprint) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  PRODUCT,
  FINGERPRINT_RULE,
  generateCode,
  normalizeCode,
  formatCode,
  hashCode,
  fingerprintFrom,
  fingerprintId,
  fingerprintUsable,
  deviceMatches,
  publicDevice,
  signEnvelope,
  verifyEnvelope,
};
