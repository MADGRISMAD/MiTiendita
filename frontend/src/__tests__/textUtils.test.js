import { describe, expect, it } from "vitest";
import { csvCell, csvText } from "../download";
import { digits, errText, fold, hueStyle, initials } from "../textUtils";

describe("textUtils", () => {
  it("fold quita acentos y mayúsculas", () => {
    expect(fold("  Ñandú ÁÉÍ ")).toBe("  nandu aei ");
    expect(fold(null)).toBe("");
    expect(fold(0)).toBe("0");
  });
  it("digits deja solo números", () => {
    expect(digits("(664) 123-4567")).toBe("6641234567");
  });
  it("initials", () => {
    expect(initials("maría lópez ruiz")).toBe("ML");
    expect(initials("Beto")).toBe("B");
    expect(initials("")).toBe("?");
  });
  it("hueStyle es estable y está entre 0 y 359", () => {
    const a = hueStyle("Doña Mary");
    expect(a).toEqual(hueStyle("Doña Mary"));
    expect(a["--h"]).toBeGreaterThanOrEqual(0);
    expect(a["--h"]).toBeLessThan(360);
  });
  it("errText prefiere el texto del servidor, luego message, luego el respaldo", () => {
    expect(errText({ response: { data: "Ya existe" } }, "x")).toBe("Ya existe");
    expect(errText({ response: { data: { message: "Límite" } } }, "x")).toBe("Límite");
    expect(errText({}, "No se pudo")).toBe("No se pudo");
  });
});

describe("download (CSV)", () => {
  it("entrecomilla lo que trae coma, comillas o saltos", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell("simple")).toBe("simple");
    expect(csvCell(null)).toBe("");
  });
  it("csvText lleva BOM y respeta el separador", () => {
    expect(csvText(["a", "b"], [[1, "x;y"]], ";")).toBe('﻿a;b\n1;"x;y"');
  });
});
