/**
 * Licencia de esta computadora (versión instalable).
 *
 * - La primera vez se activa en línea con el código de licencia: la nube la liga a la huella de este equipo y
 *   regresa una licencia firmada que se guarda en APP_DATA_DIR/license.json.
 * - Después se valida sin internet: firma correcta (clave pública dentro de la app) y misma computadora.
 * - Fuera del escritorio (desarrollo y pruebas, DESKTOP != 1) no se exige licencia.
 */
const fs = require('fs');
const path = require('path');
const core = require('./desktop-license.core');

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '..', 'config', 'license-public.pem'), 'utf8');
const CLOUD_URL = process.env.LICENSE_SERVER_URL || 'https://api.mitiendita.software/desktop/activate';

const enforced = () => process.env.DESKTOP === '1';
const dataDir = () => process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data', 'local');
const licenseFile = () => path.join(dataDir(), 'license.json');
function httpErr(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** Lo que reportó Rust al arrancar (DESKTOP_DEVICE_INFO). */
function deviceInfo() {
  try {
    return JSON.parse(process.env.DESKTOP_DEVICE_INFO || '{}');
  } catch {
    return {};
  }
}

let cached = null;
/**
 * { status: 'ok' | 'none' | 'invalid' | 'other_device', license? }
 * none = aún no se activa; invalid = archivo dañado o alterado; other_device = es de otra computadora.
 */
function state() {
  if (!enforced()) return { status: 'ok', license: null };
  if (cached) return cached;
  let envelope = null;
  try {
    envelope = JSON.parse(fs.readFileSync(licenseFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return (cached = { status: 'none', license: null });
    return (cached = { status: 'invalid', license: null });
  }
  const license = core.verifyEnvelope(envelope, PUBLIC_KEY);
  if (!license) return (cached = { status: 'invalid', license: null });
  const here = core.fingerprintFrom(deviceInfo());
  if (!core.deviceMatches(license.fingerprint, here)) return (cached = { status: 'other_device', license });
  return (cached = { status: 'ok', license });
}

/** Escritura atómica: archivo temporal, sincronizado y renombrado. */
function saveEnvelope(envelope) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${licenseFile()}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(envelope));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, licenseFile());
  cached = null;
}

/** Activa (o reactiva en la misma computadora) contra el servidor de licencias. */
async function activateOnline({ code, email, ownerName, businessName }) {
  const normalized = core.normalizeCode(code);
  if (!normalized) throw httpErr(400, 'LICENSE_CODE_INVALID', 'Revisa el código de licencia: son 20 letras y números (XXXX-XXXX-XXXX-XXXX-XXXX).');
  const device = deviceInfo();
  if (!core.fingerprintUsable(core.fingerprintFrom(device))) {
    throw httpErr(422, 'DEVICE_UNREADABLE', 'No pudimos identificar esta computadora. Contacta a soporte para activarla.');
  }
  let res;
  try {
    res = await fetch(CLOUD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ code: normalized, email, ownerName, businessName, device, appVersion: process.env.APP_VERSION || '' }),
    });
  } catch {
    throw httpErr(503, 'OFFLINE', 'Para activar Mi Tiendita la primera vez necesitas internet. Conéctate y vuelve a intentarlo.');
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* respuesta vacía */
  }
  if (!res.ok) throw httpErr(res.status >= 500 ? 502 : res.status, body.code || 'ACTIVATION_FAILED', body.message || 'No se pudo activar la licencia. Intenta de nuevo.');
  const license = core.verifyEnvelope(body.envelope, PUBLIC_KEY);
  if (!license) throw httpErr(502, 'LICENSE_SIGNATURE', 'La licencia recibida no es válida. Intenta de nuevo o contacta a soporte.');
  if (!core.deviceMatches(license.fingerprint, core.fingerprintFrom(device))) {
    throw httpErr(409, 'LICENSE_DEVICE_MISMATCH', 'Esta licencia ya está activada en otra computadora. Contacta a soporte para transferirla.');
  }
  saveEnvelope(body.envelope);
  return license;
}

/** Para la interfaz: estado sin datos sensibles. */
function publicState() {
  const s = state();
  return {
    required: enforced(),
    status: s.status,
    owner: s.license?.owner || null,
    activatedAt: s.license?.issuedAt || null,
  };
}

module.exports = { state, publicState, activateOnline, enforced, _reset: () => (cached = null) };
