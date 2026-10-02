/**
 * Code 128 (conjuntos B y C) para imprimir en tickets y etiquetas.
 * Devuelve los anchos de barras/espacios en módulos, empezando por barra.
 */

// Patrones 0–105 (6 elementos) y 106 = STOP (7 elementos), ancho en módulos
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/** Valores Code 128 (incluye inicio y dígito verificador, sin STOP). */
export function code128Values(text) {
  const str = String(text || "");
  if (!str) return [];
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error("Code 128: solo caracteres ASCII imprimibles");
  }
  const values = [];
  let i = 0;
  // Conjunto C (pares de dígitos) cuando arranca con 4+ dígitos: código más corto
  const digitRun = (from) => {
    let n = 0;
    while (from + n < str.length && /\d/.test(str[from + n])) n++;
    return n;
  };
  let set = digitRun(0) >= 4 ? "C" : "B";
  values.push(set === "C" ? START_C : START_B);
  while (i < str.length) {
    if (set === "C") {
      if (digitRun(i) >= 2) {
        values.push(Number(str.slice(i, i + 2)));
        i += 2;
        continue;
      }
      set = "B";
      values.push(CODE_B);
      continue;
    }
    const run = digitRun(i);
    // Cambia a C solo si el resto son dígitos pares o hay 6+ seguidos
    if ((run >= 6 || (run >= 4 && i + run === str.length)) && run % 2 === 0) {
      set = "C";
      values.push(CODE_C);
      continue;
    }
    values.push(str.charCodeAt(i) - 32);
    i += 1;
  }
  let sum = values[0];
  for (let k = 1; k < values.length; k++) sum += values[k] * k;
  values.push(sum % 103);
  return values;
}

/** Anchos alternos barra/espacio en módulos, con STOP. */
export function code128Widths(text) {
  const out = [];
  for (const v of [...code128Values(text), STOP]) {
    for (const ch of PATTERNS[v]) out.push(Number(ch));
  }
  return out;
}

/** Rectángulos SVG {x, w} de las barras y el ancho total (con 10 módulos de margen a cada lado). */
export function code128Bars(text, quiet = 10) {
  const widths = code128Widths(text);
  const bars = [];
  let x = quiet;
  widths.forEach((w, idx) => {
    if (idx % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, width: x + quiet };
}

export { PATTERNS as CODE128_PATTERNS };
