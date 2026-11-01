import { describe, expect, it } from "vitest";
import { canvasToBitmap } from "../ticketRaster";

// Un lienzo falso de width×height con tinta (negro) en las filas indicadas y blanco en el resto
function fakeCanvas(width, height, inkRows, { inkCols = [0, width - 1], gray = 0 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const y of inkRows) {
    for (const x of inkCols) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
  }
  return { width, height, getContext: () => ({ getImageData: () => ({ data }) }) };
}

describe("lienzo → bitmap de la impresora", () => {
  it("quita el blanco de arriba (deja 3 filas) y de abajo (deja 12)", () => {
    const b = canvasToBitmap(fakeCanvas(16, 100, [30, 31, 40]));
    expect(b.bytesPerRow).toBe(2);
    expect(b.height).toBe(40 + 12 - (30 - 3)); // de la fila 27 a la 51
    // la primera fila que se imprime es la 27: vacía; la 30 queda en el renglón 3
    expect(b.data.subarray(0, 2).every((v) => v === 0)).toBe(true);
    expect(b.data[3 * 2]).toBe(0x80); // x = 0
    expect(b.data[3 * 2 + 1]).toBe(0x01); // x = 15
  });

  it("no pasa de los límites del lienzo", () => {
    const b = canvasToBitmap(fakeCanvas(8, 10, [0, 9]));
    expect(b.height).toBe(10);
  });

  it("un lienzo en blanco no revienta", () => {
    const b = canvasToBitmap(fakeCanvas(8, 10, []));
    expect(b.height).toBeGreaterThanOrEqual(1);
  });

  it("los grises claros no se imprimen y los oscuros sí", () => {
    const claro = canvasToBitmap(fakeCanvas(8, 10, [4], { gray: 200 }));
    expect(claro.data.every((v) => v === 0)).toBe(true);
    const oscuro = canvasToBitmap(fakeCanvas(8, 10, [4], { gray: 120 }));
    expect(oscuro.data.some((v) => v !== 0)).toBe(true);
  });
});
