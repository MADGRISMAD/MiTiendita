/**
 * Revisión de los códigos de barras de un catálogo maestro (panel de la plataforma):
 *  - local (rápida): dígito verificador, longitud, repetidos y productos sin código;
 *  - en línea (por tandas): compara el nombre del producto con lo que dicen las bases públicas para ese código.
 */
const { canon, codeVariants } = require('../utils/barcode');
const { httpError } = require('../utils/http-error');
const barcodeLookup = require('./barcode-lookup.service');
const gemini = require('./gemini.service');
const { CATALOGS } = require('./master-catalog.service');

const MAX_BATCH = 8;
const MAX_SUGGEST_BATCH = 4;
const MAX_CANDIDATES = 4;
const PAGE_TIMEOUT_MS = 5000;
const PAGE_MAX_CHARS = 600_000;
const STOP = new Set(['de', 'la', 'el', 'con', 'sin', 'y', 'en', 'para', 'por', 'del', 'los', 'las', 'un', 'una']);
const UNITS = new Set(['ml', 'l', 'lt', 'g', 'gr', 'kg', 'pz', 'pzs', 'pieza', 'piezas', 'cm', 'mm', 'm', 'p', 'pack']);
// Palabras que distinguen una variante: si solo una de las dos descripciones la trae, no son el mismo producto
const VARIANTS = new Set([
  'zero', 'light', 'lite', 'diet', 'max', 'integral', 'deslactosada', 'picante',
  'vainilla', 'fresa', 'chocolate', 'limon', 'naranja', 'manzana', 'mango', 'uva', 'durazno', 'cereza', 'coco', 'menta', 'cafe',
]);

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// «600ml» y «1p» se separan en número y unidad
const words = (s) => fold(s).replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').split(/[^a-z0-9]+/).filter(Boolean);
const wordSet = (s) => new Set(words(s).filter((t) => t.length > 1 && !STOP.has(t) && !UNITS.has(t) && !/^\d+$/.test(t)));
const numberSet = (s) => new Set(words(s).filter((t) => /^\d+$/.test(t)));

const MEASURE_RE = /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|mg|grs?|gramos?|g|mls?|cl|lts?|litros?|l|pzas?|pzs|pz|piezas?|pack|p)(?![a-z])/g;

/** Medidas que trae un nombre, llevadas a una misma unidad: { mass (g), volume (ml), count (piezas) } → conjunto de valores. */
function measures(text) {
  const out = new Map();
  for (const m of fold(text).matchAll(MEASURE_RE)) {
    const n = Number(m[1].replace(',', '.'));
    const u = m[2];
    let kind;
    let value;
    if (/^(kg|kilo)/.test(u)) [kind, value] = ['mass', n * 1000];
    else if (u === 'mg') [kind, value] = ['mass', n / 1000];
    else if (/^(g|gr|gramo)/.test(u)) [kind, value] = ['mass', n];
    else if (/^(ml)/.test(u)) [kind, value] = ['volume', n];
    else if (u === 'cl') [kind, value] = ['volume', n * 10];
    else if (/^(l|lt|litro)/.test(u)) [kind, value] = ['volume', n * 1000];
    else [kind, value] = ['count', n];
    if (!out.has(kind)) out.set(kind, new Set());
    out.get(kind).add(Math.round(value * 1000) / 1000);
  }
  return out;
}

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

/**
 * ¿El nombre del catálogo y el de la base pública hablan del mismo producto?
 * Piden al menos 2 palabras en común y el 60 % de la descripción más corta; y una variante (zero, light, un sabor…)
 * que solo trae uno de los dos los separa.
 */
function sameProduct(mine, theirs) {
  const a = wordSet(mine);
  const b = wordSet(theirs);
  if (!a.size || !b.size) return false;
  for (const v of VARIANTS) if (a.has(v) !== b.has(v)) return false;
  let common = 0;
  for (const t of a) if (b.has(t)) common += 1;
  const small = Math.min(a.size, b.size);
  const large = Math.max(a.size, b.size);
  if (small === 1) return common === 1 && large <= 2;
  return common >= 2 && common / small >= 0.6;
}

/** Los dos traen la misma clase de medida (peso, volumen o piezas) y ningún valor coincide (600 ml contra 355 ml, 1 kg contra 500 g). */
function sizeDiffers(mine, theirs) {
  const a = measures(mine);
  const b = measures(theirs);
  if (a.size || b.size) {
    for (const [kind, values] of a) {
      const other = b.get(kind);
      if (other && ![...values].some((v) => other.has(v))) return true;
    }
    return false;
  }
  const x = numberSet(mine);
  const y = numberSet(theirs);
  return x.size > 0 && y.size > 0 && ![...x].some((n) => y.has(n));
}

