/**
 * Códigos de barras: un mismo código puede llegar escrito distinto (UPC-A de 12 dígitos contra EAN-13 con un cero
 * al inicio, mayúsculas, espacios). `codeVariants` devuelve las formas equivalentes para buscarlas todas.
 */
const MAX_ALT_CODES = 10;

function codeVariants(code) {
  const c = String(code || '').trim();
  if (!c) return [];
  if (/^\d+$/.test(c)) {
    const core = c.replace(/^0+/, '') || '0';
    const out = new Set([c, core]);
    for (const n of [8, 12, 13, 14]) if (core.length <= n) out.add(core.padStart(n, '0'));
    return [...out];
  }
  return [...new Set([c, c.toUpperCase(), c.toLowerCase()])];
}

/** Forma única de un código para compararlo: sin ceros al inicio (si es numérico) y sin mayúsculas. */
function canon(code) {
  const c = String(code || '').trim();
  return /^\d+$/.test(c) ? c.replace(/^0+/, '') || '0' : c.toLowerCase();
}

/** Códigos extra de un producto (otra presentación, versión de temporada): sin vacíos, repetidos ni el principal. */
function cleanAltCodes(list, mainCode = '') {
  const main = canon(mainCode);
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const c = String(raw || '').trim().slice(0, 40);
    const key = canon(c);
    if (!c || key === main || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_ALT_CODES) break;
  }
  return out;
}

module.exports = { canon, codeVariants, cleanAltCodes, MAX_ALT_CODES };
