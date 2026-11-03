import { describe, expect, it } from "vitest";
import { buildCashClose } from "../escpos";
import { cashCloseSections } from "../cashCloseData";

const base = { shop: "T", closed: true, folio: "1", openedClock: "08:00", openedBy: "Ana", closedClock: "20:00", closedBy: "Luis", salesCount: 1, articles: 1, average: 10, methods: [], totalSold: 10, expectedCash: 10, countedCash: 10, verdictWord: "Cuadra", tickets: [] };
const txt = (b) => Buffer.from(b).toString("latin1");

describe("buildCashClose con secciones", () => {
  it("show=false imprime lo mismo que sin sections", () => {
    const off = cashCloseSections([{ user: "Ana", cash: 1, card: 0, total: 1, count: 1 }], []);
    expect(Buffer.from(buildCashClose({ ...base, sections: off }))).toEqual(Buffer.from(buildCashClose(base)));
  });
  it("imprime por cajero y cortes con disputa", () => {
    const sections = cashCloseSections(
      [{ user: "Ana", cash: 5, card: 0, total: 5, count: 1 }, { user: "Luis", cash: 5, card: 0, total: 5, count: 1 }],
      [{ id: "c", fromUser: "Ana", toUser: "Luis", expectedCash: 100, countedCash: 90, difference: -10, confirmedCash: 80, status: "disputed", createdAt: "2026-11-03T15:00:00Z" }],
    );
    const out = txt(buildCashClose({ ...base, sections }));
    for (const s of ["POR CAJERO", "Ana", "Luis", "En disputa", "Recibe cont"]) expect(out).toContain(s);
  });
});
