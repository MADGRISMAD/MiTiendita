const db = require('../database/mongodb');
const { cleanAltCodes } = require('../utils/barcode');
const { roundQty, saleUnitOf } = require('../utils/units');
const limits = require('../services/plan-limits.service');
const { ObjectId } = require('mongodb');
const barcodeLookup = require('../services/barcode-lookup.service');
const saleAudit = require('../services/sale-audit.service');
const { sanitizePriceRows, MAX_ROWS } = require('../services/bulk-prices.service');

/** Bitácora del catálogo: nunca debe tumbar el guardado. */
async function logCatalog(entries) {
  try {
    await Promise.all([].concat(entries).filter(Boolean).map((e) => db.CreateActivityLog(e)));
  } catch (e) {
    console.error('[bitácora]', e.message);
  }
}

function sanitizeSupplierIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter((id) => ObjectId.isValid(id)))];
}

async function listMenus(req, res) {
  try {
    return res.status(200).json(await db.GetMenus(req.tenantId));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar menús');
  }
}

async function getMenu(req, res) {
  try {
    const menu = await db.GetMenuById(req.params.id, req.tenantId);
    if (!menu) return res.status(404).send('Menú no encontrado');
    return res.status(200).json(menu);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener menú');
  }
}

async function createMenu(req, res) {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).send('name es requerido');
    const created = await db.CreateMenu({
      name,
      description: description || '',
      tenantId: req.tenantId,
    });
    await logCatalog(saleAudit.menuEntry({ tenantId: req.tenantId, user: req.user?.username, kind: 'created', menu: created }));
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al crear menú');
  }
}

async function updateMenu(req, res) {
  try {
    const before = await db.GetMenuById(req.params.id, req.tenantId).catch(() => null);
    const updated = await db.UpdateMenu(req.params.id, req.body || {}, req.tenantId);
    if (!updated) return res.status(404).send('Menú no encontrado');
    if (before && updated.name !== before.name) {
      await logCatalog(saleAudit.menuEntry({ tenantId: req.tenantId, user: req.user?.username, kind: 'renamed', menu: updated, from: before }));
    }
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al actualizar menú');
  }
}

async function deleteMenu(req, res) {
  try {
    const menu = await db.GetMenuById(req.params.id, req.tenantId).catch(() => null);
    const productCount = menu ? (await db.GetFoods(req.tenantId)).filter((f) => String(f.menuId) === String(menu.id)).length : 0;
    const result = await db.DeleteMenu(req.params.id, req.tenantId);
    if (!result || result.deletedCount === 0) {
      return res.status(404).send('Menú no encontrado');
    }
    await logCatalog(saleAudit.menuEntry({ tenantId: req.tenantId, user: req.user?.username, kind: 'deleted', menu: menu || { id: req.params.id }, productCount }));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al eliminar menú');
  }
}

async function listFoods(req, res) {
  try {
    return res.status(200).json(await db.GetFoods(req.tenantId));
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al listar platillos');
  }
}

async function getFood(req, res) {
  try {
    const food = await db.GetFoodById(req.params.id, req.tenantId);
    if (!food) return res.status(404).send('Platillo no encontrado');
    return res.status(200).json(food);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al obtener platillo');
  }
}

async function createFood(req, res) {
  try {
    const {
      name,
      price,
      cost,
      description,
      imgUrl,
      menuId,
      sku,
      barcode,
      priceIncludesTax,
      stock,
      lowStockThreshold,
      tracksExpiry,
      supplierIds,
      saleUnit,
      altCodes,
    } = req.body || {};
    if (!name || price == null || !menuId) {
      return res.status(400).send('name, price y menuId son requeridos');
    }
    try {
      await limits.assertProductRoom(req.tenantId, req.tenant?.plan || 'basic', 1);
    } catch (limitErr) {
      if (limits.sendLimit(res, limitErr)) return;
      throw limitErr;
    }
    const code = String(barcode || sku || '').trim();
    if (code) {
      const existing = await db.GetFoodByBarcode(code, req.tenantId).catch(() => null);
      if (existing) {
        return res.status(409).send(`Ya existe un producto con el código "${code}": ${existing.name}`);
      }
    }
    const extra = cleanAltCodes(altCodes, code);
    for (const alt of extra) {
      const clash = await db.GetFoodByBarcode(alt, req.tenantId).catch(() => null);
      if (clash) return res.status(409).send(`Ya existe un producto con el código "${alt}": ${clash.name}`);
    }
    const created = await db.CreateFood({
      name,
      price: Number(price),
      cost: cost == null || cost === '' ? 0 : Math.max(0, Number(cost) || 0),
      priceIncludesTax: Boolean(priceIncludesTax),
      description: description || '',
      imgUrl: imgUrl || '',
      sku: code,
      barcode: code,
      altCodes: extra,
      menuId: String(menuId),
      tenantId: req.tenantId,
      stock: stock == null || stock === '' ? 0 : Math.max(0, roundQty(stock)),
      lowStockThreshold: lowStockThreshold == null || lowStockThreshold === '' ? 5 : Math.max(0, Number(lowStockThreshold) || 5),
      tracksExpiry: Boolean(tracksExpiry),
      supplierIds: sanitizeSupplierIds(supplierIds),
      saleUnit: saleUnitOf(saleUnit),
    });
    await logCatalog(saleAudit.foodCreatedEntry({ tenantId: req.tenantId, user: req.user?.username, food: created }));
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al crear producto');
  }
}

