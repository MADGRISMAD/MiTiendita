/**
 * Catálogo maestro de abarrotes (Tijuana): productos de referencia que cualquier tienda de los giros
 * compatibles puede agregar a su propio catálogo. No trae precios: los pone cada dueño.
 * Los datos viven en data/catalogo-maestro.json; para actualizarlos se edita ese archivo y se publica.
 */
const data = require('../data/catalogo-maestro.json');

// Giros que pueden usarlo (igual que frontend/src/masterCatalog.js; una prueba lo comprueba).
// Las carnicerías no tienen giro propio: se registran como «abarrotes» o «other» (Comercio).
const GIROS = ['abarrotes', 'convenience', 'other'];

const ITEMS = Object.freeze(data.items.map((item) => Object.freeze({ ...item })));
const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
const SECTIONS = [...new Set(ITEMS.map((item) => item.section))];

/** Una tienda sin giro guardado cuenta como abarrotes (es el valor por defecto de la app). */
function availableFor(businessType) {
  return GIROS.includes(businessType || 'abarrotes');
}

function find(id) {
  return BY_ID.get(String(id)) || null;
}

/** Nombre en el POS: producto y presentación. Lo que se pesa se vende por kilo, así que no lleva «1 kg». */
function productName(item) {
  return item.unit === 'kg' && /^1\s*kg$/i.test(item.presentation) ? item.name : `${item.name} ${item.presentation}`;
}

/** Producto de la tienda a partir de uno del catálogo; el precio lo pone el dueño. */
function toFood(item, { price, menuId, tenantId }) {
  return {
    name: productName(item),
    price,
    cost: 0,
    priceIncludesTax: true, // precio de anaquel, igual que el catálogo de ejemplo
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

module.exports = { GIROS, ITEMS, SECTIONS, availableFor, find, productName, toFood };
