/**
 * Catálogo maestro de abarrotes (Tijuana): 181 productos que ya vienen cargados en cada tienda de los
 * giros compatibles, SIN precio. El dueño se lo pone al escanear o buscar el producto por primera vez
 * (la caja se lo pide) y el costo lo carga con la siguiente factura de compra.
 *
 * Un producto sin precio lleva `needsPrice: true`: no sale en los mosaicos de la caja, no cuenta para el
 * tope del plan, no se puede vender y el marcador se apaga solo al ponerle precio (utils/needs-price.js).
 * Los datos viven en data/catalogo-maestro.json; para actualizarlos se edita ese archivo y se publica.
 */
const data = require('../data/catalogo-maestro.json');

// Giros que lo reciben (igual que frontend/src/masterCatalog.js; una prueba lo comprueba).
// Las carnicerías no tienen giro propio: se registran como «abarrotes» o «other» (Comercio).
const GIROS = ['abarrotes', 'convenience', 'other'];

// Sube este número cuando haya que volver a cargar el catálogo en todas las tiendas.
const VERSION = 1;

const ITEMS = Object.freeze(data.items.map((item) => Object.freeze({ ...item })));
const norm = (s) => String(s || '').trim().toLowerCase();

/** Una tienda sin giro guardado cuenta como abarrotes (es el valor por defecto de la app). */
function availableFor(businessType) {
  return GIROS.includes(businessType || 'abarrotes');
}

/** Nombre en el POS: producto y presentación. Lo que se pesa se vende por kilo, así que no lleva «1 kg». */
function productName(item) {
  return item.unit === 'kg' && /^1\s*kg$/i.test(item.presentation) ? item.name : `${item.name} ${item.presentation}`;
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
    sku: item.code,
    barcode: item.code,
    menuId: String(menuId),
    tenantId,
    stock: 0,
    lowStockThreshold: 5,
    tracksExpiry: false,
    supplierIds: [],
    saleUnit: item.unit,
    catalogId: item.id,
  };
}

/**
 * Carga en la tienda los productos del catálogo que todavía no tiene (por id o por código), cada uno en la
 * categoría de su proveedor, que se crea si no existe. Se puede repetir sin duplicar nada.
 */
async function seed(db, tenantId) {
  const foods = await db.GetFoods(tenantId);
  const have = new Set(foods.flatMap((f) => [f.catalogId, f.barcode, f.sku]).filter(Boolean).map(String));
  const missing = ITEMS.filter((item) => !have.has(item.id) && !have.has(item.code));
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

/**
 * Deja el catálogo como corresponde al giro de la tienda: lo carga una sola vez si el giro lo usa, y si la
 * tienda cambia a uno que no (ferretería, farmacia…) quita lo que siga sin precio. Lo que ya tiene precio
 * es del dueño y no se toca. `settings` son los ajustes ya guardados de la tienda.
 */
async function syncForGiro(db, tenantId, settings) {
  if (availableFor(settings?.businessType)) {
    if (settings?.masterCatalogVersion === VERSION) return null;
    const loaded = await seed(db, tenantId);
    await db.UpdateSettings({ masterCatalogVersion: VERSION }, tenantId);
    return loaded;
  }
  if (settings?.masterCatalogVersion != null) {
    await db.DeleteUnpricedCatalogFoods(tenantId);
    await db.DeleteEmptyCatalogMenus(tenantId);
    await db.UpdateSettings({ masterCatalogVersion: null }, tenantId);
  }
  return null;
}

/** Al arrancar el servidor: carga el catálogo en las tiendas que ya existían. Devuelve cuántas tiendas recibieron. */
async function backfill(db) {
  let tiendas = 0;
  for (const settings of await db.ListSettingsNeedingCatalog(GIROS, VERSION)) {
    try {
      await syncForGiro(db, String(settings.tenantId), settings);
      tiendas += 1;
    } catch (err) {
      console.warn('[catálogo maestro] no se pudo cargar en', settings.tenantId, err.message);
    }
  }
  return tiendas;
}

module.exports = { GIROS, VERSION, ITEMS, availableFor, productName, toFood, seed, syncForGiro, backfill };
