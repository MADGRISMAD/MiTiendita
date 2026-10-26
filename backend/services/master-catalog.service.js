/**
 * Catálogos maestros: productos que ya vienen capturados en una tienda nueva, SIN precio. El dueño se lo pone al
 * escanear o buscar el producto por primera vez (la caja se lo pide) y el costo lo carga con la siguiente compra.
 *
 * Hay un catálogo por tipo de negocio (abarrotes, farmacia, ferretería) y lo edita la plataforma desde el panel
 * (ver master-catalog-admin.service.js). El de abarrotes arranca con data/catalogo-maestro.json (181 productos);
 * los demás empiezan vacíos y una tienda de ese giro solo recibe lo que ya tenga cargado.
 *
 * Un producto sin precio lleva `needsPrice: true`: no sale en los mosaicos de la caja, no cuenta para el
 * tope del plan, no se puede vender y el marcador se apaga solo al ponerle precio (utils/needs-price.js).
 */
const data = require('../data/catalogo-maestro.json');

// Qué catálogo usa cada giro. Conveniencia y comercio comparten el de abarrotes (las carnicerías se registran como
// «abarrotes» o «other»). Una tienda sin giro guardado cuenta como abarrotes (es el valor por defecto de la app).
const CATALOG_OF = { abarrotes: 'abarrotes', convenience: 'abarrotes', other: 'abarrotes', pharmacy: 'pharmacy', hardware: 'hardware' };
const CATALOGS = [
  { key: 'abarrotes', label: 'Abarrotes y comercio', giros: ['abarrotes', 'convenience', 'other'] },
  { key: 'pharmacy', label: 'Farmacia / botica', giros: ['pharmacy'] },
  { key: 'hardware', label: 'Ferretería / tlapalería', giros: ['hardware'] },
];

// Marca de «ya se cargó una vez»: así lo que el dueño borra después no vuelve solo.
const VERSION = 1;

const norm = (s) => String(s || '').trim().toLowerCase();

/** Catálogo que le toca a un giro, o null si el giro no tiene (restaurante, bar…). */
function catalogKeyFor(businessType) {
  return CATALOG_OF[businessType || 'abarrotes'] || null;
}

