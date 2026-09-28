const db = require('../database/mongodb');
const { planAiQuota } = require('../services/plans.catalog');
const gemini = require('../services/gemini.service');
const magic = require('../services/magic-inventory.service');
const limits = require('../services/plan-limits.service');

const PLAN_NAMES = { basic: 'Básico', growth: 'Crecimiento', pro: 'Pro' };
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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

function cleanImage(body) {
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

function validMoney(value) {
  const n = magic.roundPrice(value);
  return Number.isFinite(n) && n >= 0 && n <= 999999 ? n : null;
}

async function quota(req, res) {
  try {
    return res.status(200).json(await readQuota(req.tenant));
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
        message: 'Inventario Mágico no está disponible por ahora. Intenta más tarde.',
      });
    }

    const text = String(req.body?.text || '').trim().slice(0, 8000);
    const image = cleanImage(req.body);
    if (!text && !image) {
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

    const items = await gemini.extractPrices({
      text,
      imageBase64: image?.imageBase64,
      mimeType: image?.mimeType,
    });

    if (!items.length) {
      await db.RefundAiUse(tenantId);
      charged = false;
      return res.status(200).json({
        charged: false,
        matches: [],
        choose: [],
        unknown: [],
        quota: await readQuota(req.tenant),
        message: 'No encontré productos. Una nota como "15 cocas de 600" también sirve. Este intento no se descontó.',
      });
    }

    const foods = await db.GetFoods(tenantId);
    const matched = magic.matchItems(items, foods);
    return res.status(200).json({
      charged: true,
      ...matched,
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
        ? 'Inventario Mágico no está disponible por ahora. Intenta más tarde.'
        : err.message || 'No pude leer la lista. Intenta de nuevo.';
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      message,
      quota: await readQuota(req.tenant).catch(() => null),
    });
  }
}

async function apply(req, res) {
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates.slice(0, 200) : [];
    const creates = Array.isArray(req.body?.creates) ? req.body.creates.slice(0, 80) : [];
    if (!updates.length && !creates.length) {
      return res.status(400).json({ message: 'No hay nada para guardar.' });
    }

    let changed = 0;
    let stockAdded = 0;

    for (const row of updates) {
      if (!row?.id) continue;
      const patch = {};
      const price = validMoney(row.price);
      const cost = validMoney(row.cost);
      if (price != null && row.price !== '' && row.price != null) patch.price = price;
      if (cost != null && row.cost !== '' && row.cost != null) patch.cost = cost;
      const food = await db.GetFoodById(row.id, req.tenantId);
      if (!food) continue;
      if (Object.keys(patch).length) {
        await db.UpdateFood(row.id, patch, req.tenantId);
        changed += 1;
      }
      const add = Math.max(0, Math.floor(Number(row.stockIn) || 0));
      if (add > 0) {
        await db.IncrementFoodStock(row.id, add, req.tenantId);
        stockAdded += add;
        if (!Object.keys(patch).length) changed += 1;
      }
    }

    let created = 0;
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
      const stock = Math.max(0, Math.floor(Number(row?.stockIn ?? row?.stock) || 0));
      await db.CreateFood({
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
        stock,
      });
      created += 1;
      stockAdded += stock;
    }

    if (stockAdded > 0) {
      try {
        const settings = await db.GetSettings(req.tenantId);
        if (settings && !settings.inventoryEnabled) {
          await db.UpdateSettings({ inventoryEnabled: true }, req.tenantId);
        }
      } catch (_) {
        /* best-effort */
      }
    }

    const parts = [];
    if (changed) parts.push(`${changed} ${changed === 1 ? 'producto actualizado' : 'productos actualizados'}`);
    if (created) parts.push(`${created} ${created === 1 ? 'producto nuevo' : 'productos nuevos'}`);
    if (stockAdded) parts.push(`+${stockAdded} ${stockAdded === 1 ? 'pieza' : 'piezas'} al inventario`);

    return res.status(200).json({
      changed,
      created,
      stockAdded,
      message: parts.length ? `Listo. ${parts.join(' · ')}.` : 'No guardé ningún cambio.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'No pude guardar los cambios.' });
  }
}

module.exports = {
  quota,
  preview,
  apply,
  invoiceScan,
  invoiceApply,
};

/** ── Lector Mágico de Facturas ── */
const INVOICE_PROMPT_EXTRA = `
CONTEXTO: Esto es una NOTA DE REMISIÓN o FACTURA de un proveedor.
Los montos son COSTOS DE COMPRA (cost), NO precios de venta.
Extrae cada producto con su costo de compra por línea.
Si ves un total por renglón, ponlo en cost.
Si hay cantidad, ponla en packs.
El price (venta) déjalo en 0 — solo nos importa el costo de compra.`;

