// Ayudas de texto compartidas por las pantallas (antes copiadas en cada vista). Sin imports ni Vue.

/** Minúsculas y sin acentos, para buscar. */
export function fold(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Solo los dígitos de un texto (teléfonos). */
export function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Iniciales de un nombre: «María López» → «ML». */
export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

/** Tono estable (0–359) para el avatar de un nombre: `style="--h: 214"`. */
export function hueStyle(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { "--h": h };
}

/** Texto de error para mostrar: lo que dijo el servidor (texto o `message`) o el mensaje por omisión. */
export function errText(error, fallback) {
  const data = error?.response?.data;
  if (typeof data === "string" && data) return data;
  if (data?.message) return data.message;
  return fallback;
}

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** Pesos mexicanos con centavos: 1234.5 → «$1,234.50». */
export function money(value) {
  return mxn.format(Number(value) || 0);
}
