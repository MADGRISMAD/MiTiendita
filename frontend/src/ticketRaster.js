// Imprime el MISMO diseño que ves en la ventana de impresión, pero directo en la térmica.
// Carga la vista del ticket en un iframe oculto, la convierte en imagen y la manda como bitmap ESC/POS.
// Colócalo en: src/ticketRaster.js
// Requiere:  npm i html-to-image
import { getFontEmbedCSS, toCanvas } from "html-to-image";

const PAPER_SELECTOR = ".tk-paper";
const SUPERSAMPLE = 3;
const WEB_FONTS = ["Figtree", "Caveat"]; // las tipografías de internet que usa el ticket
const MAX_PIXELS = 28_000_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Repite `fn` hasta que devuelva algo (o lance error) o se acabe el tiempo. */
async function waitFor(fn, { timeout = 15000, step = 80, message = "El ticket tardó demasiado en cargar." } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(message);
    await sleep(step);
  }
}

/**
 * Abre `path` (una ruta de tu app, por ejemplo /print/order/ID?mode=receipt) en un iframe oculto
 * y devuelve un canvas con el ticket del ancho exacto de la impresora (`dots` puntos).
 */
export async function renderTicketCanvas(path, { paper = "80", dots = 512 } = {}) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:900px;height:1600px;border:0;opacity:0;pointer-events:none;";
  // capture=1 avisa a la vista que no imprima ni toque la impresora (la usa esta ventana)
  iframe.src = `${path}${path.includes("?") ? "&" : "?"}capture=1`;

  const loaded = new Promise((resolve, reject) => {
    iframe.addEventListener("load", resolve, { once: true });
    iframe.addEventListener("error", () => reject(new Error("No se pudo preparar el ticket.")), { once: true });
  });
  document.body.appendChild(iframe);

  try {
    await loaded;
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("No se pudo leer el ticket.");

    // Espera a que la vista termine de cargar sus datos
    const el = await waitFor(() => {
      const err = doc.querySelector(".tk-state.err");
      if (err) throw new Error(err.textContent.trim() || "No se pudo cargar el ticket.");
      const paperEl = doc.querySelector(PAPER_SELECTOR);
      if (!paperEl || paperEl.querySelector(".tk-state")) return null;
      return paperEl;
    });

    // Tipografías e imágenes (QR) listas
    await doc.fonts?.ready;
    await waitFor(() => Array.from(el.querySelectorAll("img")).every((i) => i.complete), {
      timeout: 8000,
      message: "El código QR tardó demasiado en cargar.",
    });
    await sleep(150);

    el.classList.toggle("w58", paper === "58");

    // La imagen se arma como un SVG que no puede cargar tipografías de internet: hay que meterlas dentro. Si no entraron (red lenta,
    // bloqueador…), las letras caerían en otra tipografía más ancha que se sale de su caja y se encima («Vuelva pronto» sobre «Conserve su
    // ticket»). En ese caso se usan tipografías del sistema, que se miden igual dentro y fuera de la imagen.
    let fontEmbedCSS = "";
    try {
      fontEmbedCSS = await getFontEmbedCSS(el);
    } catch {
      /* se usa la tipografía del sistema */
    }
    const embedded = WEB_FONTS.every((f) => new RegExp("font-family:\\s*[\"']?" + f, "i").test(fontEmbedCSS));
    el.classList.toggle("tk-sysfont", !embedded);

    const width = el.offsetWidth;
    if (!width) throw new Error("El ticket no tiene tamaño.");

    // Se dibuja al doble o triple de tamaño y luego se reduce con suavizado: las letras salen más definidas que dibujándolas
    // directo al tamaño de la impresora. (Con tickets muy largos baja la escala para no pasar el tamaño máximo del lienzo.)
    let ss = SUPERSAMPLE;
    while (ss > 1 && dots * ss * ((el.offsetHeight * dots * ss) / width) > MAX_PIXELS) ss -= 1;
    const raw = await toCanvas(el, {
      ...(embedded ? { fontEmbedCSS } : { skipFonts: true }),
      pixelRatio: (dots / width) * ss,
      backgroundColor: "#ffffff",
      // Sin el margen superior ni el borde rasgado de la vista en pantalla: en papel no sirven y solo dejan blanco arriba
      style: { margin: "0", boxShadow: "none", transform: "none", paddingTop: "0px", mask: "none", WebkitMask: "none" },
    });

    // Ancho exacto de la impresora
    const out = document.createElement("canvas");
    out.width = dots;
    out.height = Math.max(1, Math.round((raw.height * dots) / raw.width));
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(raw, 0, 0, out.width, out.height);
    return out;
  } finally {
    iframe.remove();
  }
}

/**
 * Canvas → bitmap de 1 bit (negro / blanco) listo para ESC/POS.
 * Quita el blanco sobrante de arriba (deja unas filas) y de abajo.
 */
export function canvasToBitmap(canvas, { threshold = 185, padTop = 3, padBottom = 12 } = {}) {
  const { width, height } = canvas;
  const px = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const ink = new Uint8Array(width * height);
  let firstInk = -1;
  let lastInk = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = px[i + 3] / 255;
      const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * a + 255 * (1 - a);
      if (lum < threshold) {
        ink[y * width + x] = 1;
        if (firstInk < 0) firstInk = y;
        lastInk = y;
      }
    }
  }
  const top = Math.max(0, firstInk - padTop);
  const rows = Math.max(1, Math.min(height, lastInk + padBottom) - top);
  const data = new Uint8Array(bytesPerRow * rows);
  for (let r = 0; r < rows; r++) {
    const y = top + r;
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x]) data[r * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height: rows, bytesPerRow, data };
}

export async function renderTicketBitmap(path, opts = {}) {
  return canvasToBitmap(await renderTicketCanvas(path, opts));
}

/** Bytes ESC/POS: imagen por bandas (GS v 0), avance y corte. */
export function buildRasterTicket(bitmap, { openDrawer = false, feed = 4 } = {}) {
  const parts = [];
  const put = (...b) => parts.push(Uint8Array.from(b));

  put(0x1b, 0x40); // init
  if (openDrawer) put(0x1b, 0x70, 0x00, 0x19, 0xfa); // pulso al cajón
  put(0x1b, 0x61, 0x01); // centrado, por si la impresora es más ancha que la imagen

  const BAND = 128; // filas por comando: las impresoras con poca memoria lo agradecen
  for (let y = 0; y < bitmap.height; y += BAND) {
    const h = Math.min(BAND, bitmap.height - y);
    put(0x1d, 0x76, 0x30, 0x00, bitmap.bytesPerRow & 0xff, bitmap.bytesPerRow >> 8, h & 0xff, h >> 8);
    parts.push(bitmap.data.subarray(y * bitmap.bytesPerRow, (y + h) * bitmap.bytesPerRow));
  }

  put(0x1b, 0x61, 0x00, 0x1b, 0x64, feed, 0x1d, 0x56, 0x42, 0x03); // izquierda, avance, corte parcial

  const total = parts.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    bytes.set(p, off);
    off += p.length;
  }
  return bytes;
}