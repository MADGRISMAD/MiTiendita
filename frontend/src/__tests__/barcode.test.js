import { describe, expect, it, beforeEach } from "vitest";

// Vitest corre en Node: un localStorage mínimo para la cola
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
import { canon, hasCode, mainCodeOf } from "../barcode";
import { lookupInCatalog } from "../offlineDb";
import { queueCode, readPending, flushPending } from "../pendingCodes";

const foods = [
  { id: "a", name: "Coca 600 ml", barcode: "7501055300075", sku: "7501055300075", altCodes: ["7501055399999"] },
  { id: "b", name: "Jabón Zote", barcode: "", sku: "", altCodes: [] },
  { id: "c", name: "Galletas", barcode: "012345678905", sku: "012345678905" },
];

describe("códigos de barras", () => {
  it("el mismo código escrito distinto es el mismo", () => {
    expect(canon("0012345678905")).toBe(canon("12345678905"));
    expect(canon("AB-1")).toBe(canon("ab-1"));
    expect(hasCode(foods[2], "12345678905")).toBe(true);
    expect(hasCode(foods[2], "7501055300075")).toBe(false);
  });
  it("el escaneo encuentra el principal y los códigos extra, y no confunde productos", () => {
    expect(lookupInCatalog(foods, "7501055300075").id).toBe("a");
    expect(lookupInCatalog(foods, "7501055399999").id).toBe("a"); // versión de temporada
    expect(lookupInCatalog(foods, "12345678905").id).toBe("c"); // UPC-A contra EAN-13
    expect(lookupInCatalog(foods, "9999999999999").matches).toEqual([]);
  });
  it("sin código principal, mainCodeOf queda vacío", () => {
    expect(mainCodeOf(foods[1])).toBe("");
    expect(mainCodeOf(foods[0])).toBe("7501055300075");
  });
});

describe("códigos asignados sin internet", () => {
  beforeEach(() => localStorage.clear());
  it("se guardan, se suben al volver la red y lo rechazado se descarta", async () => {
    queueCode({ tenantId: "t1", id: "a", payload: { altCodes: ["1"] } });
    queueCode({ tenantId: "t1", id: "b", payload: { barcode: "2", sku: "2" } });
    queueCode({ tenantId: "t2", id: "z", payload: { barcode: "3" } });
    expect(readPending()).toHaveLength(3);
    const calls = [];
    const sent = await flushPending("t1", async (id, payload) => {
      calls.push(id);
      if (id === "b") throw { response: { status: 409 } }; // el servidor lo rechazó: se descarta
    });
    expect(sent).toBe(1);
    expect(calls).toEqual(["a", "b"]);
    expect(readPending().map((e) => e.id)).toEqual(["z"]); // lo de otra tienda queda
  });
  it("si no hay red, se queda en la cola", async () => {
    queueCode({ tenantId: "t1", id: "a", payload: {} });
    const sent = await flushPending("t1", async () => {
      throw Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    });
    expect(sent).toBe(0);
    expect(readPending()).toHaveLength(1);
  });
});
