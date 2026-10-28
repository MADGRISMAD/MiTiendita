/**
 * Pone en un catálogo maestro los códigos de barras de una tienda de confianza (los de esa tienda están comprobados):
 *  - a cada producto del maestro que sea el mismo que uno de la tienda se le pone el código de la tienda;
 *  - (opcional) a los demás se les quita el código de barras, porque ya no hay con qué comprobarlo.
 * Las claves propias y los PLU (no son códigos de barras) no se tocan. Primero se ve la vista previa; después se aplica.
 */
const { canon } = require('../utils/barcode');
const { httpError } = require('../utils/http-error');
const { CATALOGS } = require('./master-catalog.service');
const { sameProduct } = require('./product-signature');
const admin = require('./master-catalog-admin.service');

const SAMPLE = 12;
const isBarcode = (item) => !item.plu && /^\d+$/.test(String(item.code || '').trim());

async function plan(db, catalog, tenantId, { clearOthers = true } = {}) {
  if (!CATALOGS.some((c) => c.key === catalog)) throw httpError(404, 'Ese catálogo no existe.');
  if (!tenantId) throw httpError(400, 'Elige la tienda.');
  const [items, foods] = await Promise.all([db.ListCatalogItems(catalog), db.GetFoods(String(tenantId))]);
  const store = foods
    .filter((f) => !f.isMisc)
    .map((f) => ({ id: String(f.id), name: f.name, code: String(f.barcode || f.sku || '').trim() }))
    .filter((f) => /^\d+$/.test(f.code));
  if (!store.length) throw httpError(400, 'Esa tienda no tiene productos con código de barras.');
  const storeCodes = new Set(store.map((f) => canon(f.code)));

  const counts = { storeProducts: store.length, recode: 0, clear: 0, same: 0, ambiguous: 0, conflict: 0, kept: 0 };
  const claims = new Map(); // producto de la tienda → productos del maestro que dicen ser ese
  const pending = [];
  for (const item of items) {
    if (!isBarcode(item) && item.code) { counts.kept += 1; continue; } // clave propia o PLU
    if (item.code && storeCodes.has(canon(item.code))) { counts.same += 1; continue; } // ya trae un código de la tienda
    const name = `${item.name} ${item.presentation || ''}`;
    const hits = store.filter((f) => sameProduct(name, f.name));
    if (hits.length === 1) {
      claims.set(hits[0].id, [...(claims.get(hits[0].id) || []), item]);
      pending.push({ item, target: hits[0] });
    } else if (hits.length > 1) {
      counts.ambiguous += 1;
    } else if (item.code && clearOthers) {
      pending.push({ item, clear: true });
    }
  }
  const taken = new Set(items.filter((i) => i.code).map((i) => canon(i.code)));
  const changes = [];
  for (const p of pending) {
    if (p.clear) {
      changes.push({ kind: 'clear', key: p.item.key, name: p.item.name, presentation: p.item.presentation || '', from: p.item.code, to: '' });
      counts.clear += 1;
      continue;
    }
    if ((claims.get(p.target.id) || []).length > 1) { counts.ambiguous += 1; continue; } // dos del maestro para el mismo de la tienda
    if (taken.has(canon(p.target.code)) && canon(p.item.code || '') !== canon(p.target.code)) { counts.conflict += 1; continue; } // otro del maestro ya usa ese código
    changes.push({ kind: 'recode', key: p.item.key, name: p.item.name, presentation: p.item.presentation || '', from: p.item.code || '', to: p.target.code, storeName: p.target.name });
    counts.recode += 1;
  }
  return { counts, changes };
}

async function preview(db, catalog, tenantId, opts) {
  const { counts, changes } = await plan(db, catalog, tenantId, opts);
  return {
    counts,
    recode: changes.filter((c) => c.kind === 'recode').slice(0, SAMPLE),
    clear: changes.filter((c) => c.kind === 'clear').slice(0, SAMPLE),
  };
}

async function apply(db, catalog, tenantId, opts) {
  const { changes } = await plan(db, catalog, tenantId, opts);
  const result = { recoded: 0, cleared: 0, errors: [] };
  // Primero se quitan y después se ponen, para que un código que cambia de dueño no choque
  for (const c of [...changes.filter((x) => x.kind === 'clear'), ...changes.filter((x) => x.kind === 'recode')]) {
    try {
      await admin.update(db, catalog, c.key, { code: c.to });
      if (c.kind === 'clear') result.cleared += 1;
      else result.recoded += 1;
    } catch (err) {
      result.errors.push({ key: c.key, name: c.name, message: err.message });
    }
  }
  return result;
}

module.exports = { plan, preview, apply };
