import { describe, expect, it } from "vitest";
import { allowedCounts, multicajaMode } from "../multicajaPlan";

describe("multicajaPlan", () => {
  it("Básico queda bloqueado y Perpetua pide contacto", () => {
    expect(multicajaMode("basic", 1)).toBe("locked");
    expect(multicajaMode("perpetual", 4)).toBe("contact");
  });
  it("Crecimiento y Pro muestran el panel según el límite", () => {
    expect(multicajaMode("growth", 2)).toBe("panel");
    expect(multicajaMode("pro", 4)).toBe("panel");
    expect(multicajaMode("growth", undefined)).toBe("locked");
  });
  it("cantidades de 1 al límite", () => {
    expect(allowedCounts(2)).toEqual([1, 2]);
    expect(allowedCounts(4)).toEqual([1, 2, 3, 4]);
    expect(allowedCounts(0)).toEqual([1]);
  });
});
