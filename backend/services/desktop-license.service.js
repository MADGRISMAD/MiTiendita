/**
 * Licencias de Mi Tiendita de escritorio (versión permanente instalable).
 *
 * - El equipo de plataforma genera un código por cliente; se muestra completo UNA vez y se guarda solo su hash.
 * - La app instalable lo activa una sola vez con internet: queda ligado a la huella de esa computadora y recibe
 *   una licencia firmada (Ed25519) que después valida sin internet.
 * - Reintentar desde la misma computadora devuelve la misma licencia. Otra computadora recibe un rechazo y el
 *   intento queda registrado para verlo en el panel.
 * - Liberar (cambio de computadora) genera un código nuevo e invalida el anterior; revocar la da de baja.
 */
const core = require('./desktop-license.core');
const db = require('../database/mongodb');

const KID = 'v1';
const STATUSES = ['issued', 'active', 'released', 'revoked'];

function httpErr(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
const licenses = () => db.getCollection('desktop_licenses');
const attempts = () => db.getCollection('desktop_license_attempts');

let indexes = null;
function ensureIndexes() {
  if (!indexes) {
    indexes = Promise.all([
      licenses().createIndex({ codeHash: 1 }, { unique: true, name: 'codeHash_unique' }),
      licenses().createIndex({ status: 1, createdAt: -1 }),
      attempts().createIndex({ licenseId: 1, at: -1 }),
      attempts().createIndex({ at: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }),
    ]).catch((err) => {
      indexes = null;
      throw err;
    });
  }
  return indexes;
}

function privateKey() {
  const raw = String(process.env.DESKTOP_LICENSE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!raw.includes('PRIVATE KEY')) throw httpErr(503, 'LICENSE_SERVER_NOT_READY', 'El servidor de licencias no está configurado.');
  return raw;
}

const clip = (v, n) => String(v || '').trim().slice(0, n);
const email = (v) => clip(v, 200).toLowerCase();

/** Lo que ve el panel (sin hash del código ni licencia firmada). */
function view(doc) {
  if (!doc) return null;
  const a = doc.activation || null;
  return {
    id: String(doc._id),
    status: doc.status,
    codeSuffix: doc.codeSuffix,
    ownerName: doc.ownerName || '',
    email: doc.email || '',
    businessName: doc.businessName || '',
    note: doc.note || '',
    generation: doc.generation || 1,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || '',
    activatedAt: a?.at || null,
    activation: a
      ? {
          at: a.at,
          ip: a.ip || null,
          appVersion: a.appVersion || null,
          fingerprintId: a.fingerprintId,
          signals: a.signals || [],
          device: a.device || {},
          owner: a.owner || {},
        }
      : null,
    history: doc.history || [],
    revokedAt: doc.revokedAt || null,
    revokedReason: doc.revokedReason || '',
  };
}

const signalsOf = (fp) => ['uuid', 'serial', 'guid', 'macs'].filter((k) => (k === 'macs' ? fp.macs?.length : fp[k]));

async function create({ ownerName, email: mail, businessName, note } = {}, actor = '') {
  await ensureIndexes();
  const code = core.generateCode();
  const normalized = core.normalizeCode(code);
  const doc = {
    codeHash: core.hashCode(normalized),
    codeSuffix: normalized.slice(-4),
    status: 'issued',
    generation: 1,
    ownerName: clip(ownerName, 120),
    email: email(mail),
    businessName: clip(businessName, 160),
    note: clip(note, 300),
    createdAt: new Date(),
    createdBy: actor,
    activation: null,
    history: [],
  };
  const { insertedId } = await licenses().insertOne(doc);
  return { license: view({ ...doc, _id: insertedId }), code };
}

async function list({ status, q } = {}) {
  const filter = {};
  if (STATUSES.includes(status)) filter.status = status;
  let docs = await licenses().find(filter).sort({ createdAt: -1 }).limit(500).toArray();
  const term = String(q || '').trim().toLowerCase();
  if (term) {
    docs = docs.filter((d) =>
      [d.ownerName, d.email, d.businessName, d.codeSuffix, d.activation?.device?.hostname, ...(d.activation?.device?.macs || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }
  return docs.map(view);
}

async function detail(id) {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(String(id))) return null;
  const doc = await licenses().findOne({ _id: new ObjectId(String(id)) });
  if (!doc) return null;
  const tries = await attempts().find({ licenseId: String(doc._id) }).sort({ at: -1 }).limit(50).toArray();
  return { ...view(doc), attempts: tries.map((t) => ({ at: t.at, result: t.result, ip: t.ip, device: t.device, fingerprintId: t.fingerprintId })) };
}

async function logAttempt(entry) {
  try {
    await attempts().insertOne({ ...entry, at: new Date() });
  } catch (err) {
    console.warn('[licencias] no se pudo guardar el intento:', err.message);
  }
}

/**
 * Activación desde la app instalable.
 * body: { code, email, ownerName, businessName, device, appVersion }
 */
async function activate(body = {}, { ip } = {}) {
  await ensureIndexes();
  const normalized = core.normalizeCode(body.code);
  const device = body.device && typeof body.device === 'object' ? body.device : {};
  const fp = core.fingerprintFrom(device);
  const fpId = core.fingerprintId(fp);
  const shown = core.publicDevice(device);
  const unavailable = () => httpErr(404, 'LICENSE_UNAVAILABLE', 'Ese código de licencia no es válido o ya no está disponible. Revísalo o contacta a soporte.');
  if (!normalized) throw httpErr(400, 'LICENSE_CODE_INVALID', 'El código de licencia no tiene el formato correcto (XXXX-XXXX-XXXX-XXXX-XXXX).');
  if (!core.fingerprintUsable(fp)) {
    await logAttempt({ licenseId: null, result: 'device_unreadable', ip, device: shown, fingerprintId: fpId });
    throw httpErr(422, 'DEVICE_UNREADABLE', 'No pudimos identificar esta computadora. Contacta a soporte para activarla.');
  }

  for (let round = 0; round < 2; round++) {
    const lic = await licenses().findOne({ codeHash: core.hashCode(normalized) });
    if (!lic || lic.status === 'revoked' || lic.status === 'released') {
      await logAttempt({ licenseId: lic ? String(lic._id) : null, result: lic ? `rejected_${lic.status}` : 'unknown_code', ip, device: shown, fingerprintId: fpId });
      throw unavailable();
    }
    if (lic.email && email(body.email) !== lic.email) {
      await logAttempt({ licenseId: String(lic._id), result: 'email_mismatch', ip, device: shown, fingerprintId: fpId });
      throw unavailable();
    }
    if (lic.status === 'active') {
      if (core.deviceMatches(lic.activation.fingerprint, fp)) {
        await logAttempt({ licenseId: String(lic._id), result: 'reactivated_same_device', ip, device: shown, fingerprintId: fpId });
        return { envelope: lic.activation.envelope, licenseId: String(lic._id), reused: true };
      }
      await logAttempt({ licenseId: String(lic._id), result: 'other_device', ip, device: shown, fingerprintId: fpId });
      throw httpErr(409, 'LICENSE_DEVICE_MISMATCH', 'Esta licencia ya está activada en otra computadora. Contacta a soporte para transferirla.');
    }
    // status === 'issued': se reclama de forma atómica (si dos equipos compiten, solo uno gana)
    const now = new Date();
    const owner = { name: clip(body.ownerName, 120), email: email(body.email), businessName: clip(body.businessName, 160) };
    const payload = {
      v: 1,
      kid: KID,
      product: core.PRODUCT,
      licenseId: String(lic._id),
      activationId: require('crypto').randomUUID(),
      generation: lic.generation || 1,
      entitlement: 'perpetual',
      maxDevices: 1,
      owner,
      fingerprint: fp,
      issuedAt: now.toISOString(),
    };
    const envelope = core.signEnvelope(payload, privateKey());
    const r = await licenses().updateOne(
      { _id: lic._id, status: 'issued', generation: lic.generation || 1 },
      {
        $set: {
          status: 'active',
          activation: { at: now, ip: ip || null, appVersion: clip(body.appVersion, 40), fingerprint: fp, fingerprintId: fpId, signals: signalsOf(fp), device: shown, owner, envelope, activationId: payload.activationId },
        },
      }
    );
    if (r.modifiedCount === 1) {
      await logAttempt({ licenseId: String(lic._id), result: 'activated', ip, device: shown, fingerprintId: fpId });
      return { envelope, licenseId: String(lic._id), reused: false };
    }
    // Otro equipo la tomó en este instante: se vuelve a leer y se decide con el estado nuevo
  }
  throw httpErr(409, 'LICENSE_BUSY', 'No se pudo activar en este momento. Intenta de nuevo.');
}

/** Cambio de computadora: invalida el código anterior y da uno nuevo para activar el equipo sustituto. */
async function release(id, reason, actor = '') {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(String(id))) throw httpErr(404, 'NOT_FOUND', 'Licencia no encontrada.');
  if (clip(reason, 300).length < 3) throw httpErr(400, 'REASON_REQUIRED', 'Escribe el motivo.');
  const lic = await licenses().findOne({ _id: new ObjectId(String(id)) });
  if (!lic) throw httpErr(404, 'NOT_FOUND', 'Licencia no encontrada.');
  if (lic.status === 'revoked') throw httpErr(409, 'REVOKED', 'La licencia está revocada.');
  const code = core.generateCode();
  const normalized = core.normalizeCode(code);
  let past = null;
  if (lic.activation) {
    // la licencia firmada vieja y la huella completa no se guardan en el historial
    const rest = { ...lic.activation };
    delete rest.envelope;
    delete rest.fingerprint;
    past = { ...rest, releasedAt: new Date(), releasedBy: actor, reason: clip(reason, 300), generation: lic.generation || 1 };
  }
  const r = await licenses().updateOne(
    { _id: lic._id, generation: lic.generation || 1 },
    {
      $set: { status: 'issued', activation: null, codeHash: core.hashCode(normalized), codeSuffix: normalized.slice(-4), generation: (lic.generation || 1) + 1 },
      ...(past ? { $push: { history: past } } : {}),
    }
  );
  if (r.modifiedCount !== 1) throw httpErr(409, 'CHANGED', 'La licencia cambió mientras la liberabas. Vuelve a intentarlo.');
  return { license: view(await licenses().findOne({ _id: lic._id })), code };
}

async function revoke(id, reason, actor = '') {
  const { ObjectId } = require('mongodb');
  if (!ObjectId.isValid(String(id))) throw httpErr(404, 'NOT_FOUND', 'Licencia no encontrada.');
  if (clip(reason, 300).length < 3) throw httpErr(400, 'REASON_REQUIRED', 'Escribe el motivo.');
  const r = await licenses().updateOne(
    { _id: new ObjectId(String(id)), status: { $ne: 'revoked' } },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actor, revokedReason: clip(reason, 300) } }
  );
  if (r.matchedCount !== 1) throw httpErr(404, 'NOT_FOUND', 'Licencia no encontrada o ya revocada.');
  return view(await licenses().findOne({ _id: new ObjectId(String(id)) }));
}

module.exports = { create, list, detail, activate, release, revoke, ensureIndexes, KID };
