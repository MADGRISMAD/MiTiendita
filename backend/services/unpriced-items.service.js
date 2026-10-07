/**
 * Primer producto sin precio entre las líneas de una venta (o null). La caja pide el precio antes de
 * agregarlo al ticket; esto es la red de seguridad por si llega una venta armada a mano o desactualizada.
 */
async function firstUnpriced(db, items, tenantId) {
  for (const item of items || []) {
    const id = item.foodId || item.food;
    if (!id) continue;
    const food = await db.GetFoodById(id, tenantId);
    if (food?.needsPrice) return food;
  }
  return null;
}

module.exports = { firstUnpriced };
