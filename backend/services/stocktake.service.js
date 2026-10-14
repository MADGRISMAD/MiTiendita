/**
 * backend/services/stocktake.service.js
 * Conteo de inventario: contar lo que hay en el estante y compararlo contra lo que dice el sistema.
 *
 * Flujo: abrir conteo → capturar lo contado (se puede guardar a medias) → revisar diferencias → aplicar.
 *
 * Cada renglón guarda lo que decía el sistema (`expected`): al abrir el conteo y, de nuevo, en el momento
 * exacto en que se captura lo contado de ese producto. Mientras se cuenta la tienda sigue vendiendo, así que
 * al aplicar NO se reemplaza la existencia por lo contado: se suma la diferencia (contado − esperado).
 * Así una venta hecha antes de contar el producto no se resta dos veces, y una hecha después tampoco se pierde.
 *
 * El acceso a datos entra por `store` para poder probar la lógica sin base de datos.
 */

const STATUS = { OPEN: 'open', APPLIED: 'applied', CANCELLED: 'cancelled' };

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/** ¿El producto lleva existencias? (los renglones sin número de stock no se cuentan). */
function isCountable(food) {
  return food && typeof food.stock === 'number' && Number.isFinite(food.stock);
}

/**
 * Renglones de un conteo nuevo. En MiTiendita las categorías son los menús: `menuId` limita el conteo
 * a una categoría (conteo por pasillo) y `menuNames` ({ menuId: nombre }) pone el nombre en cada renglón.
 */
function buildLines(foods, { menuId = '', menuNames = {} } = {}) {
  const wanted = String(menuId || '');
  return foods
    .filter(isCountable)
    .filter((f) => !wanted || String(f.menuId || '') === wanted)
    .map((f) => ({
      foodId: String(f.id),
      name: String(f.name || 'Producto'),
      code: String(f.barcode || f.sku || ''),
      category: String(menuNames[String(f.menuId || '')] || ''),
      unit: String(f.saleUnit || 'pieza'),
      expected: round3(f.stock),
      counted: null,
      note: '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Diferencia de un renglón (null mientras no se haya contado). */
function lineDiff(line) {
  if (line.counted == null) return null;
  return round3(line.counted - line.expected);
}

function summarize(stocktake, costOf = () => 0) {
  const lines = stocktake.lines || [];
  let counted = 0;
  let withDiff = 0;
  let shortage = 0;
  let surplus = 0;
  let shortageValue = 0;
  let surplusValue = 0;
  for (const line of lines) {
    const diff = lineDiff(line);
    if (diff == null) continue;
    counted += 1;
    if (diff === 0) continue;
    withDiff += 1;
    const value = Math.abs(diff) * (Number(costOf(line.foodId)) || 0);
    if (diff < 0) {
      shortage += -diff;
      shortageValue += value;
    } else {
      surplus += diff;
      surplusValue += value;
    }
  }
  return {
    total: lines.length,
    counted,
    pending: lines.length - counted,
    withDiff,
    shortage: round3(shortage),
    surplus: round3(surplus),
    shortageValue: Math.round(shortageValue * 100) / 100,
    surplusValue: Math.round(surplusValue * 100) / 100,
  };
}

/**
 * Valida y fusiona lo capturado. Solo toca renglones que existen en el conteo.
 * `currentStock` ({ foodId: existencia del sistema ahora }) fija `expected` en el momento de contar.
 */
function mergeCounts(stocktake, entries, currentStock = {}) {
  if (stocktake.status !== STATUS.OPEN) {
    throw httpError(409, 'Este conteo ya no está abierto.', 'stocktake_closed');
  }
  if (!Array.isArray(entries) || entries.length === 0) throw httpError(400, 'No hay nada que guardar.');
  if (entries.length > 5000) throw httpError(400, 'Son demasiados renglones a la vez.');
  const byId = new Map(stocktake.lines.map((l) => [String(l.foodId), l]));
  for (const e of entries) {
    const line = byId.get(String(e?.foodId));
    if (!line) throw httpError(400, 'Hay un producto que no pertenece a este conteo.');
    if (e.counted === null || e.counted === '' || e.counted === undefined) {
      line.counted = null; // borrar lo capturado
    } else {
      const n = Number(e.counted);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        throw httpError(400, `La cantidad contada de "${line.name}" debe ser un número de 0 en adelante.`);
      }
      line.counted = round3(n);
      const now = currentStock[String(line.foodId)];
      if (Number.isFinite(now)) line.expected = round3(now);
    }
    if (e.note !== undefined) line.note = String(e.note || '').trim().slice(0, 140);
  }
  return stocktake.lines;
}

/**
 * Aplica el conteo. Para cada renglón contado con diferencia suma (contado − foto) a la existencia.
 * `store` provee: getFood(id), addStock(id, delta), takeLots(id, qty), addLot(food, qty), log(entry).
 * Es idempotente: un conteo aplicado no se puede aplicar otra vez.
 */
async function applyStocktake(stocktake, store, { user = '', skipUncounted = true } = {}) {
  if (stocktake.status === STATUS.APPLIED) {
    throw httpError(409, 'Este conteo ya se aplicó.', 'stocktake_applied');
  }
  if (stocktake.status !== STATUS.OPEN) {
    throw httpError(409, 'Este conteo ya no está abierto.', 'stocktake_closed');
  }
  const summary = summarize(stocktake);
  if (summary.counted === 0) throw httpError(400, 'Todavía no has contado ningún producto.', 'nothing_counted');
  if (!skipUncounted && summary.pending > 0) {
    throw httpError(409, `Faltan ${summary.pending} productos por contar.`, 'pending_lines');
  }

  const results = [];
  for (const line of stocktake.lines) {
    const diff = lineDiff(line);
    if (diff == null || diff === 0) continue;
    const food = await store.getFood(line.foodId);
    if (!food) {
      results.push({ foodId: line.foodId, name: line.name, skipped: 'deleted' });
      continue;
    }
    const before = round3(food.stock);
    if (food.tracksExpiry) {
      if (diff < 0) await store.takeLots(line.foodId, -diff);
      else await store.addLot(food, diff);
    }
    await store.addStock(line.foodId, diff);
    const after = round3(before + diff);
    await store.log({
      type: 'stock_adjusted',
      message: `Conteo de ${line.name}: ${before} → ${after} (${diff > 0 ? '+' : ''}${diff}) · Conteo físico${line.note ? ` · ${line.note}` : ''}`,
      meta: { foodId: line.foodId, before, after, reason: 'count', stocktakeId: stocktake.id },
      user,
    });
    results.push({ foodId: line.foodId, name: line.name, before, after, diff });
  }
  return { summary, applied: results.filter((r) => !r.skipped), skipped: results.filter((r) => r.skipped) };
}

module.exports = {
  STATUS,
  isCountable,
  buildLines,
  lineDiff,
  summarize,
  mergeCounts,
  applyStocktake,
  httpError,
};