async function invoiceScan(req, res) {
  const tenantId = req.tenantId;
  const plan = req.tenant?.plan || 'basic';
  const limit = planAiQuota(plan);
  let charged = false;

  try {
    if (!gemini.hasGeminiConfig()) {
      return res.status(503).json({ message: 'Gemini no está configurado.' });
    }

    const text = String(req.body?.text || '').trim().slice(0, 8000);
    const image = cleanImage(req.body);
    if (!text && !image) {
      return res.status(400).json({ message: 'Sube la foto de la nota o factura.' });
    }

    const reserved = await db.ReserveAiUse(tenantId, limit);
    if (!reserved) {
      const current = await readQuota(req.tenant);
      return res.status(429).json({
        message: `Límite mensual alcanzado (${limit}). Se reinicia el día 1.`,
        quota: current,
      });
    }
    charged = true;

    const items = await gemini.extractPrices({
      text: `${INVOICE_PROMPT_EXTRA}\n\n${text || '(sin texto, usa la imagen)'}`,
      imageBase64: image?.imageBase64,
      mimeType: image?.mimeType,
    });

    if (!items.length) {
      await db.RefundAiUse(tenantId);
      charged = false;
      return res.status(200).json({
        charged: false,
        results: [],
        quota: await readQuota(req.tenant),
        message: 'No encontré productos en la factura. Intenta con otra foto más clara.',
      });
    }

    const foods = await db.GetFoods(tenantId);
    const foodIds = foods.map(f => String(f.id));
    const lastCosts = await db.GetBulkLastCosts(tenantId, foodIds);

    const results = [];
    for (const raw of items) {
      const item = magic.enrichItem(raw);
      const barcode = String(item.barcode || '').replace(/\s/g, '');

      let match = null;
      if (barcode) {
        match = foods.find(f => (f.barcode || f.sku) === barcode);
      }
      if (!match) {
        let bestScore = 0;
        for (const f of foods) {
          const s = magic.scoreName(item.name, f.name);
          if (s > bestScore && s >= 0.55) {
            bestScore = s;
            match = f;
          }
        }
      }

      const newCost = item.cost > 0 ? item.cost : 0;
      if (!match) {
        results.push({
          type: 'new',
          extractedName: item.name,
          newCost,
          packs: item.packs,
          packSize: item.packSize,
          stockIn: item.stockIn,
        });
        continue;
      }

      const foodId = String(match.id);
      const currentCost = Number(match.cost) || 0;
      const currentPrice = Number(match.price) || 0;
      const lastSnap = lastCosts[foodId];
      const previousCost = lastSnap ? lastSnap.cost : currentCost;

      const costChanged = newCost > 0 && Math.abs(newCost - currentCost) >= 0.01;
      const costDelta = costChanged ? newCost - currentCost : 0;
      const costChangePct = costChanged && currentCost > 0
        ? Math.round(((newCost - currentCost) / currentCost) * 100)
        : 0;

      const currentMargin = currentPrice > 0 && currentCost > 0
        ? Math.round(((currentPrice - currentCost) / currentPrice) * 100)
        : null;
      const newMargin = currentPrice > 0 && newCost > 0
        ? Math.round(((currentPrice - newCost) / currentPrice) * 100)
        : null;

      const TARGET_MARGIN = 0.30;
      const suggestedPrice = newCost > 0
        ? Math.ceil(newCost / (1 - TARGET_MARGIN))
        : null;

      results.push({
        type: 'matched',
        foodId,
        name: match.name,
        extractedName: item.name,
        barcode: barcode || match.barcode || '',
        currentCost,
        newCost: newCost || currentCost,
        previousCost,
        costChanged,
        costDelta,
        costChangePct,
        currentPrice,
        currentMargin,
        newMargin,
        suggestedPrice,
        packs: item.packs,
        packSize: item.packSize,
        stockIn: item.stockIn,
        lastCostDate: lastSnap?.at || null,
      });
    }

    return res.status(200).json({
      charged: true,
      results,
      quota: quotaPayload(plan, reserved.used, limit),
    });
  } catch (err) {
    if (charged) await db.RefundAiUse(tenantId).catch(() => {});
    const status = err.status || (err.code === 'GEMINI_TIMEOUT' ? 504 : 502);
    console.error(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      message: err.message || 'No pude leer la factura.',
      quota: await readQuota(req.tenant).catch(() => null),
    });
  }
}

async function invoiceApply(req, res) {
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates.slice(0, 200) : [];
    if (!updates.length) {
      return res.status(400).json({ message: 'No hay cambios para guardar.' });
    }

    let costUpdated = 0;
    let priceUpdated = 0;
    let stockAdded = 0;

    for (const row of updates) {
      if (!row?.foodId) continue;
      const food = await db.GetFoodById(row.foodId, req.tenantId);
      if (!food) continue;

      const patch = {};
      const newCost = magic.roundPrice(row.newCost);
      if (newCost > 0 && newCost !== Number(food.cost || 0)) {
        patch.cost = newCost;
        costUpdated += 1;
        await db.SaveCostSnapshot(req.tenantId, row.foodId, newCost, 'invoice_scan');
      }
      if (row.newPrice != null) {
        const newPrice = magic.roundPrice(row.newPrice);
        if (newPrice > 0 && newPrice !== Number(food.price || 0)) {
          patch.price = newPrice;
          priceUpdated += 1;
        }
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.UpdateFood(row.foodId, patch, req.tenantId);
      }
      const add = Math.max(0, Math.floor(Number(row.stockIn) || 0));
      if (add > 0) {
        await db.IncrementFoodStock(row.foodId, add, req.tenantId);
        stockAdded += add;
      }
    }

    const parts = [];
    if (costUpdated) parts.push(`${costUpdated} costo(s) actualizado(s)`);
    if (priceUpdated) parts.push(`${priceUpdated} precio(s) de venta ajustado(s)`);
    if (stockAdded) parts.push(`+${stockAdded} pieza(s) al inventario`);

    return res.status(200).json({
      costUpdated,
      priceUpdated,
      stockAdded,
      message: parts.length ? `Listo. ${parts.join(' · ')}.` : 'No se guardó ningún cambio.',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'No pude guardar los cambios de la factura.' });
  }
}
