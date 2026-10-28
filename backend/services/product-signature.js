/**
 * «¿Es el mismo producto?» con criterio estricto, para nombres escritos distinto (más o menos texto, otro orden, otra ortografía).
 * Dos nombres son el mismo producto solo si tienen las mismas palabras que distinguen (sabor, variante…), las mismas medidas y no se
 * contradicen en la marca de la empresa. Una palabra de más que distinga (light, un sabor, retornable) hace que NO lo sean.
 */
const COMPANY = new Set(['sabritas', 'barcel', 'bimbo', 'marinela', 'gamesa', 'lala', 'pepsico', 'nestle']);
const GENERIC = new Set(['galleta', 'galletas', 'refresco', 'botana', 'botanas', 'de', 'la', 'el', 'con', 'sin', 'y', 'en', 'para', 'por', 'del', 'los', 'las', 'un', 'una', 'c', 'v', 'vs', 'sabores', 'surtido']);
const UNIT_WORDS = new Set(['gr', 'grs', 'g', 'gramos', 'gramo', 'lt', 'lts', 'l', 'litro', 'litros', 'ml', 'kg', 'kgs', 'pza', 'pzas', 'pz', 'pzs', 'pieza', 'piezas', 'pack', 'multipack', 'paquete', 'p', 'paq']);
const ALIAS = { yoghurt: 'yogurt', yogurth: 'yogurt', yoghurth: 'yogurt', yogur: 'yogurt', deslac: 'deslactosada', lite: 'light', lighit: 'light', choco: 'chocolate', faming: 'flamin' };

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[´'’]/g, '');

function signature(name) {
  const t = fold(name);
  const numbers = new Set();
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|lts|lt|l|ml|grs|gr|g|gramos|pzas|pza|pzs|pz|paq|p)?(?![a-z])/g)) {
    let v = parseFloat(m[1].replace(',', '.'));
    if (['kg', 'kgs', 'lt', 'lts', 'l'].includes(m[2])) v *= 1000;
    numbers.add(Math.round(v));
  }
  const words = new Set();
  const companies = new Set();
  for (const raw of t.match(/[a-z]+/g) || []) {
    const w = ALIAS[raw] || raw;
    if (COMPANY.has(w)) companies.add(w);
    else if (w.length >= 2 && !GENERIC.has(w) && !UNIT_WORDS.has(w)) words.add(w);
  }
  return { words, numbers, companies };
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const clash = (a, b) => a.size > 0 && b.size > 0 && !sameSet(a, b);

function sameProduct(nameA, nameB) {
  const a = signature(nameA);
  const b = signature(nameB);
  if (!a.words.size || !b.words.size || clash(a.companies, b.companies)) return false;
  return sameSet(a.numbers, b.numbers) && sameSet(a.words, b.words);
}

module.exports = { signature, sameProduct };
