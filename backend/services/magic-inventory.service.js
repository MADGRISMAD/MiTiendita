/**
 * Empareja lo que leyó Gemini con el catálogo de la tienda.
 * Incluye packs de mayoreo → piezas para inventario.
 */

const STOP = new Set(['a', 'al', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'pesos', 'peso', 'mxn', 'pza', 'pz']);

function tokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+)([a-z]+)/g, '$1 $2')
    .replace(/([a-z]+)(\d+)/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map(stemToken);
}

function stemToken(token) {
  if (/^\d+$/.test(token) || token.length < 5) return token;
  if (token.endsWith('es') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function scoreName(query, name) {
  const q = tokens(query);
  const n = tokens(name);
  if (!q.length || !n.length) return 0;
  if (q.join(' ') === n.join(' ')) return 1;
  const set = new Set(n);
  const hit = q.filter((t) => set.has(t)).length;
  if (!hit) return 0;
  let score = (hit / q.length) * 0.72 + (hit / n.length) * 0.28;
  const qNums = q.filter((t) => /^\d+$/.test(t));
  const nNums = n.filter((t) => /^\d+$/.test(t));
  if (qNums.length && nNums.length && !qNums.some((num) => nNums.includes(num))) {
    score *= 0.35;
  }
  return score;
}

function roundPrice(value) {
  return Math.round(Number(value) * 100) / 100;
}

function suggestSell(cost) {
  const c = Number(cost) || 0;
  if (c <= 0) return 0;
  return Math.max(1, Math.ceil(c * 1.3));
}

function looksLikePack(name) {
  return /\b(pack|paq\.?|paquete|cjs?|caja|bulto|display)\b/i.test(String(name || ''));
}

/** Intenta sacar piezas por pack del nombre si la IA no lo mandó. */
function inferPackSize(name, aiPackSize) {
  const fromAi = Math.floor(Number(aiPackSize) || 0);
  if (fromAi > 1) return Math.min(5000, fromAi);
  if (fromAi === 1 && !looksLikePack(name)) return 1;

  const n = String(name || '');
  const patterns = [
    /(?:pack|paq\.?|paquete|caja|cjs?|bulto|display)\s*[\/\s-]*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:pzas?|piezas|unidades|uds?)\b/i,
    /\bx\s*(\d{1,3})\b/i,
    /\bc\/\s*(\d{1,3})\b/i,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    if (m) {
      const size = Number(m[1]);
      // Evitar tomar "400" de "400ML" como tamaño de pack
      if (size >= 2 && size <= 200) return size;
    }
  }
  if (looksLikePack(name)) return 0;
  return fromAi > 0 ? fromAi : 1;
}

function stockFromItem(item) {
  const packs = Math.max(1, Math.floor(Number(item.packs) || 1));
  const packSize = inferPackSize(item.name, item.packSize);
  const stockIn = packSize > 0 ? packs * packSize : 0;
  return { packs, packSize, stockIn, isPack: looksLikePack(item.name) || packSize > 1 };
}

/** Costo por pieza si el renglón cobró el pack completo. */
function unitCost(packCost, packSize) {
  const cost = Number(packCost) || 0;
  const size = Math.floor(Number(packSize) || 0);
  if (cost <= 0) return 0;
  if (size > 1) return roundPrice(cost / size);
  return roundPrice(cost);
}

function enrichItem(item) {
  const pack = stockFromItem(item);
  const lineCost = roundPrice(item.cost || 0);
  const cost = pack.packSize > 1 ? unitCost(lineCost, pack.packSize) : lineCost;
  const sell = roundPrice(item.price || 0);
  return {
    name: item.name,
    barcode: item.barcode || '',
    packs: pack.packs,
    packSize: pack.packSize,
    stockIn: pack.stockIn,
    isPack: pack.isPack,
    lineCost,
    cost,
    price: sell > 0 ? sell : suggestSell(cost),
  };
}

function matchItems(items, foods) {
  const catalog = (foods || []).map((food) => ({
    id: String(food.id),
    name: food.name || '',
    price: Number(food.price) || 0,
    cost: Number(food.cost) || 0,
    stock: Math.max(0, Number(food.stock) || 0),
    barcode: String(food.barcode || food.sku || '').replace(/\s/g, ''),
  }));

  const matches = [];
  const choose = [];
  const unknown = [];
  const taken = new Set();

  for (const raw of items || []) {
    const item = enrichItem(raw);
    const barcode = String(item.barcode || '').replace(/\s/g, '');
    let ranked = [];

    if (barcode) {
      const exact = catalog.find((food) => food.barcode && food.barcode === barcode);
      if (exact) {
        if (taken.has(exact.id)) continue;
        ranked = [{ food: exact, score: 1 }];
      }
    }

    if (!ranked.length) {
      ranked = catalog
        .map((food) => ({ food, score: scoreName(item.name, food.name) }))
        .filter((row) => row.score >= 0.55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }

    const best = ranked[0];
    const second = ranked[1];
    const sure =
      best &&
      best.score >= 0.82 &&
      (!second || best.score - second.score >= 0.12) &&
      !taken.has(best.food.id);

    if (sure) {
      taken.add(best.food.id);
      const newSell = item.price > 0 && raw.price > 0 ? item.price : roundPrice(best.food.price);
      const newCost = item.cost > 0 ? item.cost : roundPrice(best.food.cost);
      const sellChanged = raw.price > 0 && roundPrice(best.food.price) !== newSell;
      const costChanged = item.cost > 0 && roundPrice(best.food.cost) !== newCost;
      const stockIn = item.stockIn;
      if (!sellChanged && !costChanged && stockIn <= 0) continue;
      matches.push({
        id: best.food.id,
        name: best.food.name,
        oldPrice: roundPrice(best.food.price),
        price: newSell,
        oldCost: roundPrice(best.food.cost),
        cost: newCost,
        oldStock: best.food.stock,
        stockIn,
        packSize: item.packSize,
        packs: item.packs,
        isPack: item.isPack,
        from: item.name,
        sellChanged,
        costChanged,
      });
      continue;
    }

    const options = ranked
      .filter((row) => !taken.has(row.food.id))
      .map((row) => ({
        id: row.food.id,
        name: row.food.name,
        oldPrice: roundPrice(row.food.price),
        oldCost: roundPrice(row.food.cost),
        oldStock: row.food.stock,
      }));

    if (options.length) {
      choose.push({
        from: item.name,
        price: raw.price > 0 ? item.price : roundPrice(options[0].oldPrice),
        cost: item.cost,
        stockIn: item.stockIn,
        packSize: item.packSize,
        packs: item.packs,
        isPack: item.isPack,
        options,
      });
    } else if (!ranked.length) {
      unknown.push({
        name: item.name,
        cost: item.cost,
        lineCost: item.lineCost,
        price: item.price,
        barcode,
        stockIn: item.stockIn,
        packSize: item.packSize,
        packs: item.packs,
        isPack: item.isPack,
      });
    }
  }

  return { matches, choose, unknown };
}

const TARGET_MARGIN = 0.3;

function costInsight(oldCost, oldPrice, newCost) {
  const prev = Number(oldCost) || 0;
  const sell = Number(oldPrice) || 0;
  const next = Number(newCost) || 0;
  const costChanged = next > 0 && Math.abs(next - prev) >= 0.01;
  const costDelta = costChanged ? roundPrice(next - prev) : 0;
  const costChangePct = costChanged && prev > 0 ? Math.round((costDelta / prev) * 100) : 0;
  const currentMargin = sell > 0 && prev > 0 ? Math.round(((sell - prev) / sell) * 100) : null;
  const newMargin = sell > 0 && next > 0 ? Math.round(((sell - next) / sell) * 100) : null;
  const suggestedPrice = next > 0 ? Math.max(1, Math.ceil(next / (1 - TARGET_MARGIN))) : 0;
  return { costChanged, costDelta, costChangePct, currentMargin, newMargin, suggestedPrice };
}

function enrichCostAlerts(matched, lastCosts = {}) {
  for (const row of matched.matches || []) {
    const snap = lastCosts[row.id];
    Object.assign(row, costInsight(row.oldCost, row.oldPrice, row.cost), {
      previousCost: snap ? snap.cost : row.oldCost,
      lastCostDate: snap?.at || null,
    });
  }
  for (const row of matched.choose || []) {
    const first = row.options?.[0];
    if (!first) continue;
    Object.assign(row, costInsight(first.oldCost, first.oldPrice, row.cost));
  }
  return matched;
}

module.exports = {
  tokens,
  scoreName,
  matchItems,
  roundPrice,
  suggestSell,
  inferPackSize,
  stockFromItem,
  unitCost,
  enrichItem,
  looksLikePack,
  costInsight,
  enrichCostAlerts,
};
