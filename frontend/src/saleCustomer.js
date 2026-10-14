// Cliente opcional en el cobro: búsqueda y alta rápida. Sin imports ni Vue: se prueba con Vitest (src/__tests__).

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const digitsOf = (s) => String(s ?? "").replace(/\D/g, "");

/** Clientes que coinciden por nombre (sin acentos) o por teléfono (3 dígitos o más). Sin texto, ninguno. */
export function matchCustomers(customers, query, limit = 5) {
  const term = fold(query);
  if (!term) return [];
  const digits = digitsOf(query);
  return customers
    .filter((c) => fold(c.name).includes(term) || (digits.length >= 3 && digitsOf(c.phone).includes(digits)))
    .slice(0, limit);
}

/** Lo que se guarda al dar de alta a un cliente desde el cobro: un teléfono se guarda como teléfono. */
export function quickCustomerPayload(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/^[\d\s()+-]{7,}$/.test(text)) return { name: `Cliente ${digitsOf(text).slice(-4)}`, phone: text };
  return { name: text };
}
