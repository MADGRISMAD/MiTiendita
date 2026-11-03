import { describe, expect, it } from "vitest";
import { cutDifference, cutLabel, syncBlockMessage } from "../cutX";

describe("cutX", () => {
  it("la diferencia es contado menos esperado", () => {
    expect(cutDifference(790, 800)).toBe(-10);
    expect(cutDifference(805, 800)).toBe(5);
    expect(cutDifference(0, 0)).toBe(0);
  });
  it("redondea a centavos", () => {
    expect(cutDifference(0.3, 0.1 + 0.2)).toBe(0);
  });
  it("etiqueta cuadra, sobra o falta", () => {
    expect(cutLabel(-10)).toBe("falta");
    expect(cutLabel(0)).toBe("cuadra");
    expect(cutLabel(5)).toBe("sobra");
    expect(cutLabel(cutDifference(0, 0))).toBe("cuadra");
  });
});

describe("syncBlockMessage", () => {
  it("sin ventas sin enviar no bloquea", () => {
    expect(syncBlockMessage([])).toBe("");
  });
  it("pendientes piden esperar", () => {
    expect(syncBlockMessage([{ status: "pending" }, { status: "failed" }])).toBe("Hay ventas sin sincronizar; espera a que se envíen antes de entregar la caja");
  });
  it("solo con error pide revisar o soporte", () => {
    expect(syncBlockMessage([{ status: "failed" }])).toContain("error de sincronización");
  });
});
