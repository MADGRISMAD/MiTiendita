import { describe, expect, it } from "vitest";
import { appVersion, applyUpdate, checkForUpdate, updateState } from "../appUpdate";

describe("appUpdate (aviso de versión nueva)", () => {
  it("al inicio no hay actualización pendiente ni búsqueda en curso", () => {
    expect(updateState.available).toBe(false);
    expect(updateState.checking).toBe(false);
    expect(typeof appVersion).toBe("string");
  });
  it("buscar actualizaciones sin service worker (desarrollo) no falla ni deja la búsqueda abierta", async () => {
    await expect(checkForUpdate({ force: true })).resolves.toBeUndefined();
    expect(updateState.checking).toBe(false);
  });
  it("aplicar sin service worker recarga la página", () => {
    let reloaded = false;
    globalThis.window = { location: { reload: () => (reloaded = true) } };
    applyUpdate();
    expect(reloaded).toBe(true);
    delete globalThis.window;
  });
});
