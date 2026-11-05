/**
 * Quitar de las TIENDAS el precio (y el costo) que les llegó del catálogo maestro por error.
 * Regla segura: solo se toca un producto si la tienda no lo ha vendido nunca y su precio sigue igual al del catálogo
 * (si lo cambió, es decisión suya). El costo se quita solo si tampoco lo cambió. Compara contra el catálogo maestro,
 * así que hay que hacerlo ANTES de quitar los precios del propio catálogo.
 */
const { httpError } = require('../utils/http-error');
const { assertCatalog } = require('./master-catalog-admin.service');

const WORD = 'QUITAR';
const cents = (n) => Math.round(Number(n || 0) * 100);

/** Qué se quitaría (sin cambiar nada). */
async function plan(db, catalog) {
  assertCatalog(catalog);
  const master = new Map((await db.ListCatalogItems(catalog)).map((i) => [String(i.key), i]));
  const totals = { stores: 0, products: 0, prices: 0, costs: 0, sold: 0, changed: 0 };
  const stores = [];
  for (const tenant of await db.ListTenants({ includeBranches: true })) {
    const tenantId = String(tenant.id);
    const foods = (await db.GetFoods(tenantId)).filter((f) => f.catalogId && master.has(String(f.catalogId)));
    let sold = null;
    const changes = [];
    for (const food of foods) {
      const item = master.get(String(food.catalogId));
      if (!(Number(item.price) > 0)) continue; // el catálogo ya no trae precio: no hay con qué comparar
      if (food.needsPrice || !(Number(food.price) > 0)) continue; // ya está sin precio
      if (cents(food.price) !== cents(item.price)) {
        totals.changed += 1; // la tienda cambió el precio: no se toca
        continue;
      }
      if (!sold) {
        const refs = await db.ListSoldRefs(tenantId);
        sold = { ids: new Set(refs.ids), names: new Set(refs.names) };
      }
      if (sold.ids.has(String(food.id)) || sold.names.has(String(food.name || '').toLowerCase())) {
        totals.sold += 1; // ya se vendió: no se toca
        continue;
      }
      const clearCost = Number(item.cost) > 0 && Number(food.cost) > 0 && cents(food.cost) === cents(item.cost);
      changes.push({ id: String(food.id), name: food.name, clearCost });
    }
    if (!changes.length) continue;
    const settings = await db.GetSettings(tenantId).catch(() => null);
    stores.push({ tenantId, name: settings?.businessName || tenant.name || 'Tienda', products: changes.length, costs: changes.filter((c) => c.clearCost).length, changes });
    totals.stores += 1;
    totals.products += changes.length;
    totals.prices += changes.length;
    totals.costs += changes.filter((c) => c.clearCost).length;
  }
  return { totals, stores };
}

/** Vista previa para mostrar: sin la lista completa de productos. */
async function preview(db, catalog) {
  const { totals, stores } = await plan(db, catalog);
  const brief = stores.map((s) => ({ tenantId: s.tenantId, name: s.name, products: s.products, costs: s.costs }));
  return { totals, stores: brief.sort((a, b) => b.products - a.products).slice(0, 30) };
}

async function apply(db, catalog, confirm) {
  assertCatalog(catalog);
  if (String(confirm || '').trim().toUpperCase() !== WORD) throw httpError(400, `Para quitar los precios en las tiendas escribe ${WORD}.`);
  const { totals, stores } = await plan(db, catalog);
  for (const store of stores) {
    for (const change of store.changes) {
      await db.UpdateFood(change.id, { price: 0, needsPrice: true, ...(change.clearCost ? { cost: 0 } : {}) }, store.tenantId);
    }
    try {
      await db.CreateActivityLog({
        tenantId: store.tenantId,
        type: 'catalog_prices_removed',
        message: `Se quitó el precio de ${store.products} productos que llegaron del catálogo con un precio por error. Ponles el tuyo para venderlos.`,
        meta: { products: store.products, costs: store.costs },
        user: 'plataforma',
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[bitácora]', e.message);
    }
  }
  return { totals };
}

module.exports = { plan, preview, apply };
