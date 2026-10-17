import { describe, expect, it } from "vitest";
import { printRoute, savePrintRoute } from "../printRoute";

describe("printRoute (dónde se imprime lo que se cobra)", () => {
  it("por omisión se imprime en este dispositivo y hay un identificador de estación estable", () => {
    expect(printRoute.mode).toBe("local");
    expect(typeof printRoute.stationId).toBe("string");
    expect(printRoute.stationId.length).toBeGreaterThan(8);
  });
  it("cambia de modo sin perder el identificador", () => {
    const id = printRoute.stationId;
    savePrintRoute({ mode: "remote" });
    expect(printRoute.mode).toBe("remote");
    savePrintRoute({ mode: "station" });
    expect(printRoute.mode).toBe("station");
    expect(printRoute.stationId).toBe(id);
    savePrintRoute({ mode: "local" });
  });
});
