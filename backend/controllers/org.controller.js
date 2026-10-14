const crypto = require('crypto');
const db = require('../database/mongodb');
const orgDb = require('../database/org.db');
const org = require('../services/org.service');
const sessions = require('../services/session.service');
const hasher = require('../utils/bcrypt.utils');
const { createTenantDoc } = require('../models/tenant.model');
const masterCatalog = require('../services/master-catalog.service');
const { storeDayRange } = require('../utils/store-time');

/** Ajustes que una sucursal hereda de la matriz (lo demás —dirección, datos fiscales, terminal— es propio). */
const INHERITED_SETTINGS = [
  'businessType', 'phone', 'logoUrl', 'primaryColor', 'accentColor', 'timezone', 'inventoryEnabled',
  'allowNegativeStock', 'costMethod', 'taxRate', 'cardFeeEnabled', 'cardFeePercent', 'scaleBarcodeMode',
];

/** Acceso a datos de producción para services/org.service.js. */
const store = {
  getRawTenant: orgDb.getRawTenant,
  getEffectiveTenant: (id) => db.GetTenantById(String(id)),
  updateRawTenant: orgDb.updateRawTenant,
  deleteRawTenant: orgDb.deleteRawTenant,
  getOrgByOwner: orgDb.getOrgByOwner,
  createOrg: orgDb.createOrg,
  updateOrg: orgDb.updateOrg,
  deleteOrg: orgDb.deleteOrg,
  listOrgTenants: orgDb.listOrgTenants,
  getUser: orgDb.getUserByUsername,
  oldestActiveAdmin: orgDb.oldestActiveAdmin,
  findLinkedUser: orgDb.findLinkedUser,
  deleteUser: orgDb.deleteUser,
  async createBranchTenant({ name, organizationId, matrixTenantId }) {
    return orgDb.createRawTenant({
      ...createTenantDoc(name),
      isBranch: true,
      organizationId: String(organizationId),
      matrixTenantId: String(matrixTenantId),
      branchSuspendedAt: null,
      promoEligible: false, // la promoción es de quien paga: la matriz
    });
  },
  async createLinkedUser({ tenantId, ownerUsername, branchName }) {
    // Contraseña aleatoria que nadie conoce y sin correo: el login la ignora y no se puede recuperar
    const password = await hasher.hashPassword(crypto.randomBytes(48).toString('base64url'));
    let username = `sucursal-${String(tenantId).slice(-8)}`;
    if (await orgDb.getUserByUsername(username)) username += `-${crypto.randomBytes(2).toString('hex')}`;
    return orgDb.createUser({
      name: 'Sucursal',
      lastName: branchName,
      username,
      password,
      role: 'admin',
      tenantId: String(tenantId),
      linkedOwner: ownerUsername,
      createdAt: new Date(),
    });
  },
  async seedBranch({ matrixTenantId, branchTenantId, name }) {
    const from = (await db.GetSettings(String(matrixTenantId))) || {};
    const inherited = Object.fromEntries(INHERITED_SETTINGS.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
    const now = new Date();
    const settings = await db.CreateSettings({
      ...inherited,
      tenantId: String(branchTenantId),
      businessName: name,
      address: '',
      initialTables: 0,
      setupCompleted: true,
      createdAt: now,
      updatedAt: now,
    });
    // Catálogo maestro si el giro lo usa (igual que una tienda nueva al terminar su asistente)
    await masterCatalog.syncForGiro(db, String(branchTenantId), settings).catch((e) => console.warn('[sucursales] catálogo maestro:', e.message));
  },
  log: (tenantId, entry) => db.CreateActivityLog({ tenantId: String(tenantId), createdAt: new Date(), ...entry }).catch(() => {}),
  salesByTenant: orgDb.salesByTenant,
  async dailySales(ids, from, to) {
    // La zona horaria de la matriz: es la del dueño y evita partir un día entre sucursales
    const tz = (await db.GetSettings(String(ids[0])))?.timezone;
    return orgDb.dailySales(ids, from, to, tz);
  },
  balanceByTenant: orgDb.balanceByTenant,
};

const principalOf = (req) => ({ username: req.user?.username, role: req.user?.role, tenantId: req.tenantId, linkedOwner: req.user?.linkedOwner || null });
const fail = (res, err) => {
  if (!err.status) console.error(err);
  return res.status(err.status || 500).json({ message: err.message || 'Error en sucursales', code: err.code });
};

async function overview(req, res) {
  try {
    return res.status(200).json(await org.overview(store, principalOf(req)));
  } catch (err) {
    return fail(res, err);
  }
}
async function rename(req, res) {
  try {
    return res.status(200).json({ organization: await org.rename(store, principalOf(req), req.body?.name) });
  } catch (err) {
    return fail(res, err);
  }
}
async function createBranch(req, res) {
  try {
    const r = await org.createBranch(store, principalOf(req), { name: req.body?.name });
    return res.status(201).json({ ...r, overview: await org.overview(store, principalOf(req)) });
  } catch (err) {
    return fail(res, err);
  }
}
async function suspend(req, res) {
  try {
    await org.setSuspended(store, principalOf(req), req.params.id, true);
    return res.status(200).json(await org.overview(store, principalOf(req)));
  } catch (err) {
    return fail(res, err);
  }
}
async function reactivate(req, res) {
  try {
    await org.setSuspended(store, principalOf(req), req.params.id, false);
    return res.status(200).json(await org.overview(store, principalOf(req)));
  } catch (err) {
    return fail(res, err);
  }
}
/** Abre una sesión nueva como la cuenta de la sucursal elegida (la respuesta es la misma que la del login). */
async function switchTo(req, res) {
  try {
    const { user } = await org.switchTarget(store, principalOf(req), req.body?.branchId);
    const session = await sessions.startSession(req, res, user);
    return res.status(200).json(session);
  } catch (err) {
    return fail(res, err);
  }
}
/** Un día «AAAA-MM-DD» se toma en la zona horaria de la matriz (00:00 a 23:59:59); una fecha con hora, tal cual. */
async function rangeOf(req) {
  const found = await org.resolveOrg(store, principalOf(req));
  if (!found) throw org.errNotOwner();
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const { from, to } = req.query;
  if (!day.test(String(from)) && !day.test(String(to))) return { from, to };
  const tz = (await db.GetSettings(String(found.org.matrixTenantId)))?.timezone;
  return {
    from: day.test(String(from)) ? storeDayRange(from, tz).from : from,
    to: day.test(String(to)) ? storeDayRange(to, tz).to : to,
  };
}

async function summary(req, res) {
  try {
    return res.status(200).json(await org.consolidatedSummary(store, principalOf(req), await rangeOf(req)));
  } catch (err) {
    return fail(res, err);
  }
}
async function summaryCsv(req, res) {
  try {
    const data = await org.consolidatedSummary(store, principalOf(req), await rangeOf(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sucursales.csv"');
    return res.status(200).send(org.toCsv(data));
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = { store, overview, rename, createBranch, suspend, reactivate, switchTo, summary, summaryCsv };
