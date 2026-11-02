/**
 * Borrado de un vendedor. Recibe `col(nombre)` (la colección de Mongo) para poder probarse con una base falsa.
 *
 * Se conserva a propósito el historial del dinero: los cobros (`billing_events`), las comisiones y las liquidaciones, y la bitácora de
 * la plataforma. Así Finanzas y las comisiones ya pagadas no cambian; el vendedor borrado sale ahí como «eliminado».
 */
const { ObjectId } = require('mongodb');

/** Los ids se guardaron como texto en unas colecciones y como ObjectId en otras. */
const idVariants = (id) => (ObjectId.isValid(String(id)) ? [String(id), new ObjectId(String(id))] : [String(id)]);

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

module.exports = { purgeReferrer };
