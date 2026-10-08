// Los colores de la marca de la tienda: se sacan del logo y se aplican a toda la app.
// La lógica de colores vive en brandColors.js (sin imports, con pruebas); aquí está lo que toca el navegador.
import { reactive } from "vue";
import { brandThemeCss, paletteFromPixels } from "./brandColors";

export { DEFAULT_ACCENT, DEFAULT_PRIMARY, isDefaultPalette } from "./brandColors";

const STYLE_ID = "timber-brand";

/** Pone los colores de la marca en toda la app (o quita la hoja si son los de Mi Tiendita). */
export function applyBrand(primary, accent) {
  if (typeof document === "undefined") return;
  const css = brandThemeCss(primary, accent);
  let el = document.getElementById(STYLE_ID);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** Igual que applyBrand pero con un fundido suave, para cuando el dueño ve el cambio en vivo. */
export function applyBrandPreview(primary, accent) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("brand-fade");
  applyBrand(primary, accent);
  setTimeout(() => root.classList.remove("brand-fade"), 800);
}

/** Lo que muestra el loader mientras se arma la paleta. */
export const brandLoader = reactive({ active: false, step: 0, logo: "", primary: "", accent: "", done: false });
export const BRAND_STEPS = ["Leyendo los colores de tu logo…", "Armando tu paleta…", "Preparando tu experiencia…"];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Píxeles de la imagen, reducida a 96 px: de sobra para saber de qué colores es. */
async function samplePixels(dataUrl, size = 96) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const w0 = img.naturalWidth || img.width || size;
  const h0 = img.naturalHeight || img.height || size;
  const scale = size / Math.max(w0, h0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * Saca la paleta del logo mostrando el loader unos segundos («preparando tu experiencia»), la enseña
 * y la aplica a toda la app con un fundido. Devuelve { primary, accent } o null si la imagen no tiene
 * colores que leer (o no se pudo leer): en ese caso no se cambia nada.
 */
export async function brandFromLogo(dataUrl, { stepMs = 1100, showMs = 1200 } = {}) {
  if (brandLoader.active) return null;
  Object.assign(brandLoader, { active: true, step: 0, logo: dataUrl, primary: "", accent: "", done: false });
  try {
    let palette = null;
    try {
      palette = paletteFromPixels(await samplePixels(dataUrl));
    } catch {
      palette = null; // imagen que el navegador no deja leer (por ejemplo, de otro sitio)
    }
    if (!palette) {
      await wait(700);
      return null;
    }
    await wait(stepMs);
    brandLoader.step = 1;
    await wait(stepMs);
    brandLoader.step = 2;
    await wait(stepMs);
    Object.assign(brandLoader, { primary: palette.primary, accent: palette.accent, done: true });
    await wait(showMs);
    applyBrandPreview(palette.primary, palette.accent);
    return { primary: palette.primary, accent: palette.accent };
  } finally {
    brandLoader.active = false;
  }
}
