const licenses = require('../services/desktop-license.service');
const audit = require('../services/platform-audit.service');

function fail(res, err, fallback) {
  if (err.status) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error('[licencias]', err);
  return res.status(500).json({ code: 'ERROR', message: fallback });
}

/** Pública: la app instalable se activa (una vez, con internet). */
async function activate(req, res) {
  try {
    const out = await licenses.activate(req.body || {}, { ip: req.ip });
    if (!out.reused) {
      await audit.record(req, { type: 'desktop_license_activated', message: `Licencia de escritorio activada (${req.body?.businessName || 'sin nombre'})`, meta: { licenseId: out.licenseId } });
    }
    return res.status(200).json({ envelope: out.envelope });
  } catch (err) {
    if (err.code === 'LICENSE_DEVICE_MISMATCH') {
      await audit.record(req, { type: 'desktop_license_conflict', message: 'Intento de activar una licencia de escritorio en otra computadora', meta: {} });
    }
    return fail(res, err, 'No se pudo activar la licencia.');
  }
}

// ── Panel de plataforma ──
async function list(req, res) {
  try {
    return res.json(await licenses.list({ status: req.query.status, q: req.query.q }));
  } catch (err) {
    return fail(res, err, 'No se pudieron cargar las licencias.');
  }
}
async function detail(req, res) {
  try {
    const d = await licenses.detail(req.params.id);
    return d ? res.json(d) : res.status(404).json({ code: 'NOT_FOUND', message: 'Licencia no encontrada.' });
  } catch (err) {
    return fail(res, err, 'No se pudo cargar la licencia.');
  }
}
async function create(req, res) {
  try {
    const out = await licenses.create(req.body || {}, req.user?.username || '');
    await audit.record(req, { type: 'desktop_license_created', message: `Licencia de escritorio generada para ${out.license.businessName || out.license.ownerName || out.license.email || 'un cliente'} (…${out.license.codeSuffix})`, meta: { licenseId: out.license.id } });
    return res.status(201).json(out);
  } catch (err) {
    return fail(res, err, 'No se pudo generar la licencia.');
  }
}
async function release(req, res) {
  try {
    const out = await licenses.release(req.params.id, req.body?.reason, req.user?.username || '');
    await audit.record(req, { type: 'desktop_license_released', message: `Licencia de escritorio liberada para cambio de computadora (…${out.license.codeSuffix}): ${req.body?.reason}`, meta: { licenseId: out.license.id } });
    return res.json(out);
  } catch (err) {
    return fail(res, err, 'No se pudo liberar la licencia.');
  }
}
async function revoke(req, res) {
  try {
    const out = await licenses.revoke(req.params.id, req.body?.reason, req.user?.username || '');
    await audit.record(req, { type: 'desktop_license_revoked', message: `Licencia de escritorio revocada (…${out.codeSuffix}): ${req.body?.reason}`, meta: { licenseId: out.id } });
    return res.json(out);
  } catch (err) {
    return fail(res, err, 'No se pudo revocar la licencia.');
  }
}

module.exports = { activate, list, detail, create, release, revoke };
