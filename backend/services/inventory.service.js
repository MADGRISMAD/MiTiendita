const { ObjectId } = require('mongodb');
const db = require('../database/mongodb');

const DAY_MS = 24 * 60 * 60 * 1000;
const SUGGEST_SALES_DAYS = 14;
const EXPIRY_WINDOWS = [7, 15, 30];

function roundMoney(n) {
  return Number((Math.max(0, Number(n) || 0).toFixed(4)));
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function nextCost(food, incomingQty, unitCost, method) {
  const qty = Math.max(0, Math.floor(Number(incomingQty) || 0));
  const unit = roundMoney(unitCost);
  if (method === 'average') {
    const stock = Math.max(0, Number(food.stock) || 0);
    const current = Math.max(0, Number(food.cost) || 0);
    const denom = stock + qty;
    if (!denom) return unit;
    return roundMoney((stock * current + qty * unit) / denom);
  }
  return unit;
}

function parseExpiry(value) {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/** Fecha de calendario (input type=date / Joi) → mediodía UTC, sin corrimiento de zona. */
function parseDay(value) {
  if (!value && value !== 0) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  }
  const dt = parseExpiry(value);
  if (!dt) return null;
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 12, 0, 0, 0));
}

function daysUntil(date, from = new Date()) {
  const target = parseDay(date);
  if (!target) return null;
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

function expiryBucket(days) {
  if (days == null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 7) return '7';
  if (days <= 15) return '15';
  if (days <= 30) return '30';
  return 'ok';
}

function daysUntilNextVisit(visitDays, from = new Date()) {
  const days = Array.isArray(visitDays)
    ? [...new Set(visitDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))]
    : [];
  if (!days.length) return 7;
  const today = from.getDay();
  let min = 8;
  for (const d of days) {
    let delta = (Number(d) - today + 7) % 7;
    if (delta === 0) delta = 7;
    if (delta < min) min = delta;
  }
  return min;
}

function defaultLotCode(date) {
  const dt = parseDay(date) || new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `DOC-${y}${m}${d}`;
}

async function resolveSupplier(tenantId, raw, user) {
  const id = String(raw?.id || '').trim();
  if (id && ObjectId.isValid(id)) {
    const existing = await db.GetSupplierById(id, tenantId);
    if (existing) {
      const patch = {};
      const whatsapp = String(raw.whatsapp || '').trim();
      const contact = String(raw.contact || '').trim();
      if (whatsapp && !existing.whatsapp) patch.whatsapp = whatsapp;
      if (contact && !existing.contact) patch.contact = contact;
      if (Object.keys(patch).length) {
        return db.UpdateSupplier(existing.id, patch, tenantId);
      }
      return existing;
    }
  }
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  const found = await db.FindSupplierByName(tenantId, name);
  if (found) {
    const patch = {};
    const whatsapp = String(raw.whatsapp || '').trim();
    const contact = String(raw.contact || '').trim();
    if (whatsapp && !found.whatsapp) patch.whatsapp = whatsapp;
    if (contact && !found.contact) patch.contact = contact;
    if (Object.keys(patch).length) {
      return db.UpdateSupplier(found.id, patch, tenantId);
    }
    return found;
  }
  const now = new Date();
  const created = await db.CreateSupplier({
    name,
    contact: String(raw.contact || '').trim(),
    whatsapp: String(raw.whatsapp || '').trim(),
    visitDays: [],
    notes: '',
    tenantId,
    createdAt: now,
    updatedAt: now,
  });
  await db.CreateActivityLog({
    tenantId,
    type: 'supplier_created',
    message: `Alta de proveedor ${created.name}`,
    meta: { supplierId: created.id, source: raw.source || 'purchase' },
    user: user?.username || '',
    createdAt: now,
  }).catch(() => {});
  return created;
}

