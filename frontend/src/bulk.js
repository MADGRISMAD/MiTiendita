// Venta a granel: unidades de venta, cantidades con decimales y códigos de báscula.
// Sin imports: la prueba del backend lo carga como módulo (backend/test/bulk.test.js).

/** Unidades de venta. `step`: la cantidad mínima que tiene sentido capturar. */
export const SALE_UNITS = {
  pz: { label: "Pieza", short: "pz", per: "c/u", decimals: 0, step: 1 },
  kg: { label: "Kilo", short: "kg", per: "/kg", decimals: 3, step: 0.001 },
  g: { label: "Gramo", short: "g", per: "/g", decimals: 0, step: 1 },
  l: { label: "Litro", short: "l", per: "/l", decimals: 3, step: 0.001 },
};

export function unitOf(product) {
  const u = product?.saleUnit;
  return SALE_UNITS[u] ? u : "pz";
}

/** Se vende por peso o volumen (pide báscula o importe al agregarlo). */
export function isBulk(product) {
  return unitOf(product) !== "pz";
}

/** Redondea a la precisión de la unidad (kg y litros a gramos/mililitros; piezas y gramos enteros sin decimales extra). */
export function roundQty(qty, unit = "pz") {
  const n = Number(qty) || 0;
  const d = SALE_UNITS[unit]?.decimals ?? 3;
  // Las piezas pueden traer decimales a propósito (media caja): se respetan hasta 3
  const places = d === 0 && unit === "pz" ? 3 : d;
  const f = 10 ** places;
  return Math.round(Number((n * f).toPrecision(12))) / f;
}

/** «0.750 kg», «3», «250 g». Piezas sin unidad. */
export function formatQtyUnit(qty, unit = "pz") {
  const n = Number(qty) || 0;
  if (unit === "kg" || unit === "l") return `${n.toFixed(3)} ${unit}`;
  const plain = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
  return unit === "g" ? `${plain} g` : plain;
}

/** Sufijo del precio: «/kg», «/l», «/g» o «» para piezas. */
export function perUnit(unit = "pz") {
  return unit === "pz" ? "" : SALE_UNITS[unit]?.per || "";
}

/**
 * Cantidad a despachar para cobrar `amount` pesos a `unitPrice` (precio final por unidad, con IVA).
 * Prueba la cantidad de abajo y la de arriba (a la precisión de la unidad) y se queda con la que más se
 * acerca al importe sin pasarse cuando empatan.
 */
export function qtyForAmount(amount, unitPrice, unit = "kg") {
  const a = Number(amount) || 0;
  const p = Number(unitPrice) || 0;
  if (a <= 0 || p <= 0) return 0;
  const d = SALE_UNITS[unit]?.decimals ?? 3;
  const f = 10 ** d;
  const raw = (a / p) * f;
  const lo = Math.floor(Number(raw.toPrecision(12))) / f;
  const hi = Math.ceil(Number(raw.toPrecision(12))) / f;
  const cost = (q) => Math.round(Number((q * p * 100).toPrecision(12))) / 100;
  const dlo = Math.abs(cost(lo) - a);
  const dhi = Math.abs(cost(hi) - a);
  if (lo <= 0) return hi;
  return dhi < dlo ? hi : lo;
}

function ean13Ok(code) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/**
 * Código de báscula EAN-13 con prefijo 20–29: 2D PPPPP VVVVV C
 * - PPPPP: clave del producto (PLU) en la báscula
 * - VVVVV: peso en gramos (mode "weight") o importe en centavos (mode "price")
 * Devuelve null si no es un código de báscula válido.
 */
export function parseScaleBarcode(code, mode = "weight") {
  const s = String(code || "").trim();
  if (!/^2\d{12}$/.test(s) || !ean13Ok(s)) return null;
  const plu = s.slice(2, 7);
  const value = Number(s.slice(7, 12));
  if (!value) return null;
  return mode === "price" ? { plu, amount: value / 100 } : { plu, grams: value };
}

/** Claves con las que un producto puede estar dado de alta para un PLU de báscula (con o sin ceros). */
export function pluKeys(plu) {
  const s = String(plu || "");
  const trimmed = s.replace(/^0+/, "") || "0";
  return [...new Set([s, trimmed])];
}

/** Cantidad en la unidad del producto a partir de los gramos de la báscula. */
export function qtyFromGrams(grams, unit = "kg") {
  const g = Number(grams) || 0;
  if (unit === "g") return g;
  // kg; en litros la báscula manda mililitros
  return roundQty(g / 1000, unit === "l" ? "l" : "kg");
}
