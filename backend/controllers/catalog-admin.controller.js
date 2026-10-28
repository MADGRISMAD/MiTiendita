const db = require('../database/mongodb');
const admin = require('../services/master-catalog-admin.service');
const { catalogKeyFor, CATALOGS } = require('../services/master-catalog.service');
const audit = require('../services/platform-audit.service');
const codeAudit = require('../services/catalog-audit.service');

function fail(res, err, fallback) {
  if (err.status) return res.status(err.status).send(err.message);
  console.error('[catálogos]', err);
  return res.status(500).send(fallback);
}
const label = (key) => CATALOGS.find((c) => c.key === key)?.label || key;

async function summary(req, res) {
  try {
    return res.json(await admin.summary(db));
  } catch (err) {
    return fail(res, err, 'No se pudieron cargar los catálogos.');
  }
}

async function list(req, res) {
  try {
    return res.json(await admin.list(db, req.params.catalog));
  } catch (err) {
    return fail(res, err, 'No se pudo cargar el catálogo.');
  }
}

async function create(req, res) {
  try {
    const item = await admin.create(db, req.params.catalog, req.body || {});
    await audit.record(req, { type: 'catalog_item_created', message: `Agregó «${item.name}» al catálogo ${label(req.params.catalog)}`, meta: { catalog: req.params.catalog, key: item.key } });
    return res.status(201).json(item);
  } catch (err) {
    return fail(res, err, 'No se pudo agregar el producto.');
  }
}

async function update(req, res) {
  try {
    const before = await db.GetCatalogItem(req.params.catalog, req.params.key);
    const item = await admin.update(db, req.params.catalog, req.params.key, req.body || {});
    // Si cambió el código de barras queda anotado el anterior y el nuevo
    const recode = before && before.code !== item.code ? ` (código ${before.code || 'vacío'} → ${item.code || 'vacío'})` : '';
    await audit.record(req, { type: 'catalog_item_updated', message: `Editó «${item.name}» del catálogo ${label(req.params.catalog)}${recode}`, meta: { catalog: req.params.catalog, key: item.key } });
    return res.json(item);
  } catch (err) {
    return fail(res, err, 'No se pudo guardar el producto.');
  }
}

async function remove(req, res) {
  try {
    await admin.remove(db, req.params.catalog, req.params.key);
    await audit.record(req, { type: 'catalog_item_deleted', message: `Quitó un producto del catálogo ${label(req.params.catalog)}`, meta: { catalog: req.params.catalog, key: req.params.key } });
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err, 'No se pudo quitar el producto.');
  }
}

/** Revisión local de los códigos del catálogo (sin internet) y la lista de productos que se pueden comparar en línea. */
async function codesReport(req, res) {
  try {
    const onlyUnverified = req.query.onlyUnverified !== '0';
    const [report, keys] = await Promise.all([codeAudit.localReport(db, req.params.catalog), codeAudit.onlineKeys(db, req.params.catalog, { onlyUnverified })]);
    return res.json({ ...report, onlineKeys: keys, batch: codeAudit.MAX_BATCH });
  } catch (err) {
    return fail(res, err, 'No se pudieron revisar los códigos.');
  }
}

/** Posibles códigos correctos para unos productos; el panel los muestra y la persona decide cuál usar. */
async function codesSuggest(req, res) {
  try {
    return res.json(await codeAudit.suggest(db, req.params.catalog, req.body?.keys));
  } catch (err) {
    return fail(res, err, 'No se pudieron buscar los códigos.');
  }
}

/** Compara con las bases públicas una tanda de productos (el panel va pidiendo tandas). */
async function codesOnline(req, res) {
  try {
    return res.json(await codeAudit.checkOnline(db, req.params.catalog, req.body?.keys));
  } catch (err) {
    return fail(res, err, 'No se pudieron comparar los códigos.');
  }
}

async function importRows(req, res) {
  try {
    const out = await admin.importRows(db, req.params.catalog, req.body?.rows);
    await audit.record(req, { type: 'catalog_imported', message: `Importó productos al catálogo ${label(req.params.catalog)}: ${out.created} nuevos, ${out.updated} actualizados`, meta: { catalog: req.params.catalog, ...out, errors: out.errors.length } });
    return res.json(out);
  } catch (err) {
    return fail(res, err, 'No se pudo importar el archivo.');
  }
}

/** Productos de una tienda, para ver qué le falta al catálogo de su giro. Sin precios, costos ni existencias. */
async function tenantProducts(req, res) {
  try {
    const tenant = await db.GetTenantById(req.params.id);
    if (!tenant) return res.status(404).send('No encontré esa tienda.');
    const settings = await db.GetSettings(tenant.id);
    const catalog = req.query.catalog || catalogKeyFor(settings?.businessType) || 'abarrotes';
    const out = await admin.tenantProducts(db, String(tenant.id), catalog);
    return res.json({ ...out, catalog, businessName: settings?.businessName || tenant.name || '', businessType: settings?.businessType || 'abarrotes' });
  } catch (err) {
    return fail(res, err, 'No se pudo cargar el catálogo de la tienda.');
  }
}

async function addFromTenant(req, res) {
  try {
    const tenant = await db.GetTenantById(String(req.body?.tenantId || ''));
    if (!tenant) return res.status(404).send('No encontré esa tienda.');
    const out = await admin.addFromTenant(db, req.params.catalog, String(tenant.id), req.body?.foodIds);
    await audit.record(req, { tenantId: tenant.id, type: 'catalog_from_tenant', message: `Pasó productos de una tienda al catálogo ${label(req.params.catalog)}: ${out.created} nuevos`, meta: { catalog: req.params.catalog, ...out, errors: out.errors.length } });
    return res.json(out);
  } catch (err) {
    return fail(res, err, 'No se pudieron pasar los productos.');
  }
}

module.exports = { summary, list, create, update, remove, importRows, tenantProducts, addFromTenant, codesReport, codesOnline, codesSuggest };
