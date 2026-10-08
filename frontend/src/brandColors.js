// Paleta de la marca a partir del logo: un color principal y uno secundario más claro, para detalles.
// Sin imports: la prueba del backend lo carga como módulo (backend/test/brand-colors.test.js).
//
// Todo es determinista: la misma imagen da siempre los mismos colores (nada de azar ni de IA generativa).
//  · Principal: el tono dominante del logo, ignorando el fondo blanco y la transparencia. Se oscurece lo
//    justo para que el texto blanco encima se lea (contraste ≥ 4.5), sin cambiarle el tono.
//  · Secundario: el segundo color del logo si lo hay; si no, una versión más clara del principal. Siempre
//    más claro que el principal.
//  · Tema oscuro: los mismos tonos, aclarados, para que nada quede oscuro sobre oscuro (ni claro sobre claro).

export const DEFAULT_PRIMARY = "#1E5AA8";
export const DEFAULT_ACCENT = "#E08A1E";
// Valores por defecto que el servidor guardaba antes: tampoco cuentan como una marca elegida.
const LEGACY_PAIR = ["#1F4D3A", "#C4A574"];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const MIN_CONTRAST_WHITE = 4.5; // texto blanco sobre el color principal (WCAG AA)

// ── Conversiones ──────────────────────────────────────────────────────────

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** [r,g,b] 0-255 → [tono 0-360, saturación 0-1, luminosidad 0-1] */
export function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

const hslHex = (h, s, l) => rgbToHex(hslToRgb([h, s, l]));

// ── Contraste (WCAG) ──────────────────────────────────────────────────────

function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const contrastWhite = (hsl) => contrast(hslToRgb(hsl), [255, 255, 255]);

/** Baja la luminosidad, sin tocar el tono, hasta que el texto blanco encima se lea bien. */
function darkenForWhiteText([h, s, l]) {
  let L = l;
  while (L > 0.05 && contrastWhite([h, s, L]) < MIN_CONTRAST_WHITE) L -= 0.01;
  return [h, s, L];
}

const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ── Paleta a partir de píxeles ────────────────────────────────────────────

const BINS = 36; // tonos de 10°

