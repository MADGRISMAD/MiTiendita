import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function fakeUsb() {
  const listeners = {};
  const device = {
    productName: "Térmica",
    configuration: { interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 7, alternateSetting: 0, endpoints: [{ direction: "out", type: "bulk", endpointNumber: 1 }] }] }] },
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    claimInterface: vi.fn(async () => {}),
    selectAlternateInterface: vi.fn(async () => {}),
    transferOut: vi.fn(async () => {}),
  };
  const usb = {
    plugged: true,
    getDevices: vi.fn(async () => (usb.plugged ? [device] : [])),
    requestDevice: vi.fn(async () => device),
    device,
    addEventListener: (name, fn) => (listeners[name] = fn),
    emit: (name) => listeners[name]?.(),
  };
  return usb;
}

describe("la impresora se recupera sola", () => {
  let usb;
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    usb = fakeUsb();
    // Sin navegador simulado: solo lo mínimo que usa el módulo
    const store = { timber_printer: JSON.stringify({ mode: "usb" }) };
    vi.stubGlobal("localStorage", { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) });
    vi.stubGlobal("navigator", { usb });
  });
  // Vue se carga sin documento; el módulo de la impresora solo lo usa al empezar a vigilar
  const load = async () => {
    const t = await import("../thermalPrinter");
    vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {} });
    vi.stubGlobal("window", { addEventListener: () => {} });
    return t;
  };
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("conecta al abrir, avisa al desconectarla y reconecta al volver a conectarla", async () => {
    const t = await load();
    t.startPrinterWatch();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.printerStore.connected).toBe(true);

    usb.plugged = false;
    usb.emit("disconnect");
    expect(t.printerStore.connected).toBe(false);
    expect(t.printerStore.lost).toBe(true);

    await vi.advanceTimersByTimeAsync(1600); // sigue sin cable: no conecta
    expect(t.printerStore.connected).toBe(false);

    usb.plugged = true;
    usb.emit("connect");
    await vi.advanceTimersByTimeAsync(1600);
    expect(t.printerStore.connected).toBe(true);
    expect(t.printerStore.lost).toBe(false);
  });

  it("si el envío falla, se programa la reconexión", async () => {
    const t = await load();
    t.startPrinterWatch();
    await vi.advanceTimersByTimeAsync(10);
    usb.plugged = false;
    const device = (await usb.getDevices.mock.results[0].value)[0];
    device.transferOut.mockRejectedValueOnce(new Error("NetworkError"));
    await expect(t.printBytes(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    expect(t.printerStore.lost).toBe(true);
    usb.plugged = true;
    await vi.advanceTimersByTimeAsync(1600);
    expect(t.printerStore.connected).toBe(true);
  });

  it("elegir otra impresora estando conectada abre el selector otra vez", async () => {
    const t = await load();
    t.startPrinterWatch();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.printerStore.connected).toBe(true);
    await t.connectPrinter({ prompt: true });
    expect(usb.requestDevice).toHaveBeenCalledTimes(1);
    expect(t.printerStore.connected).toBe(true);
  });

  it("dos intentos a la vez abren la impresora una sola vez", async () => {
    const t = await load();
    const [a, b] = await Promise.all([t.connectPrinter(), t.connectPrinter()]);
    expect(a).toBe(b);
    expect(usb.device.open).toHaveBeenCalledTimes(1);
  });

  it("si la impresora no responde al abrir, falla a tiempo y se puede volver a intentar", async () => {
    const t = await load();
    usb.device.open.mockImplementationOnce(() => new Promise(() => {})); // se queda colgada
    const first = t.connectPrinter();
    const failed = expect(first).rejects.toThrow(/a tiempo/);
    await vi.advanceTimersByTimeAsync(12100);
    await failed;
    await expect(t.connectPrinter()).resolves.toBeTruthy();
    expect(t.printerStore.connected).toBe(true);
  });
});
