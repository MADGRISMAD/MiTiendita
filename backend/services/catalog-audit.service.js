/**
 * Revisión de los códigos de barras de un catálogo maestro (panel de la plataforma):
 *  - local (rápida): dígito verificador, longitud, repetidos y productos sin código;
 *  - en línea (por tandas): compara el nombre del producto con lo que dicen las bases públicas para ese código.
 */
const { canon } = require('../utils/barcode');
const { httpError } = require('../utils/http-error');
const barcodeLookup = require('./barcode-lookup.service');
const { CATALOGS } = require('./master-catalog.service');

const MAX_BATCH = 8;
const MAX_SUGGEST_BATCH = 4;
const MAX_CANDIDATES = 4;
const STOP = new Set(['de', 'la', 'el', 'con', 'sin', 'y', 'en', 'para', 'por', 'del', 'los', 'las', 'un', 'una']);
const UNITS = new Set(['ml', 'l', 'lt', 'g', 'gr', 'kg', 'pz', 'pzs', 'pieza', 'piezas', 'cm', 'mm', 'm']);

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const wordSet = (s) => new Set(words(s).filter((t) => t.length > 1 && !STOP.has(t) && !UNITS.has(t) && !/^\d+$/.test(t)));
const numberSet = (s) => new Set(words(s).filter((t) => /^\d+$/.test(t)));

/** 'ok' | 'digit' (el dígito verificador no cuadra) | 'length' | 'internal' (no numérico: PLU o clave propia) | 'missing' */
function gtinStatus(code) {
  const c = String(code || '').trim();
  if (!c) return 'missing';
  if (!/^\d+$/.test(c)) return 'internal';
  if (![8, 12, 13, 14].includes(c.length)) return 'length';
  return checkDigitOf(c.slice(0, -1)) === Number(c.slice(-1)) ? 'ok' : 'digit';
}

