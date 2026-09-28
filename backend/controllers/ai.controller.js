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
        message: 'Inventario Mágico y Precio Mágico no están disponibles por ahora. Intenta más tarde.',
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
      text: [
        'Puede ser lista de venta o factura/nota de remisión del proveedor.',
        'Si es factura, los montos van en cost. Si es lista de venta ("a 22"), van en price.',
        text || '(sin texto, usa la imagen)',
      ].join('\n'),
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
    const lastCosts = await db.GetBulkLastCosts(tenantId, foods.map((f) => String(f.id)));
    const matched = magic.enrichCostAlerts(magic.matchItems(items, foods), lastCosts);
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
        if (patch.cost != null && patch.cost !== Number(food.cost || 0)) {
          await db.SaveCostSnapshot(req.tenantId, row.id, patch.cost, 'magic_prices').catch(() => {});
        }
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
        stock,
      });
      created += 1;
      stockAdded += stock;
      if (cost > 0 && createdFood?.id) {
        await db.SaveCostSnapshot(req.tenantId, createdFood.id, cost, 'magic_prices').catch(() => {});
      }
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
};