async function updateFood(req, res) {
  try {
    const body = { ...(req.body || {}) };
    // El producto no puede cambiar de tienda
    delete body.tenantId;
    delete body._id;
    if (body.barcode != null || body.sku != null) {
      const code = String(body.barcode || body.sku || '').trim();
      body.sku = code;
      body.barcode = code;
      if (code) {
        // Mismo código en otro producto de la tienda: se cobraría el equivocado
        const existing = await db.GetFoodByBarcode(code, req.tenantId).catch(() => null);
        if (existing && String(existing.id) !== String(req.params.id)) {
          return res.status(409).send(`Ya existe un producto con el código "${code}": ${existing.name}`);
        }
      }
    }
    if (body.altCodes != null) {
      const main = body.barcode != null ? body.barcode : (await db.GetFoodById(req.params.id, req.tenantId).catch(() => null))?.barcode;
      body.altCodes = cleanAltCodes(body.altCodes, main);
      for (const alt of body.altCodes) {
        const clash = await db.GetFoodByBarcode(alt, req.tenantId).catch(() => null);
        if (clash && String(clash.id) !== String(req.params.id)) {
          return res.status(409).send(`Ya existe un producto con el código "${alt}": ${clash.name}`);
        }
      }
    }
    if (body.priceIncludesTax != null) {
      body.priceIncludesTax = Boolean(body.priceIncludesTax);
    }
    if (body.price != null) body.price = Number(body.price);
    if (body.cost != null && body.cost !== '') {
      body.cost = Math.max(0, Number(body.cost) || 0);
    }
    delete body.trackStock;
    if (body.stock != null && body.stock !== '') {
      body.stock = Math.max(0, roundQty(body.stock));
    }
    if (body.lowStockThreshold != null && body.lowStockThreshold !== '') {
      body.lowStockThreshold = Math.max(0, Number(body.lowStockThreshold) || 5);
    }
    if (body.tracksExpiry != null) body.tracksExpiry = Boolean(body.tracksExpiry);
    if (body.saleUnit != null) body.saleUnit = saleUnitOf(body.saleUnit);
    if (body.supplierIds != null) body.supplierIds = sanitizeSupplierIds(body.supplierIds);
    const before = await db.GetFoodById(req.params.id, req.tenantId).catch(() => null);
    const updated = await db.UpdateFood(req.params.id, body, req.tenantId);
    if (!updated) return res.status(404).send('Producto no encontrado');
    // Bitácora (no debe tumbar el guardado)
    await logCatalog([
      ...saleAudit.priceChangeEntries({ tenantId: req.tenantId, user: req.user?.username, before, after: body }),
      ...saleAudit.foodChangeEntries({ tenantId: req.tenantId, user: req.user?.username, before, after: body }),
    ]);
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al actualizar producto');
  }
}

