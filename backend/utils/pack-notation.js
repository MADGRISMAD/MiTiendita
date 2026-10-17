/**
 * Las notas de proveedor escriben los paquetes de muchas formas: "PET6", "PET 6", "PED  6", "pet de 6", "TT4", "TT 4",
 * "2 pet x 6", "caja c/24", "6 pack". Este módulo las reconoce todas y devuelve cuántos paquetes y cuántas piezas trae cada uno.
 */
const WORDS = 'pets?|peds?|pt|tts?|pks?|packs?|paq\\.?|paquetes?|cjs?|cajas?|bultos?|displays?|charolas?';
const SEP = '\\s*(?:de|x|c\\/|\\/|-|=)?\\s*';
// Antes del texto no debe haber letra/número pegado ("mantequilla4" no es un paquete); después, el número no se corta ("tt45" sí es 45)
const LEAD = '(?:^|[^a-z0-9áéíóúñ])';
const COUNT_FIRST = new RegExp(`${LEAD}(\\d{1,2})\\s*(?:${WORDS})${SEP}(\\d{1,3})(?!\\d)`, 'i');
const WORD_FIRST = new RegExp(`${LEAD}(?:${WORDS})${SEP}(\\d{1,3})(?!\\d)`, 'i');
const SIXPACK = /\b(?:six\s*-?\s*pack|sixpack)\b/i;
const ANY_WORD = new RegExp(`${LEAD}(?:${WORDS})(?![a-záéíóúñ])`, 'i');

/** ¿El texto habla de paquetes/pets/cajas? */
function mentionsPack(text) {
  const t = String(text || '');
  return ANY_WORD.test(t) || SIXPACK.test(t) || WORD_FIRST.test(t);
}

/**
 * @returns {{ packs: number|null, packSize: number, rest: string } | null}
 *  packs es null cuando la nota no dice cuántos paquetes (se queda lo que ya se tenía).
 */
function parsePackNotation(text) {
  const raw = String(text || '');
  let m = raw.match(COUNT_FIRST);
  if (m) {
    const size = Number(m[2]);
    if (size >= 2 && size <= 200) return { packs: Math.max(1, Number(m[1])), packSize: size, rest: raw.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  m = raw.match(WORD_FIRST);
  if (m) {
    const size = Number(m[1]);
    if (size >= 2 && size <= 200) return { packs: null, packSize: size, rest: raw.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
  }
  if (SIXPACK.test(raw)) return { packs: null, packSize: 6, rest: raw.replace(SIXPACK, ' ').replace(/\s+/g, ' ').trim() };
  return null;
}

module.exports = { parsePackNotation, mentionsPack, WORDS };
