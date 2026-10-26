// Archivo CSV (Excel > Guardar como CSV) → filas para importar a un catálogo maestro. Sin imports de Vue.
import { fold, parseCsv } from "./priceImport";

const HEADERS = {
  section: ["categoria", "seccion", "grupo", "linea", "departamento", "proveedor"],
  name: ["nombre", "producto", "articulo", "descripcion"],
  presentation: ["presentacion", "tamano", "medida", "contenido"],
  code: ["codigo", "codigo de barras", "barcode", "sku", "ean", "clave"],
  unit: ["unidad", "unidad de venta"],
  plu: ["plu", "bascula", "a granel"],
  verified: ["verificado", "verificada"],
};

/** Encabezados de la plantilla, en el orden en que se exportan. */
export const CATALOG_COLUMNS = ["categoria", "nombre", "presentacion", "codigo", "unidad", "plu", "verificado"];

function columnOf(header, field) {
  return header.findIndex((h) => HEADERS[field].includes(fold(h)));
}

/** @returns {{ rows: object[], error: string }} filas listas para mandar al servidor, o el motivo por el que no se pudo leer. */
export function catalogRowsFromCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "El archivo está vacío o solo trae los encabezados." };
  const header = table[0];
  const at = Object.fromEntries(Object.keys(HEADERS).map((f) => [f, columnOf(header, f)]));
  if (at.name < 0) return { rows: [], error: "No encontré la columna del nombre. Usa los encabezados de la plantilla (categoria, nombre, presentacion, codigo…)." };
  const cell = (row, field) => (at[field] >= 0 ? String(row[at[field]] ?? "").trim() : "");
  const rows = table.slice(1).map((row) => ({
    section: cell(row, "section"),
    name: cell(row, "name"),
    presentation: cell(row, "presentation"),
    code: cell(row, "code"),
    unit: cell(row, "unit") || "pz",
    plu: cell(row, "plu"),
    verified: cell(row, "verified"),
  }));
  return { rows, error: "" };
}

/** Filas de un catálogo (o de los productos de una tienda) para exportarlas con las mismas columnas de la plantilla. */
export function catalogRowsToCsv(items) {
  return items.map((i) => [i.section, i.name, i.presentation || "", i.code || "", i.unit || "pz", i.plu ? "sí" : "", i.verified ? "sí" : ""]);
}