/** Tono, saturación y luminosidad promedio (ponderados) de un tono y sus dos vecinos. */
function aggregate(sums, i) {
  let x = 0, y = 0, s = 0, l = 0, w = 0;
  for (const j of [i - 1, i, i + 1]) {
    const t = sums[(j + BINS) % BINS];
    x += t.x; y += t.y; s += t.s; l += t.l; w += t.w;
  }
  return [((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, s / w, l / w];
}

/**
 * `data`: píxeles RGBA (Uint8ClampedArray). Devuelve { primary, accent, kind } con colores "#RRGGBB",
 * o null si la imagen no tiene nada que leer (vacía, transparente o toda blanca).
 * kind: «color» (el logo tiene color) o «neutral» (blanco y negro / grises).
 */
export function paletteFromPixels(data) {
  const weight = new Float64Array(BINS);
  const sums = Array.from({ length: BINS }, () => ({ x: 0, y: 0, s: 0, l: 0, w: 0 }));
  const dark = { r: 0, g: 0, b: 0, n: 0 };
  let opaque = 0;
  let colorful = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // transparente
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (l > 0.93) continue; // fondo blanco o casi
    opaque += 1;
    if (s >= 0.18 && l >= 0.1 && l <= 0.9) {
      const w = s * (1 - Math.abs(2 * l - 1) * 0.5); // los colores vivos pesan más que los apagados
      const bin = Math.floor(h / 10) % BINS;
      const rad = (h * Math.PI) / 180;
      const t = sums[bin];
      weight[bin] += w;
      t.x += Math.cos(rad) * w; t.y += Math.sin(rad) * w; t.s += s * w; t.l += l * w; t.w += w;
      colorful += 1;
    } else if (l < 0.5) {
      dark.r += rgb[0]; dark.g += rgb[1]; dark.b += rgb[2]; dark.n += 1;
    }
  }
  if (!opaque) return null;

  // Sin color suficiente: el logo es de grises. Se arma una paleta neutra con el tono de lo oscuro.
  if (colorful / opaque < 0.04) {
    const base = dark.n ? rgbToHsl([dark.r / dark.n, dark.g / dark.n, dark.b / dark.n]) : [215, 0, 0.3];
    const h = base[1] < 0.05 ? 215 : base[0]; // negro puro → gris azulado, no negro
    const s = clamp(base[1], 0.1, 0.25);
    const [, , l] = darkenForWhiteText([h, s, clamp(base[2], 0.18, 0.3)]);
    return { kind: "neutral", primary: hslHex(h, s, l), accent: hslHex(h, s, clamp(l + 0.36, 0.52, 0.7)) };
  }

  // Tono dominante (suavizado con los vecinos); en empate gana el tono más bajo, así es determinista
  const smooth = Array.from({ length: BINS }, (_, i) => weight[(i + BINS - 1) % BINS] * 0.5 + weight[i] + weight[(i + 1) % BINS] * 0.5);
  let best = 0;
  for (let i = 1; i < BINS; i++) if (smooth[i] > smooth[best]) best = i;
  const [ph, ps0, pl0] = aggregate(sums, best);

  // Segundo color: otro tono claramente distinto y con presencia; si no hay, se aclara el principal
  let accentHue = ph;
  let accentSat = ps0;
  let secondary = null;
  const order = [...smooth.keys()].sort((a, b) => smooth[b] - smooth[a] || a - b);
  for (const j of order) {
    if (smooth[j] < smooth[best] * 0.15) break;
    if (hueDistance(j * 10 + 5, ph) >= 40) { secondary = aggregate(sums, j); break; }
  }
  if (secondary) [accentHue, accentSat] = secondary;

  // Principal: vivo (no apagado) y lo bastante oscuro para llevar texto blanco encima
  const primary = darkenForWhiteText([ph, clamp(ps0, 0.4, 0.9), clamp(pl0, 0.2, 0.44)]);
  // Secundario: siempre más claro que el principal, para detalles
  const accentL = clamp(Math.max(primary[2] + 0.2, 0.52), 0.52, 0.72);
  const accent = [accentHue, clamp(accentSat, 0.45, 0.85), accentL];
  return { kind: "color", primary: hslHex(...primary), accent: hslHex(...accent) };
}

// ── Tema de la app ────────────────────────────────────────────────────────

export function isDefaultPalette(primary, accent) {
  const p = String(primary || "").toUpperCase();
  const a = String(accent || "").toUpperCase();
  if (!p || !a) return true;
  return (p === DEFAULT_PRIMARY && a === DEFAULT_ACCENT) || (p === LEGACY_PAIR[0] && a === LEGACY_PAIR[1]);
}

const rgba = (rgb, a) => `rgba(${rgb.map(Math.round).join(", ")}, ${a})`;

/**
 * CSS que pone la marca en toda la app, para el tema claro y el oscuro. Devuelve "" con los colores de
 * Mi Tiendita (la hoja de estilos normal ya los tiene) o si los colores no son válidos.
 */
export function brandThemeCss(primaryHex, accentHex) {
  if (isDefaultPalette(primaryHex, accentHex)) return "";
  const pr = hexToRgb(primaryHex);
  const ac = hexToRgb(accentHex);
  if (!pr || !ac) return "";

  // Tema claro: el principal lleva texto blanco, el secundario es más claro y la barra, la más oscura
  const [h, s, l0] = rgbToHsl(pr);
  const [, , l] = darkenForWhiteText([h, s, Math.max(l0, 0.12)]);
  const lightPrimary = hslToRgb([h, s, l]);
  const [ah, as, al0] = rgbToHsl(ac);
  const lightAccent = hslToRgb([ah, as, Math.min(0.78, Math.max(al0, l + 0.18))]);
  const topbarLight = hslHex(h, Math.min(s, 0.55), 0.17);
  const soft = hslHex(h, 0.7, 0.94);

  // Tema oscuro: los mismos tonos, aclarados, para que se vean sobre fondos oscuros
  const darkPrimary = hslToRgb([h, clamp(s, 0.5, 0.85), 0.66]);
  const darkAccent = hslToRgb([ah, clamp(as, 0.55, 0.85), 0.7]);
  const brandDark = darkenForWhiteText([h, s, Math.max(l, 0.32)]); // superficies con texto blanco

  return [
    'html[data-theme="light"] {',
    `  --timber-primary: ${rgbToHex(lightPrimary)};`,
    `  --timber-primary-soft: ${soft};`,
    `  --timber-accent: ${rgbToHex(lightAccent)};`,
    `  --timber-topbar: ${topbarLight};`,
    `  --timber-free: ${rgbToHex(lightPrimary)};`,
    `  --timber-brand: ${rgbToHex(lightPrimary)};`,
    "  --timber-on-primary: #ffffff;",
    "}",
    'html[data-theme="dark"] {',
    `  --timber-primary: ${rgbToHex(darkPrimary)};`,
    `  --timber-primary-soft: ${rgba(darkPrimary, 0.16)};`,
    `  --timber-accent: ${rgbToHex(darkAccent)};`,
    `  --timber-topbar: ${hslHex(h, Math.min(s, 0.45), 0.08)};`,
    `  --timber-free: ${rgbToHex(darkPrimary)};`,
    `  --timber-brand: ${hslHex(...brandDark)};`,
    "  --timber-on-primary: #0a1220;",
    "}",
  ].join("\n");
}
