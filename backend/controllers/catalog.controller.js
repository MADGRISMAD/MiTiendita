const db = require('../database/mongodb');
const limits = require('../services/plan-limits.service');
const catalog = require('../services/master-catalog.service');

const MAX_PER_REQUEST = 250;
const MAX_PRICE = 1_000_000;

const norm = (s) => String(s || '').trim().toLowerCase();

async function notForThisGiro(req, res) {
  const settings = await db.GetSettings(req.tenantId);
  if (catalog.availableFor(settings?.businessType)) return false;
  res.status(403).json({
    code: 'GIRO_NOT_SUPPORTED',
    message: 'El catálogo maestro es para abarrotes, tiendas de conveniencia y comercios de alimentos.',
  });
  return true;
}

/** Los productos de la tienda que ya vienen de este catálogo (por id o por código). */
function alreadyInStore(foods) {
  return new Set(foods.flatMap((f) => [f.catalogId, f.barcode, f.sku]).filter(Boolean).map(String));
}

/** Todo el catálogo, marcando lo que la tienda ya tiene. Son ~180 productos: se filtra en el navegador. */
async function list(req, res) {
  try {
    if (await notForThisGiro(req, res)) return;
    const have = alreadyInStore(await db.GetFoods(req.tenantId));
    return res.status(200).json({
      sections: catalog.SECTIONS,
      items: catalog.ITEMS.map((item) => ({ ...item, added: have.has(item.id) || have.has(item.code) })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al cargar el catálogo maestro');
  }
}

/**
 * Agrega productos del catálogo a la tienda. Cada uno lleva el precio que le pone el dueño.
 * Body: { items: [{ id, price }], menuId? }. Sin menuId, cada producto va a la categoría de su sección
 * (se crea si no existe). Lo que la tienda ya tiene se omite.
 */
async function add(req, res) {
  try {
    if (await notForThisGiro(req, res)) return;
    const { items, menuId } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).send('Elige al menos un producto.');
    if (items.length > MAX_PER_REQUEST) return res.status(400).send(`Máximo ${MAX_PER_REQUEST} productos por vez.`);

    const chosen = new Map();
    for (const row of items) {
      const item = catalog.find(row?.id);
      if (!item) return res.status(400).send('Hay un producto que no está en el catálogo.');
      const price = Math.round(Number(row.price) * 100) / 100;
      if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
        return res.status(400).send(`Falta el precio de «${catalog.productName(item)}».`);
      }
      chosen.set(item.id, { item, price });
    }

    let target = null;
    if (menuId) {
      target = await db.GetMenuById(menuId, req.tenantId);
      if (!target) return res.status(400).send('Esa categoría no existe.');
    }

    const have = alreadyInStore(await db.GetFoods(req.tenantId));
    const toCreate = [...chosen.values()].filter(({ item }) => !have.has(item.id) && !have.has(item.code));
    const skipped = chosen.size - toCreate.length;
    if (!toCreate.length) return res.status(200).json({ created: 0, skipped, menusCreated: 0 });

    try {
      await limits.assertProductRoom(req.tenantId, req.tenant?.plan || 'basic', toCreate.length);
    } catch (limitErr) {
      if (limits.sendLimit(res, limitErr)) return;
      throw limitErr;
    }

    const menus = new Map((await db.GetMenus(req.tenantId)).map((m) => [norm(m.name), m]));
    let menusCreated = 0;
    const menuFor = async (section) => {
      if (target) return target;
      let menu = menus.get(norm(section));
      if (!menu) {
        menu = await db.CreateMenu({ name: section, description: '', tenantId: req.tenantId, fromCatalog: true });
        menus.set(norm(section), menu);
        menusCreated += 1;
      }
      return menu;
    };

    for (const { item, price } of toCreate) {
      const menu = await menuFor(item.section);
      await db.CreateFood(catalog.toFood(item, { price, menuId: menu.id, tenantId: req.tenantId }));
    }
    return res.status(201).json({ created: toCreate.length, skipped, menusCreated });
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message || 'Error al agregar productos del catálogo');
  }
}

module.exports = { list, add };