/** Los productos con los que arranca el catálogo de abarrotes (del archivo del proyecto). */
function seedItems() {
  return data.items.map((item) => ({
    catalog: 'abarrotes',
    key: String(item.id),
    section: item.section,
    name: item.name,
    presentation: item.presentation || '',
    code: item.code || '',
    plu: Boolean(item.plu),
    unit: item.unit || 'pz',
    verified: Boolean(item.verified),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/** Al arrancar el servidor: la primera vez, pasa el archivo a la base. Si el equipo la vacía a propósito, no regresa. */
async function ensureSeeded(db) {
  if (await db.IsCatalogSeeded()) return 0;
  const inserted = (await db.CountCatalogItems('abarrotes')) ? 0 : await db.InsertCatalogItems(seedItems());
  await db.MarkCatalogSeeded();
  return inserted;
}

/** Nombre en el POS: producto y presentación. Lo que se pesa se vende por kilo, así que no lleva «1 kg». */
function productName(item) {
  const presentation = String(item.presentation || '').trim();
  if (!presentation) return item.name;
  return item.unit === 'kg' && /^1\s*kg$/i.test(presentation) ? item.name : `${item.name} ${presentation}`;
}

/** Producto de la tienda a partir de uno del catálogo. Sin precio: se lo pone el dueño. */
function toFood(item, { menuId, tenantId }) {
  return {
    name: productName(item),
    price: 0,
    needsPrice: true,
    cost: 0,
    priceIncludesTax: true, // precio de anaquel
    description: '',
    imgUrl: '',
    sku: item.code || '',
    barcode: item.code || '',
    menuId: String(menuId),
    tenantId,
    stock: 0,
    lowStockThreshold: 5,
    tracksExpiry: false,
    supplierIds: [],
    saleUnit: item.unit,
    catalogId: item.key,
  };
}

/** Productos del catálogo que la tienda todavía no tiene (por id o por código). */
async function missingFor(db, tenantId, items) {
  const foods = await db.GetFoods(tenantId);
  const have = new Set(foods.flatMap((f) => [f.catalogId, f.barcode, f.sku]).filter(Boolean).map(String));
  return items.filter((item) => !have.has(item.key) && !(item.code && have.has(item.code)));
}

/**
 * Carga en la tienda los productos del catálogo que todavía no tiene, cada uno en la categoría de su sección, que se
 * crea si no existe. Se puede repetir sin duplicar nada.
 */
async function seed(db, tenantId, catalog) {
  const missing = await missingFor(db, tenantId, await db.ListCatalogItems(catalog));
  if (!missing.length) return { created: 0, menusCreated: 0 };

  const menus = new Map((await db.GetMenus(tenantId)).map((m) => [norm(m.name), m]));
  let menusCreated = 0;
  const docs = [];
  for (const item of missing) {
    let menu = menus.get(norm(item.section));
    if (!menu) {
      menu = await db.CreateMenu({ name: item.section, description: '', tenantId, fromCatalog: true });
      menus.set(norm(item.section), menu);
      menusCreated += 1;
    }
    docs.push(toFood(item, { menuId: menu.id, tenantId }));
  }
  await db.CreateFoods(docs);
  return { created: docs.length, menusCreated };
}

/** Qué catálogo se cargó en la tienda (las que lo recibieron antes de que hubiera varios, el de abarrotes). */
const loadedKeyOf = (settings) => (settings?.masterCatalogVersion != null ? settings.masterCatalogKey || 'abarrotes' : null);

/** Quita lo del catálogo que sigue sin precio (lo que ya tiene precio es del dueño). */
async function clearUnpriced(db, tenantId) {
  const removed = await db.DeleteUnpricedCatalogFoods(tenantId);
  await db.DeleteEmptyCatalogMenus(tenantId);
  return removed;
}

/**
 * Deja el catálogo como corresponde al giro de la tienda: lo carga una sola vez si el giro tiene uno con productos, y
 * si la tienda cambia a un giro con otro catálogo (o sin catálogo) quita lo que siga sin precio del anterior.
 * Quien lo rechazó no lo recibe solo. `settings` son los ajustes ya guardados de la tienda.
 */
async function syncForGiro(db, tenantId, settings) {
  const wanted = catalogKeyFor(settings?.businessType);
  const loaded = loadedKeyOf(settings);
  if (loaded && loaded !== wanted) {
    await clearUnpriced(db, tenantId);
    await db.UpdateSettings({ masterCatalogVersion: null, masterCatalogKey: null }, tenantId);
  }
  if (!wanted || settings?.masterCatalogSkipped) return null;
  if (loaded === wanted) return null;
  if (!(await db.CountCatalogItems(wanted))) return null;
  const result = await seed(db, tenantId, wanted);
  await db.UpdateSettings({ masterCatalogVersion: VERSION, masterCatalogKey: wanted }, tenantId);
  return result;
}

/** Cómo está el catálogo en esta tienda: cuánto trae, cuánto falta y cuánto sigue sin precio. `giro` permite verlo antes de guardar. */
async function status(db, tenantId, settings, giro) {
  const key = catalogKeyFor(giro || settings?.businessType);
  const items = key ? await db.ListCatalogItems(key) : [];
  const missing = items.length ? (await missingFor(db, tenantId, items)).length : 0;
  const foods = await db.GetFoods(tenantId);
  return {
    catalog: key,
    available: items.length > 0,
    total: items.length,
    inStore: items.length - missing,
    missing,
    unpriced: foods.filter((f) => f.catalogId && f.needsPrice).length,
    skipped: Boolean(settings?.masterCatalogSkipped),
  };
}

/** Carga a pedido del dueño (desde Ajustes): solo lo que falta. */
async function load(db, tenantId, settings) {
  const key = catalogKeyFor(settings?.businessType);
  if (!key || !(await db.CountCatalogItems(key))) return null;
  const result = await seed(db, tenantId, key);
  await db.UpdateSettings({ masterCatalogVersion: VERSION, masterCatalogKey: key, masterCatalogSkipped: false }, tenantId);
  return result;
}

/** Quita lo del catálogo que sigue sin precio y no lo vuelve a cargar solo. */
async function removeUnpriced(db, tenantId) {
  const removed = await clearUnpriced(db, tenantId);
  await db.UpdateSettings({ masterCatalogVersion: null, masterCatalogKey: null, masterCatalogSkipped: true }, tenantId);
  return { removed };
}

/** Al arrancar el servidor: carga el catálogo en las tiendas que ya existían. Devuelve cuántas tiendas recibieron. */
async function backfill(db) {
  let tiendas = 0;
  const giros = [];
  for (const catalog of CATALOGS) if (await db.CountCatalogItems(catalog.key)) giros.push(...catalog.giros);
  for (const settings of await db.ListSettingsNeedingCatalog(giros, VERSION)) {
    try {
      await syncForGiro(db, String(settings.tenantId), settings);
      tiendas += 1;
    } catch (err) {
      console.warn('[catálogo maestro] no se pudo cargar en', settings.tenantId, err.message);
    }
  }
  return tiendas;
}

module.exports = {
  CATALOGS,
  CATALOG_OF,
  VERSION,
  catalogKeyFor,
  seedItems,
  ensureSeeded,
  productName,
  toFood,
  missingFor,
  seed,
  syncForGiro,
  status,
  load,
  removeUnpriced,
  backfill,
};