async function confirmPurchase({ tenantId, user, body, options = {} }) {
  let supplier = null;
  if (body.supplierId) {
    supplier = await db.GetSupplierById(body.supplierId, tenantId);
  }
  if (!supplier && (body.supplier || body.supplierName)) {
    supplier = await resolveSupplier(
      tenantId,
      body.supplier || { name: body.supplierName },
      user
    );
  }
  if (!supplier) throw httpError(400, 'Proveedor no encontrado');

  const settings = await db.GetSettings(tenantId);
  const costMethod = settings?.costMethod === 'average' ? 'average' : 'last';
  const inheritExpiry = Boolean(options.inheritExpiry);
  const fallbackExpiry = parseDay(options.expiryFallback) || (inheritExpiry ? parseDay(body.date) : null);
  const forceLots = Boolean(options.forceLots);

  const lines = [];
  for (const raw of body.items || []) {
    const foodId = String(raw.foodId || '').trim();
    if (!ObjectId.isValid(foodId)) throw httpError(400, 'Producto inválido en la compra');
    const food = await db.GetFoodById(foodId, tenantId);
    if (!food) throw httpError(400, `Producto no encontrado: ${foodId}`);
    const quantity = Math.max(0, Math.floor(Number(raw.quantity) || 0));
    if (!quantity) throw httpError(400, `Cantidad inválida para ${food.name}`);
    const unitCost = roundMoney(raw.unitCost);
    let expiresAt = parseDay(raw.expiresAt) || fallbackExpiry;
    const wantsLot =
      Boolean(food.tracksExpiry) ||
      forceLots ||
      Boolean(parseDay(raw.expiresAt)) ||
      Boolean(raw.lot) ||
      (inheritExpiry && Boolean(expiresAt));
    let lot = String(raw.lot || '').trim();
    if (wantsLot && !lot) lot = defaultLotCode(expiresAt || new Date());
    if (wantsLot && !expiresAt) {
      if (!forceLots && !fallbackExpiry) {
        throw httpError(400, `Indica la caducidad de ${food.name}`);
      }
      expiresAt = fallbackExpiry || parseDay(new Date());
    }
    if (food.tracksExpiry && !forceLots && !lot) {
      throw httpError(400, `Indica el lote de ${food.name}`);
    }
    lines.push({
      food,
      quantity,
      unitCost,
      lot,
      expiresAt,
      tracksExpiry: wantsLot && Boolean(expiresAt),
    });
  }

  const now = new Date();
  const purchaseDate = parseDay(body.date) || now;
  const items = [];
  let totalCost = 0;

  for (const line of lines) {
    const food = await db.GetFoodById(line.food.id, tenantId);
    const newCost = nextCost(food, line.quantity, line.unitCost, costMethod);
    await db.UpdateFood(food.id, { cost: newCost }, tenantId);
    await db.IncrementFoodStock(food.id, line.quantity, tenantId);
    await db.SaveCostSnapshot(tenantId, food.id, line.unitCost, 'purchase').catch(() => {});

    let lotId = null;
    if (line.tracksExpiry) {
      if (!food.tracksExpiry) {
        await db.UpdateFood(food.id, { tracksExpiry: true }, tenantId);
      }
      const lot = await db.CreateLot({
        tenantId,
        foodId: String(food.id),
        foodName: food.name,
        lot: line.lot,
        expiresAt: line.expiresAt,
        quantity: line.quantity,
        initialQuantity: line.quantity,
        unitCost: line.unitCost,
        createdAt: now,
        updatedAt: now,
      });
      lotId = lot.id;
    }

    const lineTotal = roundMoney(line.quantity * line.unitCost);
    totalCost += lineTotal;
    items.push({
      foodId: String(food.id),
      name: food.name,
      quantity: line.quantity,
      unitCost: line.unitCost,
      lineTotal,
      lot: line.lot || '',
      expiresAt: line.expiresAt,
      lotId,
      tracksExpiry: line.tracksExpiry,
    });

    const linked = Array.isArray(food.supplierIds) ? food.supplierIds.map(String) : [];
    if (!linked.includes(String(supplier.id))) {
      await db.UpdateFood(food.id, { supplierIds: [...linked, String(supplier.id)] }, tenantId);
    }
  }

  const purchase = await db.CreatePurchase({
    tenantId,
    supplierId: String(supplier.id),
    supplierName: supplier.name,
    date: purchaseDate,
    notes: String(body.notes || '').trim(),
    items,
    totalCost: roundMoney(totalCost),
    costMethod,
    status: 'confirmed',
    source: options.source || 'purchase',
    createdBy: user?.username || '',
    createdAt: now,
    confirmedAt: now,
  });

  if (settings && !settings.inventoryEnabled) {
    await db.UpdateSettings({ inventoryEnabled: true, updatedAt: now }, tenantId).catch(() => {});
  }

  await db.CreateActivityLog({
    tenantId,
    type: 'purchase_confirmed',
    message: `Entrada de ${supplier.name}: ${items.length} producto(s), $${roundMoney(totalCost).toFixed(2)}`,
    meta: {
      purchaseId: purchase.id,
      supplierId: supplier.id,
      supplierName: supplier.name,
      itemCount: items.length,
      totalCost: roundMoney(totalCost),
      source: options.source || 'purchase',
    },
    user: user?.username || '',
    createdAt: now,
  });

  return purchase;
}

