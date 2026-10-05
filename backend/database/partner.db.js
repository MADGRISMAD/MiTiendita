/**
 * Datos del portal de socios: sus cuentas (users con partnerId), notas de seguimiento por tienda
 * y a quién del equipo del socio le toca cada tienda.
 */
const { ObjectId } = require('mongodb');
const mongo = require('./mongodb');
const { PARTNER_ROLES } = require('../models/tenant.model');

const oid = (id) => (ObjectId.isValid(String(id)) && String(new ObjectId(String(id))) === String(id) ? new ObjectId(String(id)) : null);

async function col(name) {
  await mongo.ensureConnection();
  return mongo.getCollection(name);
}

function publicUser(u) {
  return {
    id: String(u._id),
    name: u.name || '',
    lastName: u.lastName || '',
    username: u.username || '',
    email: u.email || '',
    cellphone: u.cellphone || '',
    role: u.role,
    disabled: Boolean(u.disabled),
    lastLoginAt: u.lastLoginAt || null,
    mfaEnabled: Boolean(u.mfaEnabled),
    createdAt: u.createdAt || null,
  };
}

// ───────── Cuentas del socio ─────────
async function ListPartnerUsers(partnerId) {
  const rows = await (await col('users'))
    .find({ partnerId: String(partnerId), role: { $in: PARTNER_ROLES } })
    .project({ password: 0, resetToken: 0, mfaSecretEnc: 0, mfaPendingEnc: 0, mfaRecovery: 0 })
    .sort({ createdAt: 1 })
    .toArray();
  return rows.map(publicUser);
}
async function FindPartnerUser(id, partnerId) {
  const o = oid(id);
  if (!o) return null;
  return (await col('users')).findOne({ _id: o, partnerId: String(partnerId), role: { $in: PARTNER_ROLES } });
}
async function FindPartnerUserByUsername(username, partnerId) {
  return (await col('users')).findOne({ username: String(username), partnerId: String(partnerId), role: { $in: PARTNER_ROLES } });
}
async function CountActivePartnerAdmins(partnerId) {
  return (await col('users')).countDocuments({ partnerId: String(partnerId), role: 'partner_admin', disabled: { $ne: true } });
}

// ───────── Tiendas del socio ─────────
async function GetPartnerTenant(tenantId, partnerId) {
  const o = oid(tenantId);
  if (!o) return null;
  const t = await (await col('tenants')).findOne({ _id: o, referrerId: String(partnerId) });
  return t ? { ...t, id: String(t._id) } : null;
}
async function SetTenantAssignee(tenantId, partnerId, username) {
  const o = oid(tenantId);
  if (!o) return false;
  const r = await (await col('tenants')).updateOne(
    { _id: o, referrerId: String(partnerId) },
    { $set: { partnerAssignee: username || null, updatedAt: new Date() } }
  );
  return r.matchedCount === 1;
}
/** Cuando alguien sale del equipo, sus tiendas quedan sin responsable. */
async function ClearAssignee(partnerId, username) {
  await (await col('tenants')).updateMany(
    { referrerId: String(partnerId), partnerAssignee: String(username) },
    { $set: { partnerAssignee: null } }
  );
}

// ───────── Notas de seguimiento ─────────
async function ListNotes(partnerId, tenantId, limit = 100) {
  const rows = await (await col('partner_notes'))
    .find({ partnerId: String(partnerId), tenantId: String(tenantId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => ({ id: String(r._id), text: r.text, author: r.author, authorName: r.authorName || r.author, createdAt: r.createdAt }));
}
async function CreateNote(doc) {
  const r = await (await col('partner_notes')).insertOne(doc);
  return { id: String(r.insertedId), text: doc.text, author: doc.author, authorName: doc.authorName, createdAt: doc.createdAt };
}
async function LastNotes(partnerId) {
  const rows = await (await col('partner_notes'))
    .aggregate([
      { $match: { partnerId: String(partnerId) } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$tenantId', at: { $first: '$createdAt' } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.at]));
}

module.exports = {
  ListPartnerUsers,
  FindPartnerUser,
  FindPartnerUserByUsername,
  CountActivePartnerAdmins,
  GetPartnerTenant,
  SetTenantAssignee,
  ClearAssignee,
  ListNotes,
  CreateNote,
  LastNotes,
};
