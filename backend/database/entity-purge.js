/**
 * Borrado de una tienda o de un vendedor. Recibe `col(nombre)` (la colección de Mongo) para poder probarse con una base falsa.
 *
 * Se conserva a propósito el historial del dinero: los cobros (`billing_events`), las comisiones y las liquidaciones, y la bitácora de
 * la plataforma. Así Finanzas y las comisiones ya pagadas no cambian; la tienda o el vendedor borrado sale ahí como «eliminado».
 */
const { ObjectId } = require('mongodb');

/** Colecciones cuyos documentos llevan `tenantId` y se borran junto con la tienda. */
const TENANT_COLLECTIONS = [
  'foods', 'orders', 'lots', 'menus', 'suppliers', 'invites', 'customers', 'cash_sessions', 'waiters', 'print_jobs',
  'print_stations', 'purchases', 'cost_history', 'activity_log', 'exchanges', 'mesas', 'credit_entries', 'point_charges',
  'stocktakes', 'partner_notes', 'support_mail', 'ai_usage', 'settings', 'users',
];

/** Los ids se guardaron como texto en unas colecciones y como ObjectId en otras. */
const idVariants = (id) => (ObjectId.isValid(String(id)) ? [String(id), new ObjectId(String(id))] : [String(id)]);

/** Borra todo lo de una tienda y la tienda misma. Devuelve cuántos documentos se quitaron de cada colección. */
async function purgeTenant(col, tenantId) {
  const removed = {};
  const ids = idVariants(tenantId);
  for (const name of TENANT_COLLECTIONS) {
    const res = await col(name).deleteMany({ tenantId: { $in: ids } });
    if (res.deletedCount) removed[name] = res.deletedCount;
  }
  const tenant = await col('tenants').deleteOne({ _id: new ObjectId(String(tenantId)) });
  if (tenant.deletedCount) removed.tenants = tenant.deletedCount;
  return removed;
}

/**
 * Borra a un vendedor: su registro, las cuentas con las que entraba al portal y sus notas. Las tiendas que llegaron con su código
 * se quedan sin vendedor. Sus comisiones y liquidaciones se conservan (historial del dinero).
 */
async function purgeReferrer(col, referrerId) {
  const id = String(referrerId);
  const removed = {};
  const users = await col('users').deleteMany({ partnerId: { $in: idVariants(id) } });
  if (users.deletedCount) removed.users = users.deletedCount;
  const notes = await col('partner_notes').deleteMany({ partnerId: { $in: idVariants(id) } });
  if (notes.deletedCount) removed.partner_notes = notes.deletedCount;
  const tenants = await col('tenants').updateMany({ referrerId: id }, { $unset: { referrerId: '', referralCode: '', partnerAssignee: '' } });
  if (tenants.modifiedCount) removed.tenants_sin_vendedor = tenants.modifiedCount;
  const referrer = await col('referrers').deleteOne({ _id: new ObjectId(id) });
  if (referrer.deletedCount) removed.referrers = referrer.deletedCount;
  return removed;
}

module.exports = { TENANT_COLLECTIONS, purgeTenant, purgeReferrer };
