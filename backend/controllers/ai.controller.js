const db = require('../database/mongodb');
const { planAiQuota, hasAiFeatures } = require('../services/plans.catalog');
const gemini = require('../services/gemini.service');
const magic = require('../services/magic-inventory.service');
const inventory = require('../services/inventory.service');
const limits = require('../services/plan-limits.service');

const PLAN_NAMES = { basic: 'Básico', growth: 'Crecimiento', pro: 'Pro', perpetual: 'Perpetua' };
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DEFAULT_MAGIC_SUPPLIER = 'Proveedor (nota)';

function quotaPayload(plan, used, limit) {
  const cap = limit == null ? null : Number(limit);
  const count = Number(used) || 0;
  return {
    plan,
    planName: PLAN_NAMES[plan] || 'Básico',
    used: count,
    limit: cap,
    remaining: cap == null ? null : Math.max(0, cap - count),
    month: db.aiMonthKey(),
  };
}

async function readQuota(tenant) {
  const plan = tenant?.plan || 'basic';
  const limit = planAiQuota(plan);
  const used = await db.GetAiUsage(String(tenant.id || tenant._id));
  return quotaPayload(plan, used, limit);
}

function cleanOneImage(body) {
  const raw = String(body?.imageBase64 || '').trim();
  if (!raw) return null;
  const mime = String(body?.mimeType || 'image/jpeg').toLowerCase();
  if (!IMAGE_TYPES.has(mime)) {
    const err = new Error('La foto debe ser JPG, PNG o WebP.');
    err.status = 400;
    throw err;
  }
  const data = raw.replace(/^data:[^;]+;base64,/, '');
  if (data.length > 4_500_000) {
    const err = new Error('La foto es muy pesada. Toma otra más cerca y con menos detalle.');
    err.status = 400;
    throw err;
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data)) {
    const err = new Error('No pude leer esa foto. Intenta otra.');
    err.status = 400;
    throw err;
  }
  return { imageBase64: data.replace(/\s/g, ''), mimeType: mime };
}

const MAX_IMAGES = 4;
const MAX_IMAGES_TOTAL = 8_000_000; // base64 total; el cuerpo de la petición admite 10 MB

/** Una nota larga puede venir en varias fotos (`images`); se sigue aceptando la foto única de antes. */
function cleanImages(body) {
  const list = Array.isArray(body?.images) ? body.images : body?.imageBase64 ? [body] : [];
  if (list.length > MAX_IMAGES) {
    const err = new Error(`Máximo ${MAX_IMAGES} fotos por nota.`);
    err.status = 400;
    throw err;
  }
  const images = list.map(cleanOneImage).filter(Boolean);
  if (images.reduce((sum, i) => sum + i.imageBase64.length, 0) > MAX_IMAGES_TOTAL) {
    const err = new Error('Las fotos pesan demasiado juntas. Quita una o toma fotos más sencillas.');
    err.status = 400;
    throw err;
  }
  return images;
}

/** Lo que debería sumar la lista según lo impreso: el subtotal si lo hay; si no, el total sin impuestos y con los descuentos devueltos. */
function expectedBase(doc) {
  const total = Number(doc?.documentTotal) || 0;
  const subtotal = Number(doc?.documentSubtotal) || 0;
  if (subtotal > 0) return { target: subtotal, basis: 'subtotal' };
  if (total > 0) return { target: magic.roundPrice(total - (Number(doc?.documentTax) || 0) + (Number(doc?.documentDiscount) || 0)), basis: 'total' };
  return { target: 0, basis: '' };
}

const lineAmount = (e) => (e.lineTotal > 0 ? e.lineTotal : e.lineCost * e.packs);
const sumLines = (items) => magic.roundPrice(items.map((it) => magic.enrichItem(it)).reduce((sum, e) => sum + lineAmount(e), 0));
const closeEnough = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.01);

/**
 * Los renglones sin importe impreso son ambiguos: el monto que se leyó puede ser el precio de UNA unidad de compra
 * o el importe de todo el renglón. Si leerlo como importe hace que la nota cuadre y como precio no, se toma como importe.
 */
function reconcileLines(items, doc) {
  const { target } = expectedBase(doc);
  if (!target || closeEnough(sumLines(items), target)) return items;
  const asTotal = items.map((it) => (!(it.lineTotal > 0) && it.cost > 0 && it.packs > 1 ? { ...it, lineTotal: it.cost } : it));
  return closeEnough(sumLines(asTotal), target) ? asTotal : items;
}

/** Compara lo que se leyó con lo impreso en la nota: si no cuadra, falta o se leyó mal algún renglón. */
function checkTotals(items, doc) {
  const read = sumLines(items);
  const { target, basis } = expectedBase(doc);
  const diff = target > 0 ? magic.roundPrice(read - target) : 0;
  return {
    read,
    document: target,
    basis,
    printedTotal: magic.roundPrice(doc?.documentTotal || 0),
    diff,
    mismatch: target > 0 && read > 0 && !closeEnough(read, target),
    lines: items.map((it) => magic.enrichItem(it)).map((e) => ({ name: e.name, packs: e.packs, packSize: e.packSize, amount: magic.roundPrice(lineAmount(e)) })),
  };
}

