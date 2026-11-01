import { describe, expect, it, beforeEach } from "vitest";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
import { isBlocking, postponeCut, postponeOptions, postponeState, shiftStatus } from "../cashShift";

const H = 3600000;
const opened = Date.UTC(2026, 10, 1, 8, 0, 0); // el turno abrió a las 08:00 (UTC)
const session = { id: "turno-1", openedAt: new Date(opened).toISOString() };
const at = (hours) => opened + hours * H;

beforeEach(() => {
  store.clear();
  postponeState.sessionId = "";
  postponeState.until = 0;
});

describe("tiempo con la caja abierta", () => {
  it("antes de 12 h todo sigue normal", () => {
    expect(shiftStatus(session, at(11.9)).state).toBe("ok");
    expect(isBlocking(shiftStatus(session, at(11.9)))).toBe(false);
  });

  it("a las 12 h pide decidir y bloquea la venta hasta que se decida", () => {
    const s = shiftStatus(session, at(12));
    expect(s.state).toBe("ask");
    expect(s.postponed).toBe(false);
    expect(isBlocking(s)).toBe(true);
  });

  it("sin turno o sin fecha no hay alerta", () => {
    expect(shiftStatus(null, at(20)).state).toBe("ok");
    expect(shiftStatus({ id: "x" }, at(20)).state).toBe("ok");
  });
});

describe("posponer el corte", () => {
  it("se puede elegir una hora hasta las 15 h, nunca después, y la última opción es exactamente las 15 h", () => {
    const now = at(12.1);
    const options = postponeOptions(session, now);
    expect(options[0]).toBeGreaterThan(now);
    expect(options.at(-1)).toBe(at(15));
    expect(options.every((t) => t <= at(15))).toBe(true);
    expect(options.slice(1).every((t, i) => t - options[i] <= 15 * 60000)).toBe(true);
  });

  it("al posponer se puede vender hasta la hora elegida y después se bloquea", () => {
    const now = at(12.2);
    expect(postponeCut(session, at(13.5), now)).toBe(true);
    expect(shiftStatus(session, at(13)).state).toBe("postponed");
    expect(isBlocking(shiftStatus(session, at(13)))).toBe(false);
    const after = shiftStatus(session, at(13.5));
    expect(after.state).toBe("blocked");
    expect(after.postponed).toBe(true);
  });

  it("solo se puede posponer una vez en el turno", () => {
    expect(postponeCut(session, at(13), at(12.1))).toBe(true);
    expect(postponeCut(session, at(14), at(13.1))).toBe(false);
    expect(postponeState.until).toBe(at(13));
  });

  it("no acepta pasar de 15 h en total, ni una hora que ya pasó", () => {
    expect(postponeCut(session, at(15.01), at(12.1))).toBe(false);
    expect(postponeCut(session, at(20), at(12.1))).toBe(false);
    expect(postponeCut(session, at(12), at(12.1))).toBe(false);
    expect(postponeState.sessionId).toBe("");
  });

  it("a las 15 h se bloquea aunque la prórroga siguiera vigente", () => {
    postponeCut(session, at(15), at(12.1));
    expect(shiftStatus(session, at(14.9)).state).toBe("postponed");
    expect(shiftStatus(session, at(15)).state).toBe("blocked");
  });

  it("una prórroga guardada de otro turno no cuenta en el turno nuevo", () => {
    postponeCut(session, at(14), at(12.1));
    const next = { id: "turno-2", openedAt: new Date(at(30)).toISOString() };
    expect(shiftStatus(next, at(30 + 12)).state).toBe("ask");
    expect(postponeCut(next, at(30 + 13), at(30 + 12))).toBe(true);
  });
});
