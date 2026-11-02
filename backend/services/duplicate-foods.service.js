/**
 * Posibles duplicados en el inventario de una tienda: el mismo producto registrado dos veces (por ejemplo con otro código de barras por error).
 * Solo propone: la persona confirma cuál es el correcto. Reutiliza las reglas del catálogo (palabras, variantes y tamaño) y la similitud del inventario mágico.
 */
const { canon, cleanAltCodes } = require('../utils/barcode');
const { sameProduct, sizeDiffers, gtinStatus } = require('./catalog-audit.service');
const { tokens, scoreName } = require('./magic-inventory.service');

const MAX_PAIRS = 100;
const MAX_BUCKET = 300; // una palabra que sale en cientos de productos ("leche") no sirve para agrupar
const MAX_NOT_DUP = 200;

class DuplicateError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const codesOf = (food) => [food.barcode, food.sku, ...(Array.isArray(food.altCodes) ? food.altCodes : [])].map((c) => canon(c)).filter(Boolean);

function side(food) {
  const code = String(food.barcode || food.sku || '').trim();
  return {
    id: String(food.id),
    name: food.name || '',
    barcode: code,
    altCodes: Array.isArray(food.altCodes) ? food.altCodes : [],
    codeStatus: gtinStatus(code), // ok | digit (el dígito verificador no cuadra) | length | internal | missing
    price: Number(food.price) || 0,
    cost: Number(food.cost) || 0,
    stock: Number(food.stock) || 0,
    menuId: food.menuId ? String(food.menuId) : '',
  };
}

const dismissed = (a, b) => (a.notDupOf || []).map(String).includes(String(b.id)) || (b.notDupOf || []).map(String).includes(String(a.id));

/** Pares de productos que parecen el mismo: nombre y presentación parecidos, o que comparten código. Los más seguros primero. */
function findPairs(foods) {
  const list = (foods || []).filter((f) => f && f.id != null);
  const byId = new Map(list.map((f) => [String(f.id), f]));
  const buckets = new Map();
  const add = (key, id) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  };
  for (const f of list) {
    const id = String(f.id);
    for (const t of new Set(tokens(f.name))) if (!/^\d+$/.test(t) && t.length > 2) add(`w:${t}`, id);
    for (const c of new Set(codesOf(f))) add(`c:${c}`, id);
  }

  const seen = new Set();
  const pairs = [];
  for (const [key, ids] of buckets) {
    const byCode = key.startsWith('c:');
    if (ids.length < 2 || (!byCode && ids.length > MAX_BUCKET)) continue;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const [x, y] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const pk = `${x}|${y}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const a = byId.get(x);
        const b = byId.get(y);
        if (dismissed(a, b)) continue;
        const sameCode = codesOf(a).some((c) => codesOf(b).includes(c));
        const similar = sameProduct(a.name, b.name) && !sizeDiffers(a.name, b.name);
        if (!sameCode && !similar) continue;
        const score = sameCode ? 1 : Math.max(scoreName(a.name, b.name), scoreName(b.name, a.name));
        pairs.push({ score, reason: sameCode ? 'code' : 'name', a: side(a), b: side(b) });
      }
    }
  }
  return pairs.sort((p, q) => q.score - p.score).slice(0, MAX_PAIRS);
}

/**
 * Resuelve un par.
 *  - delete:        se queda `keepId` y se borra `removeId` (su código era el equivocado).
 *  - keepCodes:     igual, pero los códigos del borrado pasan al que se queda como códigos extra (es el mismo producto con dos códigos).
 *  - notDuplicate:  no se borra nada; el par no vuelve a salir.
 * moveStock pasa las existencias (y lotes) del borrado al que se queda.
 */
async function resolvePair(db, { tenantId, action, keepId, removeId, moveStock = false }) {
  if (!['delete', 'keepCodes', 'notDuplicate'].includes(action)) throw new DuplicateError(400, 'Acción no válida.');
  if (!keepId || !removeId || String(keepId) === String(removeId)) throw new DuplicateError(400, 'Elige dos productos distintos.');
  const keep = await db.GetFoodById(keepId, tenantId);
  const gone = await db.GetFoodById(removeId, tenantId);
  if (!keep || !gone) throw new DuplicateError(404, 'Uno de los productos ya no existe. Vuelve a buscar.');

  if (action === 'notDuplicate') {
    const mark = (food, other) => db.UpdateFood(food.id, { notDupOf: [...new Set([...(food.notDupOf || []).map(String), String(other.id)])].slice(-MAX_NOT_DUP) }, tenantId);
    await mark(keep, gone);
    await mark(gone, keep);
    return { action, kept: String(keep.id), removed: null, movedStock: 0, codesAdded: [] };
  }

  const stock = Math.max(0, Number(gone.stock) || 0);
  let movedStock = 0;
  if (moveStock && stock > 0) {
    await db.getCollection('lots').updateMany({ foodId: String(gone.id), tenantId: String(tenantId) }, { $set: { foodId: String(keep.id) } });
    await db.IncrementFoodStock(keep.id, stock, tenantId);
    if (gone.tracksExpiry && !keep.tracksExpiry) await db.UpdateFood(keep.id, { tracksExpiry: true }, tenantId);
    movedStock = stock;
  }

  const patch = {};
  let codesAdded = [];
  if (action === 'keepCodes') {
    const keepMain = String(keep.barcode || keep.sku || '').trim();
    const extra = [gone.barcode, gone.sku, ...(Array.isArray(gone.altCodes) ? gone.altCodes : [])];
    if (!keepMain && gone.barcode) {
      patch.barcode = String(gone.barcode);
      patch.sku = String(gone.sku || gone.barcode);
    }
    const mainNow = patch.barcode || keepMain;
    const all = cleanAltCodes([...(Array.isArray(keep.altCodes) ? keep.altCodes : []), ...extra], mainNow);
    codesAdded = all.filter((c) => !(keep.altCodes || []).map(canon).includes(canon(c)));
    patch.altCodes = all;
  }

  await db.DeleteFood(gone.id, tenantId);
  if (Object.keys(patch).length) await db.UpdateFood(keep.id, patch, tenantId);
  return { action, kept: String(keep.id), removed: gone, movedStock, codesAdded };
}

module.exports = { findPairs, resolvePair, DuplicateError };
