/**
 * Edición de los catálogos maestros desde el panel de la plataforma: ver por categoría, agregar y editar a mano,
 * importar una lista, y revisar el catálogo de una tienda para pasarle a un catálogo lo que le falte.
 * Lo que se cambia aquí NO se empuja solo a las tiendas que ya cargaron su catálogo: ellas ven «faltan N» en Ajustes.
 */
const crypto = require('crypto');
const { CATALOGS } = require('./master-catalog.service');
const { SALE_UNITS } = require('../utils/units');
const { httpError } = require('../utils/http-error');
const { canon } = require('../utils/barcode');

const MAX_IMPORT_ROWS = 3000;
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const truthy = (v) => v === true || /^(1|s[ií]|true|x|verdadero)$/i.test(String(v || '').trim());

function assertCatalog(key) {
  if (!CATALOGS.some((c) => c.key === key)) throw httpError(404, 'Ese catálogo no existe.');
  return key;
}

/** Datos de un producto ya limpios y validados (lanza si falta algo). */
function cleanItem(input) {
  const name = clean(input.name, 120);
  if (name.length < 2) throw httpError(400, 'Escribe el nombre del producto.');
  const unit = String(input.unit || 'pz').trim().toLowerCase();
  if (!SALE_UNITS.includes(unit)) throw httpError(400, `La unidad debe ser ${SALE_UNITS.join(', ')}.`);
  const out = {
    section: clean(input.section, 80) || 'General',
    name,
    presentation: clean(input.presentation, 40),
    code: clean(input.code, 40).replace(/\s/g, ''),
    plu: truthy(input.plu),
    unit,
    verified: truthy(input.verified),
  };
  // Precio sugerido y costo son opcionales: si no vienen, el producto nace sin precio y lo captura el dueño.
  for (const field of ['price', 'cost']) {
    const raw = String(input[field] == null ? '' : input[field]).replace(/[$,\s]/g, '');
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw httpError(400, `El ${field === 'price' ? 'precio' : 'costo'} no es válido.`);
    out[field] = Math.round(n * 100) / 100;
  }
  return out;
}

async function codeTaken(db, catalog, code, exceptKey) {
  if (!code) return null;
  const q = canon(code);
  return (await db.ListCatalogItems(catalog)).find((i) => i.code && canon(i.code) === q && i.key !== exceptKey) || null;
}

/** Resumen de los catálogos: cuántos productos y cuántas secciones tiene cada uno. */
async function summary(db) {
  const out = [];
  for (const c of CATALOGS) {
    const items = await db.ListCatalogItems(c.key);
    out.push({ ...c, total: items.length, sections: new Set(items.map((i) => i.section)).size, verified: items.filter((i) => i.verified).length });
  }
  return out;
}

async function list(db, catalog) {
  assertCatalog(catalog);
  return db.ListCatalogItems(catalog);
}

async function create(db, catalog, input) {
  assertCatalog(catalog);
  const data = cleanItem(input);
  const clash = await codeTaken(db, catalog, data.code, null);
  if (clash) throw httpError(409, `El código ${data.code} ya es de «${clash.name}».`);
  const key = data.code || `g-${crypto.randomBytes(5).toString('hex')}`;
  if (await db.GetCatalogItem(catalog, key)) throw httpError(409, 'Ya hay un producto con ese código.');
  return db.UpsertCatalogItem(catalog, key, data);
}

async function update(db, catalog, key, input) {
  assertCatalog(catalog);
  const current = await db.GetCatalogItem(catalog, key);
  if (!current) throw httpError(404, 'Producto no encontrado.');
  const data = cleanItem({ ...current, ...input });
  const clash = await codeTaken(db, catalog, data.code, current.key);
  if (clash) throw httpError(409, `El código ${data.code} ya es de «${clash.name}».`);
  return db.UpsertCatalogItem(catalog, current.key, data);
}

async function remove(db, catalog, key) {
  assertCatalog(catalog);
  if (!(await db.DeleteCatalogItem(catalog, key))) throw httpError(404, 'Producto no encontrado.');
  return { ok: true };
}

/**
 * Importa una lista (las filas ya leídas del archivo): crea lo nuevo y actualiza lo que ya existe, que se reconoce por
 * el código (o, sin código, por nombre y presentación). Nunca borra nada. Devuelve qué pasó con cada fila que falló.
 */
