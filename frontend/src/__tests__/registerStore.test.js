import { describe, expect, it, beforeEach } from "vitest";

const store = new Map();
let broken = false;
globalThis.localStorage = {
  getItem: (k) => {
    if (broken) throw new Error("bloqueado");
    return store.has(k) ? store.get(k) : null;
  },
  setItem: (k, v) => {
    if (broken) throw new Error("bloqueado");
    store.set(k, String(v));
  },
  removeItem: (k) => {
    if (broken) throw new Error("bloqueado");
    store.delete(k);
  },
  clear: () => store.clear(),
};
import { registerStore, registerHeaders } from "../registerStore";

beforeEach(() => {
  store.clear();
  broken = false;
  registerStore.clear();
});

describe("caja de esta computadora", () => {
  it("sin dato es la caja 1", () => {
    expect(registerStore.current()).toBe(1);
  });
  it("set persiste y clear vuelve a 1", () => {
    registerStore.set(2);
    expect(store.get("mt_register")).toBe("2");
    expect(registerStore.current()).toBe(2);
    registerStore.clear();
    expect(registerStore.current()).toBe(1);
  });
  it("valores inválidos son 1", () => {
    for (const v of ["0", "9", "abc", "-1", "1.5", ""]) {
      store.set("mt_register", v);
      expect(registerStore.current()).toBe(1);
    }
    registerStore.set(9);
    expect(registerStore.current()).toBe(1);
  });
  it("si localStorage falla no rompe", () => {
    broken = true;
    expect(registerStore.current()).toBe(1);
    expect(() => registerStore.set(2)).not.toThrow();
    expect(() => registerStore.clear()).not.toThrow();
  });
});

describe("id de computadora", () => {
  it("se genera una vez y se conserva", () => {
    const a = registerStore.deviceId();
    expect(a.length).toBeGreaterThan(8);
    expect(store.get("mt_device")).toBe(a);
    expect(registerStore.deviceId()).toBe(a);
  });
  it("sin localStorage devuelve uno estable en la carga", () => {
    broken = true;
    const a = registerStore.deviceId();
    expect(a.length).toBeGreaterThan(8);
    expect(registerStore.deviceId()).toBe(a);
  });
});

describe("cabeceras", () => {
  it("manda X-Register y X-Device", () => {
    registerStore.set(3);
    expect(registerHeaders()).toEqual({ "X-Register": "3", "X-Device": registerStore.deviceId() });
  });
});

describe("hasChoice", () => {
  it("es falso sin dato o con dato inválido", () => {
    expect(registerStore.hasChoice()).toBe(false);
    store.set("mt_register", "abc");
    expect(registerStore.hasChoice()).toBe(false);
    store.set("mt_register", "99");
    expect(registerStore.hasChoice()).toBe(false);
  });
  it("es verdadero tras elegir y falso tras limpiar", () => {
    registerStore.set(2);
    expect(registerStore.hasChoice()).toBe(true);
    registerStore.clear();
    expect(registerStore.hasChoice()).toBe(false);
  });
  it("sin almacenamiento es falso hasta elegir; luego vale en memoria", () => {
    broken = true;
    expect(registerStore.hasChoice()).toBe(false);
    expect(registerStore.set(3)).toBe(false);
    expect(registerStore.hasChoice()).toBe(true);
    expect(registerStore.current()).toBe(3);
    registerStore.clear();
    expect(registerStore.hasChoice()).toBe(false);
  });
  it("set devuelve true si guardó", () => {
    expect(registerStore.set(2)).toBe(true);
  });
});
