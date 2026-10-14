import { describe, expect, it } from "vitest";
import * as bulk from "../bulk";

describe("bulk (venta a granel)", () => {
  it("exporta las unidades de venta y la unidad por omisión es pieza", () => {
    expect(bulk.SALE_UNITS).toBeTruthy();
    expect(bulk.unitOf({})).toBe("pz");
  });
  it("redondea cantidades a 3 decimales", () => {
    expect(bulk.roundQty(0.1 + 0.2)).toBe(0.3);
    expect(bulk.roundQty(1.23456)).toBe(1.235);
  });
});
