import { describe, expect, it } from "vitest";
import { cleanDisabled, defaultPayMethod, onlyEnabled, payMethodOn, PAY_METHOD_IDS } from "../payMethods";

const METHODS = [{ id: "cash" }, { id: "card" }, { id: "transfer" }, { id: "split" }, { id: "credit" }, { id: "other" }];

describe("formas de pago apagadas", () => {
  it("sin nada apagado se ofrecen todas", () => {
    expect(onlyEnabled(METHODS, []).map((m) => m.id)).toEqual(PAY_METHOD_IDS);
    expect(onlyEnabled(METHODS, undefined)).toHaveLength(6);
  });

  it("quita las apagadas y deja las demás en su orden", () => {
    expect(onlyEnabled(METHODS, ["transfer", "other"]).map((m) => m.id)).toEqual(["cash", "card", "split", "credit"]);
  });

  it("Mixto desaparece si se apaga Efectivo o Tarjeta", () => {
    expect(payMethodOn("split", ["card"])).toBe(false);
    expect(payMethodOn("split", ["cash"])).toBe(false);
    expect(payMethodOn("split", ["other"])).toBe(true);
  });

  it("no se pueden apagar todas: siempre queda una", () => {
    expect(cleanDisabled(PAY_METHOD_IDS)).toHaveLength(5);
    expect(onlyEnabled(METHODS, PAY_METHOD_IDS).length).toBeGreaterThan(0);
  });

  it("ignora ids que no existen y repetidos", () => {
    expect(cleanDisabled(["card", "card", "bitcoin", 7, null])).toEqual(["card"]);
  });

  it("la forma de pago inicial es Efectivo, o la primera encendida si Efectivo está apagado", () => {
    expect(defaultPayMethod(METHODS, [])).toBe("cash");
    expect(defaultPayMethod(METHODS, ["cash"])).toBe("card");
    expect(defaultPayMethod(METHODS, ["cash", "card"])).toBe("transfer");
  });
});
