import { describe, expect, it } from "vitest";
import { pickerNotice, needsChoice, registerLabel, registerLockText, getRegistersCached, invalidateRegisters, setCartDirty, isCartDirty } from "../registerPicker";

describe("selector de caja", () => {
  it("avisos por código", () => {
    expect(pickerNotice("register_in_use", { openedBy: "Ana" })).toBe("Abierta por Ana en otro equipo");
    expect(pickerNotice("register_in_use", {})).toBe("Abierta por otro usuario en otro equipo");
    expect(pickerNotice("register_unknown")).toMatch(/Elige otra/);
    expect(pickerNotice("cash_closed")).toBe("");
  });
  it("pide elegir solo con varias cajas y sin elección", () => {
    const two = { registers: [{ number: 1 }, { number: 2 }] };
    expect(needsChoice(two, false)).toBe(true);
    expect(needsChoice(two, true)).toBe(false);
    expect(needsChoice({ registers: [{ number: 1 }] }, false)).toBe(false);
    expect(needsChoice(null, false)).toBe(false);
  });
  it("nombre de la caja solo con varias", () => {
    const data = { registers: [{ number: 1, name: "Caja 1" }, { number: 2, name: "Mostrador" }] };
    expect(registerLabel(data, 2)).toBe("Mostrador");
    expect(registerLabel(data, 3)).toBe("Caja 3");
    expect(registerLabel({ registers: [{ number: 1, name: "X" }] }, 1)).toBe("");
    expect(registerLabel(undefined, 1)).toBe("");
  });
});

describe("bloqueo de cajas ocupadas", () => {
  it("deshabilita las abiertas por otro, salvo la guardada en este navegador", () => {
    const r = { number: 2, openBy: "Ana" };
    expect(registerLockText(r, 1, true)).toBe("Abierta por Ana en otro equipo");
    expect(registerLockText(r, 2, true)).toBe("");
    expect(registerLockText(r, 2, false)).toBe("Abierta por Ana en otro equipo");
    expect(registerLockText({ number: 3 }, 1, true)).toBe("");
  });
});

describe("cajas en caché y venta en curso", () => {
  it("una sola consulta hasta invalidar o vencer", async () => {
    invalidateRegisters();
    let n = 0;
    const f = async () => ({ n: ++n });
    const a = await getRegistersCached(f, 1000);
    const b = await getRegistersCached(f, 2000);
    expect(b).toBe(a);
    expect(n).toBe(1);
    await getRegistersCached(f, 1000 + 20000);
    expect(n).toBe(2);
    invalidateRegisters();
    await getRegistersCached(f, 50000);
    expect(n).toBe(3);
  });
  it("un fallo no se queda en caché", async () => {
    invalidateRegisters();
    await expect(getRegistersCached(async () => { throw new Error("x"); }, 1)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(await getRegistersCached(async () => 5, 2)).toBe(5);
  });
  it("indicador de venta en curso", () => {
    setCartDirty(true);
    expect(isCartDirty()).toBe(true);
    setCartDirty(false);
    expect(isCartDirty()).toBe(false);
  });
});
