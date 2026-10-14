/** Ayudas de identificadores compartidas por los módulos `*.db.js`. */
const { ObjectId } = require('mongodb');

/** ObjectId solo si el texto es un id completo y exacto (24 hex); si no, null. */
const oid = (id) => (ObjectId.isValid(String(id)) && String(new ObjectId(String(id))) === String(id) ? new ObjectId(String(id)) : null);

/** Documento de la base → objeto con `id` en texto y sin `_id`. */
const out = (doc) => {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) };
};

module.exports = { oid, out };
