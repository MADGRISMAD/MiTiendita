// Importar precios desde un CSV (Excel > Guardar como CSV). Sin imports: la prueba del backend lo carga como módulo
// (backend/test/price-import.test.js).

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Texto CSV → filas de celdas. Acepta coma o punto y coma, comillas y saltos de línea dentro de comillas. */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const HEADERS = {
  code: ["codigo", "codigo de barras", "barcode", "sku", "ean", "clave"],
  name: ["nombre", "producto", "articulo", "descripcion"],
  price: ["precio", "precio venta", "precio de venta", "venta", "pvp"],
  cost: ["costo", "costo unitario", "compra", "precio compra"],
};

/** Precio escrito como «$1,234.50», «18,50» o «18.5». NaN si no es número. */
export function parseMoney(v) {
  let s = String(v ?? "").replace(/[$\s]/g, "");
  if (!s) return NaN;
  if (/,\d{1,2}$/.test(s) && !/\./.test(s)) s = s.replace(",", "."); // 18,50
  else s = s.replace(/,/g, ""); // 1,234.50
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * Cruza el CSV con los productos sin precio. Busca primero por código exacto y luego por nombre.
 * Devuelve { matches: [{id, price, cost}], unmatched: [texto], invalid: [texto], error? }.
 */
export function matchPriceRows(csvRows, foods) {
  if (!csvRows.length) return { matches: [], unmatched: [], invalid: [], error: "El archivo está vacío." };
  const head = csvRows[0].map(fold);
  const col = (names) => head.findIndex((h) => names.includes(h));
  const idx = { code: col(HEADERS.code), name: col(HEADERS.name), price: col(HEADERS.price), cost: col(HEADERS.cost) };
  if (idx.price < 0 || (idx.code < 0 && idx.name < 0)) {
    return {
      matches: [],
      unmatched: [],
      invalid: [],
      error: "Faltan columnas. La primera fila debe llamarse: código y/o nombre, y precio (costo es opcional).",
    };
  }
  const byCode = new Map();
  const byName = new Map();
  for (const f of foods) {
    for (const c of [f.barcode, f.sku]) if (c) byCode.set(fold(c), f);
    byName.set(fold(f.name), f);
  }
  const out = new Map();
  const unmatched = [];
  const invalid = [];
  for (const r of csvRows.slice(1)) {
    const label = (idx.name >= 0 ? r[idx.name] : r[idx.code]) || "(sin nombre)";
    const price = parseMoney(r[idx.price]);
    if (!(price > 0)) {
      invalid.push(label);
      continue;
    }
    const food = (idx.code >= 0 && byCode.get(fold(r[idx.code]))) || (idx.name >= 0 && byName.get(fold(r[idx.name]))) || null;
    if (!food) {
      unmatched.push(label);
      continue;
    }
    const cost = idx.cost >= 0 ? parseMoney(r[idx.cost]) : NaN;
    out.set(String(food.id), { id: String(food.id), price, cost: cost >= 0 ? cost : undefined });
  }
  return { matches: [...out.values()], unmatched, invalid };
}
