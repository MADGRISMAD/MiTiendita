import { describe, expect, it } from "vitest";
import { catalogRowsFromCsv, catalogRowsToCsv, CATALOG_COLUMNS } from "../catalogImport";

describe("catalogImport", () => {
  it("lee un CSV con encabezados en cualquier orden y con acentos o mayúsculas", () => {
    const csv = "Código;Categoría;Producto;Presentación;Unidad\n7502000000011;Analgésicos;Paracetamol;500 mg c/20;pz\n;Vitaminas;Vitamina C;1 g;\n";
    const { rows, error } = catalogRowsFromCsv(csv);
    expect(error).toBe("");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ section: "Analgésicos", name: "Paracetamol", presentation: "500 mg c/20", code: "7502000000011", unit: "pz" });
    expect(rows[1]).toMatchObject({ code: "", unit: "pz" }); // sin unidad: pieza
  });
  it("sin la columna del nombre, avisa con las columnas que espera", () => {
    expect(catalogRowsFromCsv("a,b\n1,2\n").error).toMatch(/nombre/);
    expect(catalogRowsFromCsv("nombre\n").error).toMatch(/vacío/);
  });
  it("lo exportado se puede volver a importar tal cual", () => {
    const items = [{ section: "Pinturas", name: 'Brocha 2"', presentation: "", code: "7503000000029", unit: "pz", plu: false, verified: true }];
    const csv = [CATALOG_COLUMNS, ...catalogRowsToCsv(items)].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const { rows } = catalogRowsFromCsv(csv);
    expect(rows[0]).toMatchObject({ section: "Pinturas", name: 'Brocha 2"', code: "7503000000029", verified: "sí" });
  });
});
