/**
 * Reglas para decidir si dos nombres de producto son el mismo (palabras, variantes y medidas) y para revisar el dígito verificador
 * de un código de barras. Las usa la búsqueda de duplicados del inventario y la captura de códigos del catálogo.
 */
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

module.exports = { gtinStatus, checkDigitOf, sameProduct, sizeDiffers };
