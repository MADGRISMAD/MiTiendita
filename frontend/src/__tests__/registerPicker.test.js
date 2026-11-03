import { describe, expect, it } from "vitest";
import { pickerNotice, needsChoice, registerLabel } from "../registerPicker";

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
