// Descargar archivos desde el navegador (CSV). Antes cada vista armaba su propio enlace temporal.

/** Baja un Blob como archivo. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Celda de CSV: se entrecomilla si trae coma, punto y coma, comillas o salto de línea. */
export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Texto CSV con BOM (Excel lo abre con acentos). `sep`: «,» o «;». */
export function csvText(header, rows, sep = ",") {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(sep)).join("\n");
}

/** Arma y descarga un CSV. */
export function downloadCsv(filename, header, rows, sep = ",") {
  saveBlob(new Blob([csvText(header, rows, sep)], { type: "text/csv;charset=utf-8;" }), filename);
}
