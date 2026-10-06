/**
 * Descuento de existencias al cobrar.
 * - Sin permiso para vender sin existencias: cada producto se descuenta con un solo
 *   `$inc` condicionado a `stock >= cantidad` (dos cajas no pueden vender la última pieza
 *   a la vez). Si alguno no alcanza, se regresa lo ya descontado y se lanza un error 409.
 * - Con permiso: se descuenta siempre (el stock puede quedar negativo) y se reportan los
 *   faltantes para que la venta quede marcada para revisión.
 */

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

/** Suma cantidades por producto (el mismo producto puede venir en varios renglones). */
function groupSaleLines(items = []) {
  const byFood = new Map();
  for (const item of items) {
    const foodId = item?.foodId || item?.food;
    const qty = Number(item?.quantity) || 0;
    if (!foodId || qty <= 0) continue;
    const key = String(foodId);
    const row = byFood.get(key) || { foodId: key, name: item.name || 'Producto', quantity: 0 };
    row.quantity = Number((row.quantity + qty).toFixed(3));
    byFood.set(key, row);
  }
  return [...byFood.values()];
}

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}

function shortageMessage(shortages) {
  const list = shortages
    .map((s) => `${s.name} (hay ${fmtQty(Math.max(0, s.available))}, se piden ${fmtQty(s.requested)})`)
    .join(', ');
  return `Sin existencias suficientes: ${list}.`;
}

/**
 * @param foods colección de productos
 * @param filterFor (id) => filtro del producto en su tienda, o null si el id no es válido
 * @returns {{ applied: Array<{foodId, quantity}>, shortages: Array<{foodId, name, requested, available}> }}
 */
async function reserveSaleStock(foods, filterFor, items, { allowNegative = false } = {}) {
  const lines = groupSaleLines(items);
  const applied = [];
  const shortages = [];

  for (const line of lines) {
    const filter = filterFor(line.foodId);
    if (!filter) continue;

    if (allowNegative) {
      const after = await foods.findOneAndUpdate(
        filter,
        { $inc: { stock: -line.quantity } },
        { returnDocument: 'after' }
      );
      if (!after) continue; // producto borrado: no frena la venta
      applied.push({ foodId: line.foodId, quantity: line.quantity });
      const left = Number(after.stock) || 0;
      if (left < 0) {
        shortages.push({
          foodId: line.foodId,
          name: after.name || line.name,
          requested: line.quantity,
          available: Number((left + line.quantity).toFixed(3)),
        });
      }
      continue;
    }

    const after = await foods.findOneAndUpdate(
      { ...filter, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } },
      { returnDocument: 'after' }
    );
    if (after) {
      applied.push({ foodId: line.foodId, quantity: line.quantity });
      continue;
    }
    const food = await foods.findOne(filter);
    if (!food) continue; // producto borrado: no frena la venta
    shortages.push({
      foodId: line.foodId,
      name: food.name || line.name,
      requested: line.quantity,
      available: Number(food.stock) || 0,
    });
  }

  if (!allowNegative && shortages.length) {
    for (const done of applied) {
      const filter = filterFor(done.foodId);
      if (filter) await foods.updateOne(filter, { $inc: { stock: done.quantity } });
    }
    throw httpError(409, shortageMessage(shortages), { shortages });
  }

  return { applied, shortages };
}

module.exports = { groupSaleLines, reserveSaleStock, shortageMessage };