async function importRows(db, catalog, rows) {
  assertCatalog(catalog);
  if (!Array.isArray(rows) || !rows.length) throw httpError(400, 'El archivo no trae productos.');
  if (rows.length > MAX_IMPORT_ROWS) throw httpError(400, `Máximo ${MAX_IMPORT_ROWS} productos por archivo.`);
  const existing = await db.ListCatalogItems(catalog);
  const byCode = new Map(existing.filter((i) => i.code).map((i) => [canon(i.code), i]));
  const byName = new Map(existing.map((i) => [`${clean(i.name, 120).toLowerCase()}|${String(i.presentation || '').toLowerCase()}`, i]));
  const result = { created: 0, updated: 0, errors: [] };
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    try {
      const data = cleanItem(rows[i] || {});
      const nameKey = `${data.name.toLowerCase()}|${data.presentation.toLowerCase()}`;
      const idKey = data.code ? `c:${canon(data.code)}` : `n:${nameKey}`;
      if (seen.has(idKey)) throw httpError(400, 'Está repetido en el archivo.');
      seen.add(idKey);
      const found = (data.code && byCode.get(canon(data.code))) || (!data.code && byName.get(nameKey)) || null;
      if (found) {
        await db.UpsertCatalogItem(catalog, found.key, { ...data, code: data.code || found.code });
        result.updated += 1;
      } else {
        const key = data.code || `g-${crypto.randomBytes(5).toString('hex')}`;
        const saved = await db.UpsertCatalogItem(catalog, key, data);
        if (data.code) byCode.set(canon(data.code), saved);
        byName.set(nameKey, saved);
        result.created += 1;
      }
    } catch (err) {
      result.errors.push({ row: i + 1, message: err.message });
    }
  }
  return result;
}

/**
 * Productos de una tienda para revisarlos contra el catálogo de su giro: solo nombre, código, categoría y unidad
 * (nada de precios, costos ni existencias del cliente). `inCatalog` dice si ya está en el catálogo (por origen o código).
 */
async function tenantProducts(db, tenantId, catalog) {
  const [foods, menus, items] = await Promise.all([db.GetFoods(tenantId), db.GetMenus(tenantId), db.ListCatalogItems(catalog)]);
  const menuName = new Map(menus.map((m) => [String(m.id), m.name]));
  const keys = new Set(items.map((i) => i.key));
  const codes = new Set(items.filter((i) => i.code).map((i) => canon(i.code)));
  // Sin código (se pesa, o no lo tiene) se reconoce por el nombre, tal como queda en la tienda
  const names = new Set(items.flatMap((i) => [i.name, `${i.name} ${i.presentation || ''}`]).map((n) => clean(n, 200).toLowerCase()));
  const products = foods
    .filter((f) => !f.isMisc)
    .map((f) => {
      const code = String(f.barcode || f.sku || '').trim();
      return {
        id: String(f.id),
        name: f.name,
        code,
        section: menuName.get(String(f.menuId)) || 'General',
        unit: f.saleUnit || 'pz',
        fromCatalog: Boolean(f.catalogId),
        inCatalog: keys.has(String(f.catalogId)) || (code !== '' && codes.has(canon(code))) || names.has(clean(f.name, 200).toLowerCase()),
      };
    })
    .sort((a, b) => a.section.localeCompare(b.section, 'es') || a.name.localeCompare(b.name, 'es'));
  return { total: products.length, notInCatalog: products.filter((p) => !p.inCatalog).length, products };
}

/** Pasa productos de una tienda al catálogo (los que ya estén por código se omiten). */
async function addFromTenant(db, catalog, tenantId, foodIds) {
  assertCatalog(catalog);
  const wanted = new Set((Array.isArray(foodIds) ? foodIds : []).map(String));
  if (!wanted.size) throw httpError(400, 'Elige al menos un producto.');
  const { products } = await tenantProducts(db, tenantId, catalog);
  const rows = products.filter((p) => wanted.has(p.id) && !p.inCatalog);
  const result = await importRows(
    db,
    catalog,
    rows.map((p) => ({ section: p.section, name: p.name, code: p.code, unit: p.unit }))
  );
  return { ...result, skipped: wanted.size - rows.length };
}

module.exports = { summary, list, create, update, remove, importRows, tenantProducts, addFromTenant, cleanItem };