async function listExpiring(tenantId, days = 30) {
  const window = EXPIRY_WINDOWS.includes(Number(days)) ? Number(days) : Math.max(1, Math.min(120, Number(days) || 30));
  const until = new Date();
  until.setHours(23, 59, 59, 999);
  until.setDate(until.getDate() + window);
  const lots = await db.GetExpiringLots(tenantId, until);
  const rows = lots.map((lot) => {
    const daysLeft = daysUntil(lot.expiresAt);
    return {
      ...lot,
      daysLeft,
      bucket: expiryBucket(daysLeft),
    };
  });
  const summary = {
    expired: rows.filter((r) => r.bucket === 'expired').length,
    d7: rows.filter((r) => r.bucket === '7').length,
    d15: rows.filter((r) => r.bucket === '15').length,
    d30: rows.filter((r) => r.bucket === '30').length,
    total: rows.length,
  };
  return { days: window, summary, items: rows };
}

async function purchaseSuggestions(tenantId) {
  const [foods, suppliers, soldMap] = await Promise.all([
    db.GetFoods(tenantId),
    db.GetSuppliers(tenantId),
    db.GetPaidItemQtySince(tenantId, new Date(Date.now() - SUGGEST_SALES_DAYS * DAY_MS)),
  ]);
  const supplierById = Object.fromEntries((suppliers || []).map((s) => [String(s.id), s]));
  const groups = new Map();

  for (const food of foods || []) {
    const stock = Math.max(0, Number(food.stock) || 0);
    const min = food.lowStockThreshold == null ? 5 : Math.max(0, Number(food.lowStockThreshold) || 0);
    const sold = Number(soldMap[String(food.id)]) || 0;
    const avgDaily = sold / SUGGEST_SALES_DAYS;
    const supplierIds = Array.isArray(food.supplierIds) ? food.supplierIds.map(String).filter(Boolean) : [];
    const primaryId = supplierIds[0] || '';
    const supplier = primaryId ? supplierById[primaryId] : null;
    const coverage = daysUntilNextVisit(supplier?.visitDays);
    const fromMin = Math.max(0, min - stock);
    const fromSales = Math.max(0, Math.ceil(avgDaily * coverage) - stock);
    const suggestedQty = Math.max(fromMin, fromSales);
    if (!suggestedQty) continue;

    const key = primaryId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        supplierId: primaryId || null,
        supplierName: supplier?.name || 'Sin proveedor',
        whatsapp: supplier?.whatsapp || '',
        visitDays: supplier?.visitDays || [],
        coverageDays: coverage,
        items: [],
      });
    }
    groups.get(key).items.push({
      foodId: String(food.id),
      name: food.name,
      stock,
      lowStockThreshold: min,
      soldLast14: sold,
      avgDaily: Number(avgDaily.toFixed(2)),
      suggestedQty,
      unitCost: Number(food.cost) || 0,
      estimatedCost: roundMoney(suggestedQty * (Number(food.cost) || 0)),
    });
  }

  const list = [...groups.values()].map((g) => {
    g.items.sort((a, b) => b.suggestedQty - a.suggestedQty);
    g.itemCount = g.items.length;
    g.estimatedCost = roundMoney(g.items.reduce((s, i) => s + i.estimatedCost, 0));
    return g;
  });
  list.sort((a, b) => {
    if (!a.supplierId && b.supplierId) return 1;
    if (a.supplierId && !b.supplierId) return -1;
    return String(a.supplierName).localeCompare(String(b.supplierName), 'es');
  });
  return { salesDays: SUGGEST_SALES_DAYS, groups: list };
}

module.exports = {
  confirmPurchase,
  resolveSupplier,
  listExpiring,
  purchaseSuggestions,
  nextCost,
  daysUntil,
  expiryBucket,
  parseDay,
  defaultLotCode,
};
