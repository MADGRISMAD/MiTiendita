import { describe, expect, it } from "vitest";
import { cashCloseSections } from "../cashCloseData";

const cut = (extra) => ({
  id: "c1", registerId: 1, fromUser: "Ana", toUser: "Luis", countedCash: 900, expectedCash: 950,
  difference: -50, status: "pending", createdAt: "2026-11-03T15:00:00.000Z", ...extra,
});

describe("corte final por cajero", () => {
  it("dos tramos generan una fila por cajero con sus totales", () => {
    const r = cashCloseSections([
      { user: "Ana", cash: 300, card: 100, total: 400, count: 3 },
      { user: "Luis", cash: 50, card: 0, total: 50, count: 1 },
    ], []);
    expect(r.show).toBe(true);
    expect(r.byCashier.map((x) => [x.label, x.total, x.count])).toEqual([["Ana", 400, 3], ["Luis", 50, 1]]);
    expect(r.byCashier[0]).toMatchObject({ cash: 300, card: 100 });
  });

  it("un tramo sin usuario se rotula «Sin cajero»", () => {
    const r = cashCloseSections([{ user: "", cash: 10, card: 0, total: 10, count: 1 }, { user: "Ana", cash: 5, card: 0, total: 5, count: 1 }], []);
    expect(r.byCashier[0].label).toBe("Sin cajero");
  });

  it("los cortes X traen entrega, recibe, diferencia y estado", () => {
    const r = cashCloseSections([{ user: "Ana", cash: 1, card: 0, total: 1, count: 1 }], [cut({ status: "disputed" })]);
    expect(r.show).toBe(true);
    expect(r.cuts).toHaveLength(1);
    expect(r.cuts[0]).toMatchObject({ from: "Ana", to: "Luis", expected: 950, counted: 900, difference: -50, status: "disputed", statusText: "En disputa", confirmed: null });
    expect(cashCloseSections([], [cut({ status: "disputed", confirmedCash: 880 })]).cuts[0].confirmed).toBe(880);
  });

  it("se omite con un solo tramo y sin cortes (o sin datos)", () => {
    expect(cashCloseSections([{ user: "Ana", cash: 1, card: 0, total: 1, count: 1 }], []).show).toBe(false);
    expect(cashCloseSections(undefined, undefined).show).toBe(false);
  });
});
