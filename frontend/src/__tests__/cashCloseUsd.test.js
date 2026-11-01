import { describe, expect, it } from "vitest";
import { buildCashCloseData } from "../cashCloseData";

const order = (extra) => ({ id: "o" + Math.random().toString(16).slice(2, 8), paymentStatus: "paid", paymentMethod: "cash", total: 200, ...extra });
const session = { id: "s1", status: "open", openingFloat: 500, openedAt: new Date().toISOString() };

describe("corte con dólares", () => {
  it("lo pagado en dólares no cuenta como pesos en el cajón y se muestra aparte", () => {
    const orders = [
      order({ usdReceived: 5, usdRate: 20, usdPesos: 100, cashReceived: 200 }), // US$5 + $100 pesos
      order({ usdReceived: 20, usdRate: 20, usdPesos: 400, cashReceived: 400 }), // US$20, cambio $200 en pesos
      order({ total: 20 }), // venta normal en pesos
    ];
    const d = buildCashCloseData(session, orders, new Date());
    // Ventas en efectivo: 420 en total, de los cuales 500 fueron dólares → −80 en pesos; fondo 500 → deben haber 420
    expect(d.cashSales).toBe(-80);
    expect(d.expectedCash).toBe(420);
    expect(d.usdReceived).toBe(25);
  });

  it("sin dólares todo queda como antes", () => {
    const d = buildCashCloseData(session, [order({}), order({ total: 50 })], new Date());
    expect(d.cashSales).toBe(250);
    expect(d.expectedCash).toBe(750);
    expect(d.usdReceived).toBe(0);
  });

  it("un turno cerrado usa lo que dejó guardado el servidor", () => {
    const closed = { ...session, status: "closed", closedAt: new Date().toISOString(), expectedCash: 420, expectedUsd: 25, countedCash: 420 };
    const d = buildCashCloseData(closed, [order({ usdReceived: 5, usdRate: 20, usdPesos: 100 })], new Date());
    expect(d.expectedCash).toBe(420);
    expect(d.usdReceived).toBe(25);
  });
});