/** Dígito verificador que le toca a un código sin su último dígito. */
function checkDigitOf(body) {
  const sum = [...String(body)].reverse().reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/** ¿El nombre del catálogo y el de la base pública hablan del mismo producto? */
function sameProduct(mine, theirs) {
  const a = wordSet(mine);
  const b = wordSet(theirs);
  if (!a.size || !b.size) return false;
  let common = 0;
  for (const t of a) if (b.has(t)) common += 1;
  return common / Math.min(a.size, b.size) >= 0.5;
}

/** Los dos traen medidas y ninguna coincide (p. ej. 600 ml contra 355 ml). */
function sizeDiffers(mine, theirs) {
  const a = numberSet(mine);
  const b = numberSet(theirs);
  return a.size > 0 && b.size > 0 && ![...a].some((n) => b.has(n));
}

function assertCatalog(key) {
  if (!CATALOGS.some((c) => c.key === key)) throw httpError(404, 'Ese catálogo no existe.');
}

/** Revisión rápida, sin internet. Solo lista los productos con algún problema. */
async function localReport(db, catalog) {
  assertCatalog(catalog);
  const items = await db.ListCatalogItems(catalog);
  const byCode = new Map();
  for (const i of items) {
    if (i.plu || gtinStatus(i.code) === 'internal' || !i.code) continue;
    byCode.set(canon(i.code), [...(byCode.get(canon(i.code)) || []), i]);
  }
  const counts = { total: items.length, ok: 0, digit: 0, length: 0, missing: 0, duplicate: 0, internal: 0 };
  const problems = [];
  for (const i of items) {
    const status = i.plu ? 'internal' : gtinStatus(i.code);
    if (status === 'ok') counts.ok += 1;
    else counts[status] += 1;
    const issues = [];
    if (status === 'digit' || status === 'length' || status === 'missing') issues.push(status);
    const same = status === 'internal' ? [] : byCode.get(canon(i.code)) || [];
    if (same.length > 1) {
      issues.push('duplicate');
      counts.duplicate += 1;
    }
    if (issues.length) {
      problems.push({
        key: i.key, section: i.section, name: i.name, presentation: i.presentation || '', code: i.code || '', issues,
        sharedWith: same.filter((x) => x.key !== i.key).map((x) => `${x.name}${x.presentation ? ` ${x.presentation}` : ''}`),
      });
    }
  }
  return { counts, problems };
}

/** Lista de claves para la revisión en línea: productos con código que se puede consultar (y, si se pide, solo sin verificar). */
async function onlineKeys(db, catalog, { onlyUnverified = true } = {}) {
  assertCatalog(catalog);
  return (await db.ListCatalogItems(catalog))
    .filter((i) => !i.plu && gtinStatus(i.code) === 'ok' && !(onlyUnverified && i.verified))
    .map((i) => i.key);
}

/** Compara con las bases públicas una tanda de productos. */
async function checkOnline(db, catalog, keys) {
  assertCatalog(catalog);
  if (!Array.isArray(keys) || !keys.length) throw httpError(400, 'Faltan los productos a revisar.');
  if (keys.length > MAX_BATCH) throw httpError(400, `Máximo ${MAX_BATCH} productos por tanda.`);
  const results = await Promise.all(
    keys.map(async (key) => {
      const item = await db.GetCatalogItem(catalog, String(key));
      if (!item) return { key, status: 'skipped' };
      if (gtinStatus(item.code) !== 'ok') return { key, status: 'skipped' };
      const found = await barcodeLookup.lookup(item.code);
      if (found.unavailable) return { key, status: 'unavailable' };
      if (!found.found) return { key, status: 'notfound' };
      const mine = `${item.name} ${item.presentation || ''}`;
      const theirs = `${found.name} ${found.quantity || ''}`;
      return {
        key,
        status: sameProduct(mine, theirs) ? 'same' : 'different',
        sizeDiffers: sizeDiffers(mine, theirs),
        online: { name: found.name, quantity: found.quantity || '', source: found.source },
      };
    })
  );
  return { results };
}

/**
 * Posibles códigos correctos para un producto. Nunca cambia nada:
 *  - «confirmed»: el código con el dígito verificador corregido existe en las bases y el nombre coincide;
 *  - «check_digit»: solo se corrigió el dígito y no hay dónde confirmarlo;
 *  - «search»: salió de buscar por nombre (poco preciso; primero los de México, que empiezan con 750).
 */
async function suggestFor(db, catalog, item, usedCodes) {
  const mine = `${item.name} ${item.presentation || ''}`;
  const status = item.plu ? 'internal' : gtinStatus(item.code);
  if (status === 'internal') return [];
  const out = [];
  const seen = new Set([canon(item.code || '')]);
  const take = (c) => {
    const k = canon(c.code);
    if (seen.has(k) || usedCodes.has(k) || gtinStatus(c.code) !== 'ok') return;
    seen.add(k);
    out.push(c);
  };
  if (status === 'digit') {
    const fixed = item.code.slice(0, -1) + checkDigitOf(item.code.slice(0, -1));
    const found = await barcodeLookup.lookup(fixed);
    if (found.found && sameProduct(mine, `${found.name} ${found.quantity || ''}`)) take({ code: fixed, name: found.name, quantity: found.quantity || '', source: found.source, confidence: 'confirmed' });
    else if (!found.found && !found.unavailable) take({ code: fixed, name: '', quantity: '', source: '', confidence: 'check_digit' });
  }
  const found = await barcodeLookup.searchByName(mine);
  const ranked = found
    .filter((c) => sameProduct(mine, `${c.name} ${c.quantity}`))
    .sort((a, b) => Number(b.code.replace(/^0+/, '').startsWith('750')) - Number(a.code.replace(/^0+/, '').startsWith('750')) || Number(b.mexico) - Number(a.mexico));
  for (const c of ranked) take({ code: c.code, name: c.name, quantity: c.quantity, source: c.source, confidence: 'search', mexico: c.mexico || c.code.replace(/^0+/, '').startsWith('750') });
  return out.slice(0, MAX_CANDIDATES);
}

/** Sugerencias para una tanda de productos: { [key]: candidatos }. */
async function suggest(db, catalog, keys) {
  assertCatalog(catalog);
  if (!Array.isArray(keys) || !keys.length) throw httpError(400, 'Faltan los productos.');
  if (keys.length > MAX_SUGGEST_BATCH) throw httpError(400, `Máximo ${MAX_SUGGEST_BATCH} productos por tanda.`);
  const all = await db.ListCatalogItems(catalog);
  const wanted = new Set(keys.map(String));
  const used = new Set(all.filter((i) => i.code && !wanted.has(i.key)).map((i) => canon(i.code)));
  const suggestions = {};
  for (const key of keys) {
    const item = all.find((i) => i.key === String(key));
    suggestions[key] = item ? await suggestFor(db, catalog, item, used) : [];
  }
  return { suggestions };
}

module.exports = { suggest, checkDigitOf, gtinStatus, sameProduct, sizeDiffers, localReport, onlineKeys, checkOnline, MAX_BATCH, MAX_SUGGEST_BATCH };