/** Poner precio (y costo) a muchos productos de una vez. Respeta el tope de productos del plan. */
async function bulkPrices(req, res) {
  try {
    if (Array.isArray(req.body?.items) && req.body.items.length > MAX_ROWS) {
      return res.status(400).send(`Máximo ${MAX_ROWS} productos por envío`);
    }
    const { rows, rejected } = sanitizePriceRows(req.body?.items);
    if (!rows.length) return res.status(400).send('No hay precios válidos que guardar');

    const foods = new Map((await db.GetFoods(req.tenantId)).map((f) => [String(f.id), f]));
    const mine = rows.filter((r) => foods.has(r.id));
    for (const r of rows) if (!foods.has(r.id)) rejected.push({ id: r.id, reason: 'Producto no encontrado' });

    // Un producto sin precio no cuenta para el tope del plan; al ponerle precio, sí
    const newlyPriced = mine.filter((r) => foods.get(r.id).needsPrice).length;
    if (newlyPriced) {
      try {
        await limits.assertProductRoom(req.tenantId, req.tenant?.plan || 'basic', newlyPriced);
      } catch (limitErr) {
        if (limits.sendLimit(res, limitErr)) return;
        throw limitErr;
      }
    }

    let updated = 0;
    for (const r of mine) {
      const before = foods.get(r.id);
      const patch = { price: r.price, ...(r.cost !== undefined ? { cost: r.cost } : {}) };
      if (!(await db.UpdateFood(r.id, patch, req.tenantId))) {
        rejected.push({ id: r.id, reason: 'Producto no encontrado' });
        continue;
      }
      updated += 1;
      // Poner el primer precio no es un «cambio»: solo se registran los cambios sobre un precio que ya existía
      if (!before.needsPrice) {
        const entries = saleAudit.priceChangeEntries({ tenantId: req.tenantId, user: req.user?.username, before, after: patch });
        await Promise.all(entries.map((e) => db.CreateActivityLog(e).catch(() => {})));
      }
    }
    return res.status(200).json({ updated, rejected });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al guardar los precios');
  }
}

async function deleteFood(req, res) {
  try {
    const food = await db.GetFoodById(req.params.id, req.tenantId).catch(() => null);
    const result = await db.DeleteFood(req.params.id, req.tenantId);
    if (!result || result.deletedCount === 0) {
      return res.status(404).send('Platillo no encontrado');
    }
    if (food) await logCatalog(saleAudit.foodDeletedEntry({ tenantId: req.tenantId, user: req.user?.username, food }));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al eliminar platillo');
  }
}

async function lookupFood(req, res) {
  try {
    const code = String(req.query.code || req.query.q || '').trim();
    if (!code) return res.status(400).send('code es requerido');
    const byCode = await db.GetFoodByBarcode(code, req.tenantId);
    if (byCode) return res.status(200).json(byCode);

    const all = await db.GetFoods(req.tenantId);
    const q = code.toLowerCase();
    const matches = (all || []).filter((f) => {
      const name = String(f.name || '').toLowerCase();
      const sku = String(f.sku || f.barcode || '').toLowerCase();
      return sku === q || name.includes(q);
    });
    if (matches.length === 1) return res.status(200).json(matches[0]);
    return res.status(200).json({ matches: matches.slice(0, 12) });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al buscar producto');
  }
}

/** Sugerencia de nombre para un código que no está en la tienda, buscada en línea (Open Food Facts). */
async function lookupOnline(req, res) {
  try {
    return res.status(200).json(await barcodeLookup.lookup(req.query.code));
  } catch (err) {
    console.error(err);
    return res.status(200).json({ found: false, unavailable: true });
  }
}

/** Devuelve productos con stock bajo o igual al umbral mínimo. */
async function lowStockFoods(req, res) {
  try {
    const items = await db.GetLowStockFoods(req.tenantId);
    return res.status(200).json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al consultar stock bajo');
  }
}

/** Busca productos por nombre, barcode o SKU. */
async function searchFoods(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json([]);
    const items = await db.SearchFoods(req.tenantId, q);
    return res.status(200).json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al buscar productos');
  }
}

async function deleteFoodsBulk(req, res) {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).send('ids es requerido (array de IDs)');
    if (ids.length > 500) return res.status(400).send('Máximo 500 productos por envío');
    const result = await db.DeleteFoodsByIds(ids, req.tenantId);
    await logCatalog({
      tenantId: req.tenantId,
      type: 'catalog_bulk_delete',
      message: `Se eliminaron ${result.deletedCount} productos`,
      meta: { count: result.deletedCount },
      user: req.user?.username,
      createdAt: new Date(),
    });
    return res.status(200).json({ deleted: result.deletedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al eliminar productos');
  }
}

async function deleteAllFoods(req, res) {
  try {
    const result = await db.DeleteAllFoods(req.tenantId);
    await logCatalog({
      tenantId: req.tenantId,
      type: 'catalog_wipe',
      message: `Se eliminaron todos los productos (${result.deletedCount}) y sus categorías`,
      meta: { count: result.deletedCount },
      user: req.user?.username,
      createdAt: new Date(),
    });
    return res.status(200).json({ deleted: result.deletedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al eliminar productos');
  }
}

module.exports = {
  lookupOnline,
  listMenus,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  listFoods,
  bulkPrices,
  getFood,
  lookupFood,
  createFood,
  updateFood,
  deleteFood,
  deleteFoodsBulk,
  deleteAllFoods,
  lowStockFoods,
  searchFoods,
};
