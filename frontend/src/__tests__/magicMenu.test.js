import { describe, expect, it } from "vitest";
import { suggestMenuId } from "../magicMenu";

const menus = [
  { id: "d", name: "Dulce" },
  { id: "s", name: "Sabritas (PepsiCo Botanas)" },
  { id: "c", name: "Coca-Cola (Bebidas, Aguas y Jugos)" },
  { id: "p", name: "PepsiCo Bebidas (Pepsi, Electrolit, Gatorade)" },
  { id: "m", name: "Cervecería Modelo y Heineken México" },
];

describe("suggestMenuId", () => {
  it("las cocas van con Coca-Cola, no con Dulce", () => {
    expect(suggestMenuId("Coca Cola 400 ml", "", menus)).toBe("c");
    expect(suggestMenuId("Coca Cola Grande 3 L", "", menus)).toBe("c");
  });
  it("Pepsi y Electrolit van con PepsiCo Bebidas", () => {
    expect(suggestMenuId("Electrolit 600 ml", "", menus)).toBe("p");
  });
  it("si el producto no dice nada se usa el proveedor", () => {
    expect(suggestMenuId("Refresco 600 ml", "Coca-Cola FEMSA", menus)).toBe("c");
  });
  it("sin pista devuelve vacío", () => {
    expect(suggestMenuId("Producto raro", "Proveedor X", menus)).toBe("");
    expect(suggestMenuId("Coca", "", [])).toBe("");
  });
});
