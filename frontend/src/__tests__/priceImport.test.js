import { describe, expect, it } from "vitest";
import { matchPriceRows, parseCsv, parseMoney } from "../priceImport";

const foods = [
  { id: "a", name: "Coca-Cola 600 ml", barcode: "7501055300075" },
  { id: "b", name: "Sabritas Original" },
];

describe("priceImport", () => {
  it("lee CSV con coma o punto y coma", () => {
    expect(parseCsv("código,precio\n1,\"1,200.50\"")).toEqual([["código", "precio"], ["1", "1,200.50"]]);
    expect(parseCsv("nombre;precio\nPan;12,5")).toEqual([["nombre", "precio"], ["Pan", "12,5"]]);
  });
  it("entiende precios escritos de varias formas", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("18,50")).toBe(18.5);
    expect(parseMoney("gratis")).toBeNaN();
  });
  it("cruza por código y por nombre y reporta lo que no entró", () => {
    const rows = parseCsv("codigo,nombre,precio\n7501055300075,,18\n,sabritas original,17.5\n,Galletas,10\n,Pan,0");
    const r = matchPriceRows(rows, foods);
    expect(r.matches.map((m) => [m.id, m.price])).toEqual([["a", 18], ["b", 17.5]]);
    expect(r.unmatched).toEqual(["Galletas"]);
    expect(r.invalid).toEqual(["Pan"]);
  });
});
