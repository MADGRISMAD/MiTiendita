import { describe, expect, it } from "vitest";
import { alertDialog, answerDialog, confirmDialog, dialogState, promptDialog } from "../dialog";

describe("ventanas de la app", () => {
  it("separa el título del detalle y aplica los textos por defecto", async () => {
    const p = confirmDialog("¿Quitar este producto?\n\nNo se puede deshacer.\nSe borran sus lotes.", { confirmLabel: "Quitar", tone: "danger" });
    expect(dialogState.current.title).toBe("¿Quitar este producto?");
    expect(dialogState.current.message).toBe("No se puede deshacer.\nSe borran sus lotes.");
    expect(dialogState.current.cancelLabel).toBe("Cancelar");
    expect(dialogState.current.tone).toBe("danger");
    answerDialog(true);
    expect(await p).toBe(true);
    expect(dialogState.current).toBe(null);
  });

  it("confirmar devuelve true o false; los avisos devuelven vacío", async () => {
    const a = confirmDialog("¿Seguro?");
    answerDialog(false);
    expect(await a).toBe(false);
    const b = alertDialog("No se pudo guardar.");
    expect(dialogState.current.kind).toBe("alert");
    answerDialog(true);
    expect(await b).toBeUndefined();
  });

  it("pedir texto devuelve lo escrito, o null si cancelan", async () => {
    const a = promptDialog("Nombre de la categoría", { value: "Botanas" });
    expect(dialogState.current.value).toBe("Botanas");
    answerDialog("Dulces");
    expect(await a).toBe("Dulces");
    const b = promptDialog("Nombre de la categoría");
    answerDialog(null);
    expect(await b).toBe(null);
  });

  it("si piden varias a la vez, salen una tras otra en orden", async () => {
    const first = confirmDialog("Primera");
    const second = confirmDialog("Segunda");
    expect(dialogState.current.title).toBe("Primera");
    answerDialog(true);
    expect(dialogState.current.title).toBe("Segunda");
    answerDialog(false);
    expect([await first, await second]).toEqual([true, false]);
    expect(dialogState.current).toBe(null);
  });

  it("responder sin ventana abierta no hace nada", () => {
    expect(() => answerDialog(true)).not.toThrow();
  });
});
