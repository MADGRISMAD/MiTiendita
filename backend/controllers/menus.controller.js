const db = require('../database/mongodb');
const recipes = require('../services/recipe.service');
const { roundQty, saleUnitOf } = require('../utils/units');
const limits = require('../services/plan-limits.service');
const { seedStarterCatalog, starterProductCount } = require('../services/starter-catalog.service');
const { ObjectId } = require('mongodb');

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

// Una categoría es para vender al público o de insumos (materia prima para preparar, no sale en la caja)
const MENU_KINDS = ['sale', 'supplies'];
const menuKindOf = (v) => (MENU_KINDS.includes(v) ? v : 'sale');

/** Lo que cambia en un producto según su categoría: en una de insumos es materia prima. */
async function supplyFieldsFor(menuId, tenantId) {
  if (!menuId) return {};
  const menu = await db.GetMenuLite(String(menuId), tenantId).catch(() => null);
  if (!menu) return {};
  return { isIngredient: menu.kind === 'supplies' };
}

async function createMenu(req, res) {
  try {
    const { name, description, kind } = req.body || {};
    if (!name) return res.status(400).send('name es requerido');
    const created = await db.CreateMenu({
      name,
      description: description || '',
      kind: menuKindOf(kind),
      tenantId: req.tenantId,
    });
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al crear menú');
  }
}

async function updateMenu(req, res) {
  try {
    const body = { ...(req.body || {}) };
    delete body.tenantId;
    delete body._id;
    if (body.kind !== undefined) body.kind = menuKindOf(body.kind);
    const updated = await db.UpdateMenu(req.params.id, body, req.tenantId);
    if (!updated) return res.status(404).send('Menú no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al actualizar menú');
  }
}

async function deleteMenu(req, res) {
  try {
    const result = await db.DeleteMenu(req.params.id, req.tenantId);
    if (!result || result.deletedCount === 0) {
      return res.status(404).send('Menú no encontrado');
    }
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
    const created = await db.CreateFood({
      name,
      price: Number(price),
      cost: cost == null || cost === '' ? 0 : Math.max(0, Number(cost) || 0),
      priceIncludesTax: Boolean(priceIncludesTax),
      description: description || '',
      imgUrl: imgUrl || '',
      sku: code,
      barcode: code,
      menuId: String(menuId),
      tenantId: req.tenantId,
      stock: stock == null || stock === '' ? 0 : Math.max(0, roundQty(stock)),
      lowStockThreshold: lowStockThreshold == null || lowStockThreshold === '' ? 5 : Math.max(0, Number(lowStockThreshold) || 5),
      tracksExpiry: Boolean(tracksExpiry),
      supplierIds: sanitizeSupplierIds(supplierIds),
      saleUnit: saleUnitOf(saleUnit),
      // Cafetería: insumo (materia prima) o bebida con receta, tamaños y extras
      ...recipes.sanitizeRecipeFields(req.body || {}),
      // En una categoría de insumos todo es materia prima
      ...(await supplyFieldsFor(menuId, req.tenantId)),
    });
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
    Object.assign(body, recipes.sanitizeRecipeFields(body));
    if (body.menuId != null) Object.assign(body, await supplyFieldsFor(body.menuId, req.tenantId));
    const updated = await db.UpdateFood(req.params.id, body, req.tenantId);
    if (!updated) return res.status(404).send('Producto no encontrado');
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al actualizar producto');
  }
}

async function deleteFood(req, res) {
  try {
    const result = await db.DeleteFood(req.params.id, req.tenantId);
    if (!result || result.deletedCount === 0) {
      return res.status(404).send('Platillo no encontrado');
    }
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

async function seedStarter(req, res) {
  try {
    const existing = await db.CountFoods(req.tenantId);
    if (existing > 0) {
      return res.status(409).send('Ya tienes productos. El catálogo de ejemplo solo se carga en una tienda vacía.');
    }
    try {
      await limits.assertProductRoom(
        req.tenantId,
        req.tenant?.plan || 'basic',
        starterProductCount()
      );
    } catch (limitErr) {
      if (limits.sendLimit(res, limitErr)) return;
      throw limitErr;
    }
    const created = await seedStarterCatalog(db, req.tenantId);
    const settings = await db.GetSettings(req.tenantId);
    if (settings) {
      await db.UpdateSettings({ starterSeeded: true, updatedAt: new Date() }, req.tenantId);
    }
    return res.status(201).json({ ok: true, ...created });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al cargar el catálogo de ejemplo');
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

module.exports = {
  listMenus,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
  listFoods,
  getFood,
  lookupFood,
  createFood,
  updateFood,
  deleteFood,
  seedStarter,
  lowStockFoods,
  searchFoods,
};
