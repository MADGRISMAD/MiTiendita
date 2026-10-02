/**
 * Teléfonos de México: se guardan 10 dígitos y se muestran como se escriben aquí,
 * "55 1234 5678" en CDMX, Guadalajara y Monterrey, "614 123 4567" en el resto.
 */
const TWO_DIGIT_LADAS = new Set(["55", "56", "33", "81"]);

/** Solo los 10 dígitos; acepta lo pegado con +52, 52 1, 00 52, espacios o guiones. */
export function phoneDigits(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length > 10 && d.startsWith("52")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Agrupa los dígitos mientras se escriben: "55 1234 5678" o "614 123 4567". */
export function formatMxPhone(input) {
  const d = phoneDigits(input);
  const parts = TWO_DIGIT_LADAS.has(d.slice(0, 2))
    ? [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10)]
    : [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)];
  return parts.filter(Boolean).join(" ");
}

/** Para mostrar un teléfono guardado: si son 10 dígitos los agrupa, si no lo deja como está. */
export function prettyPhone(value) {
  const d = String(value || "").replace(/\D/g, "");
  return d.length === 10 || (d.length > 10 && d.startsWith("52")) ? formatMxPhone(d) : String(value || "");
}