/** Huella de un producto: sus palabras (sin acentos, orden ni unidades sueltas) y sus medidas. Vacía si no hay nombre. */
function nameSignature(item) {
  const text = `${item.name} ${item.presentation || ''}`;
  const w = [...wordSet(text)].sort().join(' ');
  if (!w) return '';
  const m = [...measures(text)].map(([kind, set]) => `${kind}:${[...set].sort((a, b) => a - b).join(',')}`).sort().join('|');
  return `${w}#${m}`;
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
  // Mismo producto escrito igual (nombre y presentación, sin acentos ni mayúsculas) con otro código: probable repetido
  const byName = new Map();
  for (const i of items) {
    const sig = nameSignature(i);
    if (sig) byName.set(sig, [...(byName.get(sig) || []), i]);
  }
  const label = (x) => `${x.name}${x.presentation ? ` ${x.presentation}` : ''}`;
  const counts = { total: items.length, ok: 0, digit: 0, length: 0, missing: 0, duplicate: 0, sameName: 0, internal: 0 };
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
    const twins = (byName.get(nameSignature(i)) || []).filter((x) => x.key !== i.key && !same.some((s) => s.key === x.key));
    if (twins.length) {
      issues.push('sameName');
      counts.sameName += 1;
    }
    if (issues.length) {
      problems.push({
        key: i.key, section: i.section, name: i.name, presentation: i.presentation || '', code: i.code || '', issues,
        sharedWith: same.filter((x) => x.key !== i.key).map(label),
        sameNameAs: twins.map((x) => `${label(x)}${x.code ? ` (${x.code})` : ''}`),
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
  // Se busca con el nombre completo y, si es distinto, solo con el nombre (sin presentación) para no perder resultados
  const queries = [...new Set([mine.trim(), String(item.name || '').trim()].filter(Boolean))];
  const [lists, viaAi] = await Promise.all([Promise.all(queries.map((q) => barcodeLookup.searchByName(q))), aiCandidate(mine, usedCodes, item.section)]);
  const found = [...new Map(lists.flat().map((c) => [c.code, c])).values()];
  if (viaAi && !seen.has(canon(viaAi.code))) {
    seen.add(canon(viaAi.code));
    out.push(viaAi);
  }
  const ranked = found
    .filter((c) => sameProduct(mine, `${c.name} ${c.quantity}`) && !sizeDiffers(mine, `${c.name} ${c.quantity}`))
    .sort((a, b) => Number(b.code.replace(/^0+/, '').startsWith('750')) - Number(a.code.replace(/^0+/, '').startsWith('750')) || Number(b.mexico) - Number(a.mexico));
  for (const c of ranked) take({ code: c.code, name: c.name, quantity: c.quantity, source: c.source, confidence: 'search', mexico: c.mexico || c.code.replace(/^0+/, '').startsWith('750') });
  // Un código que no viene confirmado por una base se comprueba al revés: ¿a qué producto dicen las páginas que pertenece?
  let budget = 2; // como mucho 2 comprobaciones con IA por producto
  const verdicts = await Promise.all(out.map((c) => ((c.confidence === 'check_digit' || c.confidence === 'search') && budget-- > 0 ? verifyByPages(c.code, mine) : null)));
  const checked = [];
  out.forEach((c, i) => {
    const v = verdicts[i];
    if (v === 'conflict') return; // páginas con el código muestran otro producto: no se ofrece
    checked.push(v ? { ...c, name: v.name, quantity: v.quantity, source: 'IA con búsqueda en Google', confidence: 'ai_page' } : c);
  });
  return checked.sort((a, b) => RANK[a.confidence] - RANK[b.confidence]).slice(0, MAX_CANDIDATES);
}

/**
 * Comprobación al revés de un código: la IA busca en Google a qué producto pertenece y se compara con el del catálogo.
 * Devuelve { name, quantity } si una página que muestra el código habla de este mismo producto (nombre y medida),
 * 'conflict' si habla de otro, o null si no hay forma de saberlo.
 */
async function verifyByPages(code, mine) {
  if (!gemini.hasGeminiConfig()) return null;
  let ai;
  try {
    ai = await gemini.identifyProduct({ code, name: '', categories: [] });
  } catch (err) {
    console.warn('[catálogo IA]', err.code || '', err.message);
    return null;
  }
  if (!ai.found || ai.confidence !== 'alta' || !ai.grounded) return null;
  const theirs = `${ai.name} ${ai.presentation}`;
  if (!sameProduct(mine, theirs) || sizeDiffers(mine, theirs)) return 'conflict';
  return (await pagesShowCode(ai.debug?.sources, code)) ? { name: ai.name, quantity: ai.presentation } : null;
}

const RANK = { confirmed: 0, ai_confirmed: 1, ai_page: 2, check_digit: 3, search: 4 };

/** ¿Alguna de estas páginas muestra el código? (las páginas que citó la IA; si no cargan, no cuenta) */
async function pagesShowCode(urls, code) {
  const forms = codeVariants(code);
  const hits = await Promise.all(
    (urls || []).slice(0, 3).map(async (url) => {
      try {
        const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MiTiendita/1.0)' }, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
        if (!res.ok) return false;
        const text = String(await res.text()).slice(0, PAGE_MAX_CHARS);
        return forms.some((f) => f.length >= 8 && text.includes(f));
      } catch {
        return false;
      }
    })
  );
  return hits.some(Boolean);
}

/**
 * Código que propone la IA (busca en Google). Solo se ofrece si TODO esto se cumple, porque un código mal puesto cobra el producto equivocado:
 * confianza alta, páginas que la respaldan, dígito verificador válido, nombre y medida iguales a los del catálogo,
 * y otra fuente que lo confirma (una base pública con el mismo producto, o una página que muestra el código).
 */
async function aiCandidate(mine, usedCodes, section = '') {
  if (!gemini.hasGeminiConfig()) return null;
  let ai;
  try {
    ai = await gemini.findBarcode({ name: section ? `${mine} (categoría: ${section})` : mine });
  } catch (err) {
    console.warn('[catálogo IA]', err.code || '', err.message);
    return null;
  }
  if (!ai.found || ai.confidence !== 'alta' || !ai.grounded || gtinStatus(ai.code) !== 'ok' || usedCodes.has(canon(ai.code))) return null;
  const theirs = `${ai.name} ${ai.presentation}`;
  if (!sameProduct(mine, theirs) || sizeDiffers(mine, theirs)) return null;
  const pub = await barcodeLookup.lookup(ai.code);
  if (pub.found) {
    const other = `${pub.name} ${pub.quantity || ''}`;
    if (!sameProduct(mine, other) || sizeDiffers(mine, other)) return null; // las bases lo atribuyen a otro producto
    return { code: ai.code, name: ai.name || pub.name, quantity: ai.presentation || pub.quantity || '', source: `IA + ${pub.source}`, confidence: 'ai_confirmed' };
  }
  if (await pagesShowCode(ai.sources, ai.code)) {
    return { code: ai.code, name: ai.name, quantity: ai.presentation, source: 'IA con búsqueda en Google', confidence: 'ai_page' };
  }
  return null;
}

/** A qué producto dicen las bases públicas que pertenece el código registrado (null si no aparece o no es consultable). */
async function registeredAs(item) {
  if (item.plu || gtinStatus(item.code) !== 'ok') return null;
  const found = await barcodeLookup.lookup(item.code);
  if (!found.found) return null;
  return { name: found.name, quantity: found.quantity || '', source: found.source, same: sameProduct(`${item.name} ${item.presentation || ''}`, `${found.name} ${found.quantity || ''}`) };
}

/** Sugerencias para una tanda de productos: { suggestions: { [key]: candidatos }, registered: { [key]: a qué producto pertenece hoy su código } }. */
async function suggest(db, catalog, keys) {
  assertCatalog(catalog);
  if (!Array.isArray(keys) || !keys.length) throw httpError(400, 'Faltan los productos.');
  if (keys.length > MAX_SUGGEST_BATCH) throw httpError(400, `Máximo ${MAX_SUGGEST_BATCH} productos por tanda.`);
  const all = await db.ListCatalogItems(catalog);
  const wanted = new Set(keys.map(String));
  const used = new Set(all.filter((i) => i.code && !wanted.has(i.key)).map((i) => canon(i.code)));
  const suggestions = {};
  const registered = {};
  await Promise.all(
    keys.map(async (key) => {
      const item = all.find((i) => i.key === String(key));
      registered[key] = item ? await registeredAs(item) : null;
      // Si el código registrado ya es de este mismo producto, no hay nada que reemplazar
      suggestions[key] = item && !registered[key]?.same ? await suggestFor(db, catalog, item, used) : [];
    })
  );
  return { suggestions, registered };
}

module.exports = { suggest, checkDigitOf, gtinStatus, sameProduct, sizeDiffers, localReport, onlineKeys, checkOnline, MAX_BATCH, MAX_SUGGEST_BATCH };