function validMoney(value) {
  const n = magic.roundPrice(value);
  return Number.isFinite(n) && n >= 0 && n <= 999999 ? n : null;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cleanDay(value) {
  const s = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function extractedItems(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function matchSupplier(tenantId, raw) {
  const supplier = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const name = String(supplier.name || '').trim();
  const found = name ? await db.FindSupplierByName(tenantId, name) : null;
  const date = cleanDay(supplier.date) || todayYmd();
  return {
    id: found?.id || '',
    name: name || found?.name || '',
    contact: String(supplier.contact || found?.contact || '').trim(),
    whatsapp: String(supplier.whatsapp || found?.whatsapp || '').replace(/\D/g, '').slice(0, 15),
    date,
    expiresAt: cleanDay(supplier.expiresAt) || date,
    existing: Boolean(found),
  };
}

async function quota(req, res) {
  try {
    const plan = req.tenant?.plan || 'basic';
    const data = await readQuota(req.tenant);
    return res.status(200).json({ ...data, aiEnabled: hasAiFeatures(plan) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'No pude revisar tus usos de este mes.' });
  }
}

async function preview(req, res) {
  const tenantId = req.tenantId;
  const plan = req.tenant?.plan || 'basic';
  const limit = planAiQuota(plan);
  let charged = false;

  try {
    if (!gemini.hasGeminiConfig()) {
      return res.status(503).json({
        message: 'Inventario Mágico y Precio Mágico no están disponibles por ahora. Intenta más tarde.',
      });
    }

    if (!hasAiFeatures(plan) || !limit) {
      return res.status(403).json({
        message: 'Tu licencia no incluye Inventario Mágico ni Precio Mágico.',
        aiEnabled: false,
        quota: await readQuota(req.tenant),
      });
    }

    const text = String(req.body?.text || '').trim().slice(0, 8000);
    const images = cleanImages(req.body);
    if (!text && !images.length) {
      return res.status(400).json({ message: 'Pega la lista de precios o sube una foto.' });
    }

    const reserved = await db.ReserveAiUse(tenantId, limit);
    if (!reserved) {
      const current = await readQuota(req.tenant);
      return res.status(429).json({
        message: `Ya usaste las ${limit} actualizaciones de este mes. Se reinician el día 1.`,
        quota: current,
      });
    }
    charged = true;

    const extracted = await gemini.extractPrices({
      text: text || '(sin texto, usa la imagen)',
      images,
    });
    const found = gemini.flagRepeats(extractedItems(extracted));
    const items = reconcileLines(found.items, extracted);
    const repeats = found.repeats;
    const supplier = await matchSupplier(tenantId, extracted?.supplier);

    if (!items.length) {
      await db.RefundAiUse(tenantId);
      charged = false;
      return res.status(200).json({
        charged: false,
        matches: [],
        choose: [],
        unknown: [],
        supplier,
        quota: await readQuota(req.tenant),
        message: 'No encontré productos. Una nota como "15 cocas de 600" también sirve. Este intento no se descontó.',
      });
    }

    const foods = await db.GetFoods(tenantId);
    const lastCosts = await db.GetBulkLastCosts(tenantId, foods.map((f) => String(f.id)));
    const matched = magic.enrichCostAlerts(magic.matchItems(items, foods), lastCosts);
    return res.status(200).json({
      charged: true,
      ...matched,
      repeats,
      totals: checkTotals(items, extracted),
      supplier,
      quota: quotaPayload(plan, reserved.used, limit),
    });
  } catch (err) {
    if (charged) {
      await db.RefundAiUse(tenantId).catch(() => {});
    }
    const status =
      err.status ||
      (err.code === 'GEMINI_NOT_CONFIGURED' ? 503 : err.code === 'GEMINI_TIMEOUT' ? 504 : 502);
    console.error(err);
    const message =
      err.code === 'GEMINI_NOT_CONFIGURED'
        ? 'Inventario Mágico y Precio Mágico no están disponibles por ahora. Intenta más tarde.'
        : err.message || 'No pude leer la lista. Intenta de nuevo.';
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      message,
      quota: await readQuota(req.tenant).catch(() => null),
    });
  }
}

async function apply(req, res) {
  try {
    if (!hasAiFeatures(req.tenant?.plan)) {
      return res.status(403).json({ message: 'Tu licencia no incluye Inventario Mágico ni Precio Mágico.' });
    }
    const updates = Array.isArray(req.body?.updates) ? req.body.updates.slice(0, 200) : [];
    const creates = Array.isArray(req.body?.creates) ? req.body.creates.slice(0, 80) : [];
    if (!updates.length && !creates.length) {
      return res.status(400).json({ message: 'No hay nada para guardar.' });
    }

    const purchaseMeta = req.body?.purchase && typeof req.body.purchase === 'object' ? req.body.purchase : {};
    const docDate = cleanDay(purchaseMeta.date) || todayYmd();
    const docExpiry = cleanDay(purchaseMeta.expiresAt);

    let changed = 0;
    const createdRows = [];
    const purchaseLines = [];

    if (creates.length) {
      try {
        await limits.assertProductRoom(req.tenantId, req.tenant?.plan || 'basic', creates.length);
      } catch (limitErr) {
        if (limits.sendLimit(res, limitErr)) return;
        throw limitErr;
      }
    }

    for (const row of creates) {
      const name = String(row?.name || '').trim();
      const menuId = String(row?.menuId || '').trim();
      const price = validMoney(row?.price);
      if (!name || !menuId || price == null || price <= 0) continue;

      const menu = await db.GetMenuById(menuId, req.tenantId);
      if (!menu) continue;

      const cost = validMoney(row?.cost) || 0;
      const code = String(row?.barcode || '').trim();
      const stockIn = Math.max(0, Math.floor(Number(row?.stockIn ?? row?.stock) || 0));
      const expiresAt = cleanDay(row?.expiresAt) || docExpiry;
      const createdFood = await db.CreateFood({
        name,
        price,
        cost,
        priceIncludesTax: true,
        description: '',
        imgUrl: '',
        sku: code,
        barcode: code,
        menuId,
        tenantId: req.tenantId,
        stock: 0,
        tracksExpiry: Boolean(expiresAt),
        supplierIds: [],
      });
      createdRows.push(createdFood);
      if (cost > 0 && createdFood?.id && stockIn <= 0) {
        await db.SaveCostSnapshot(req.tenantId, createdFood.id, cost, 'magic_prices').catch(() => {});
      }
      if (stockIn > 0 && createdFood?.id) {
        purchaseLines.push({
          foodId: String(createdFood.id),
          quantity: stockIn,
          unitCost: cost,
          lot: String(row?.lot || purchaseMeta.lot || '').trim(),
          expiresAt,
        });
      }
    }

    for (const row of updates) {
      if (!row?.id) continue;
      const food = await db.GetFoodById(row.id, req.tenantId);
      if (!food) continue;
      const stockIn = Math.max(0, Math.floor(Number(row.stockIn) || 0));
      const patch = {};
      const price = validMoney(row.price);
      const cost = validMoney(row.cost);
      if (price != null && row.price !== '' && row.price != null) patch.price = price;
      if (stockIn <= 0 && cost != null && row.cost !== '' && row.cost != null) patch.cost = cost;
      if (Object.keys(patch).length) {
        await db.UpdateFood(row.id, patch, req.tenantId);
        changed += 1;
        if (patch.cost != null && patch.cost !== Number(food.cost || 0)) {
          await db.SaveCostSnapshot(req.tenantId, row.id, patch.cost, 'magic_prices').catch(() => {});
        }
      }
      if (stockIn > 0) {
        purchaseLines.push({
          foodId: String(row.id),
          quantity: stockIn,
          unitCost: cost != null ? cost : Number(food.cost) || 0,
          lot: String(row.lot || purchaseMeta.lot || '').trim(),
          expiresAt: cleanDay(row.expiresAt) || docExpiry,
        });
        if (!Object.keys(patch).length) changed += 1;
      }
    }

    let purchase = null;
    let stockAdded = 0;
    if (purchaseLines.length) {
      purchase = await inventory.confirmPurchase({
        tenantId: req.tenantId,
        user: req.user,
        body: {
          supplierId: String(purchaseMeta.supplierId || '').trim(),
          supplier: {
            id: String(purchaseMeta.supplierId || '').trim(),
            name: String(purchaseMeta.name || purchaseMeta.supplierName || '').trim() || DEFAULT_MAGIC_SUPPLIER,
            contact: String(purchaseMeta.contact || '').trim(),
            whatsapp: String(purchaseMeta.whatsapp || '').replace(/\D/g, '').slice(0, 15),
            source: 'magic',
          },
          date: docDate,
          notes: String(purchaseMeta.notes || 'Inventario Mágico').trim(),
          items: purchaseLines,
        },
        options: {
          source: 'magic',
          inheritExpiry: Boolean(docExpiry),
          expiryFallback: docExpiry || undefined,
        },
      });
      stockAdded = purchaseLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    }

    const created = createdRows.length;
    const parts = [];
    if (changed) parts.push(`${changed} ${changed === 1 ? 'producto actualizado' : 'productos actualizados'}`);
    if (created) parts.push(`${created} ${created === 1 ? 'producto nuevo' : 'productos nuevos'}`);
    if (stockAdded) parts.push(`+${stockAdded} ${stockAdded === 1 ? 'pieza' : 'piezas'} al inventario`);
    if (purchase) parts.push(`compra de ${purchase.supplierName}`);

    return res.status(200).json({
      changed,
      created,
      stockAdded,
      purchaseId: purchase?.id || null,
      supplierId: purchase?.supplierId || null,
      message: parts.length ? `Listo. ${parts.join(' · ')}.` : 'No guardé ningún cambio.',
    });
  } catch (err) {
    console.error(err);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    return res.status(status).json({ message: err.message || 'No pude guardar los cambios.' });
  }
}

module.exports = {
  quota,
  preview,
  apply,
  cleanImages,
  reconcileLines,
  checkTotals,
};
