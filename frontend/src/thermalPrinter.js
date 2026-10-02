// Impresión directa en térmica (sin el diálogo del navegador).
// Se configura por dispositivo (cada caja tiene su impresora): Configuración → Impresora.
//  - usb:       WebUSB (Chrome PC y Android con OTG). En Windows la impresora debe usar el driver WinUSB.
//  - serial:    Web Serial (Chrome/Edge PC) para impresoras USB que aparecen como puerto COM.
//  - bluetooth: Web Bluetooth (Chrome Android/PC) para impresoras Bluetooth LE.
import { reactive } from "vue";
import { buildReceipt, buildTestPage, money } from "./escpos";
import { lineBreakdown, rateOf, round2 } from "./tax";
import { storeParts } from "./storeTime";
import { formatQtyUnit, isBulk, perUnit, unitOf } from "./bulk";
import { appPublicOrigin } from "./apiService";
import { venueStore } from "./venueStore";
import { authStore } from "./authStore";
import { BUSINESS_TYPE_LABEL, closingLine, closingNote, folioOf } from "./ticketShell";

const KEY = "timber_printer";
const PRINT_TIMEOUT_MS = 8000;

// Servicios BLE de las impresoras térmicas genéricas más comunes
const BT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
];

function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      mode: ["browser", "usb", "serial", "bluetooth"].includes(raw.mode) ? raw.mode : "browser",
      paper: raw.paper === "58" ? "58" : "80",
      drawer: Boolean(raw.drawer),
      baudRate: Number(raw.baudRate) || 9600,
      deviceName: String(raw.deviceName || ""),
      portInfo: raw.portInfo && typeof raw.portInfo === "object" ? raw.portInfo : null,
    };
  } catch {
    return { mode: "browser", paper: "80", drawer: false, baudRate: 9600, deviceName: "" };
  }
}

export const printerStore = reactive({ ...readSettings(), connected: false, busy: false });

export function savePrinterSettings(patch = {}) {
  const modeChanged = patch.mode && patch.mode !== printerStore.mode;
  Object.assign(printerStore, patch);
  if (modeChanged) disconnect();
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        mode: printerStore.mode,
        paper: printerStore.paper,
        drawer: printerStore.drawer,
        baudRate: printerStore.baudRate,
        deviceName: printerStore.deviceName,
        portInfo: printerStore.portInfo,
      })
    );
  } catch {
    /* ignore */
  }
}

export function directPrinting() {
  return printerStore.mode !== "browser";
}

export function printerSupport() {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  return { usb: "usb" in nav, serial: "serial" in nav, bluetooth: "bluetooth" in nav };
}

export const MODE_LABEL = {
  browser: "Navegador",
  usb: "Térmica USB",
  serial: "Térmica USB (puerto COM)",
  bluetooth: "Térmica Bluetooth",
};

// —— Conexión ——
let conn = null; // { write(bytes), close() }

function disconnect() {
  const c = conn;
  conn = null;
  printerStore.connected = false;
  if (c) c.close().catch(() => {});
}

function friendly(error) {
  const name = error?.name || "";
  if (name === "NotFoundError") return "No elegiste ninguna impresora.";
  if (name === "SecurityError") return "El navegador no dio permiso para usar la impresora.";
  if (name === "NetworkError") return "Se perdió la conexión con la impresora. Revisa que esté prendida y cerca.";
  if (name === "InvalidStateError") return "La impresora está ocupada por otra pestaña o programa.";
  return error?.message || "La impresora no respondió.";
}

async function openUsb(prompt) {
  // Sin filtro: muchas térmicas genéricas no se anuncian como clase «impresora»
  const device = prompt ? await navigator.usb.requestDevice({ filters: [] }) : (await navigator.usb.getDevices())[0];
  if (!device) return null;
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  let target = null;
  for (const iface of device.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (out && (!target || alt.interfaceClass === 7)) target = { iface, alt, out };
    }
  }
  if (!target) {
    await device.close().catch(() => {});
    throw new Error("Ese dispositivo USB no parece una impresora.");
  }
  await device.claimInterface(target.iface.interfaceNumber);
  if (target.iface.alternates.length > 1) {
    await device.selectAlternateInterface(target.iface.interfaceNumber, target.alt.alternateSetting).catch(() => {});
  }
  return {
    name: device.productName || "Impresora USB",
    async write(bytes) {
      for (let i = 0; i < bytes.length; i += 4096) {
        await device.transferOut(target.out.endpointNumber, bytes.slice(i, i + 4096));
      }
    },
    close: () => device.close(),
  };
}

async function openSerial(prompt) {
  // Recordar el puerto de la impresora para no confundirlo con el de la báscula
  let port;
  if (prompt) {
    port = await navigator.serial.requestPort();
    savePrinterSettings({ portInfo: port.getInfo?.() || null });
  } else {
    const saved = printerStore.portInfo;
    const ports = await navigator.serial.getPorts();
    port = saved
      ? ports.find((p) => {
          const i = p.getInfo?.() || {};
          return i.usbVendorId === saved.usbVendorId && i.usbProductId === saved.usbProductId;
        })
      : ports.length === 1
        ? ports[0]
        : null;
  }
  if (!port) return null;
  if (!port.writable) await port.open({ baudRate: printerStore.baudRate || 9600 });
  const info = port.getInfo?.() || {};
  return {
    name: info.usbProductId ? `Puerto COM (USB ${info.usbVendorId?.toString(16)}:${info.usbProductId.toString(16)})` : "Puerto COM",
    async write(bytes) {
      const writer = port.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    },
    close: () => port.close(),
  };
}

let btDevice = null;
async function openBluetooth(prompt) {
  let device = btDevice;
  if (!device && !prompt && navigator.bluetooth.getDevices) {
    device = (await navigator.bluetooth.getDevices()).find((d) => d.name === printerStore.deviceName) || null;
  }
  if (!device && prompt) {
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  }
  if (!device) return null;
  btDevice = device;
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  let ch = null;
  for (const uuid of BT_SERVICES) {
    let service;
    try {
      service = await server.getPrimaryService(uuid);
    } catch {
      continue;
    }
    for (const c of await service.getCharacteristics()) {
      if (c.properties.writeWithoutResponse || c.properties.write) {
        ch = c;
        break;
      }
    }
    if (ch) break;
  }
  if (!ch) {
    device.gatt.disconnect();
    throw new Error("Esa impresora Bluetooth no es compatible (no encontré por dónde mandarle el ticket).");
  }
  device.addEventListener("gattserverdisconnected", () => {
    if (conn?.bt === device) {
      conn = null;
      printerStore.connected = false;
    }
  }, { once: true });
  return {
    bt: device,
    name: device.name || "Impresora Bluetooth",
    async write(bytes) {
      // BLE manda pocos bytes por paquete
      for (let i = 0; i < bytes.length; i += 180) {
        const chunk = bytes.slice(i, i + 180);
        if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(chunk);
        else await ch.writeValue(chunk);
      }
    },
    async close() {
      device.gatt.disconnect();
    },
  };
}

/**
 * Conecta con la impresora del modo elegido.
 * prompt=true abre el selector del navegador (solo desde un clic); false reusa la que ya tiene permiso.
 */
export async function connectPrinter({ prompt = false } = {}) {
  if (conn) return conn;
  const mode = printerStore.mode;
  const support = printerSupport();
  if (mode === "browser") throw new Error("La impresión directa está apagada.");
  if (!support[mode]) {
    throw new Error(`Este navegador no puede usar «${MODE_LABEL[mode]}». Usa Chrome o Edge.`);
  }
  try {
    const opened =
      mode === "usb" ? await openUsb(prompt) : mode === "serial" ? await openSerial(prompt) : await openBluetooth(prompt);
    if (!opened) throw new Error("No hay impresora conectada. Conéctala en Configuración → Impresora.");
    conn = opened;
    printerStore.connected = true;
    if (prompt) savePrinterSettings({ deviceName: opened.name });
    return conn;
  } catch (error) {
    printerStore.connected = false;
    throw new Error(friendly(error));
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("La impresora no respondió a tiempo. Revisa que esté prendida y con papel.")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Manda bytes a la impresora; si la conexión se cayó, reconecta una vez. */
export async function printBytes(bytes, { prompt = false } = {}) {
  printerStore.busy = true;
  try {
    await withTimeout(
      (async () => {
        try {
          await (await connectPrinter({ prompt })).write(bytes);
        } catch (first) {
          if (!conn) throw first;
          disconnect();
          await (await connectPrinter({ prompt: false })).write(bytes);
        }
      })(),
      PRINT_TIMEOUT_MS
    );
  } catch (error) {
    disconnect();
    throw new Error(friendly(error));
  } finally {
    printerStore.busy = false;
  }
}

function cols() {
  return printerStore.paper === "58" ? 32 : 48;
}

export function printTestPage({ prompt = false } = {}) {
  return printBytes(buildTestPage({ cols: cols(), shop: venueStore.businessName || "Mi Tiendita", openDrawer: printerStore.drawer }), {
    prompt,
  });
}

// —— Datos del ticket (los mismos que PrintOrderView) ——
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const METHOD = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", split: "Tarjeta y efectivo", other: "Otro medio" };

function qtyText(q) {
  const n = Number(q || 0);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}
function pctText(p) {
  return `${Number(Number(p || 0).toFixed(2))}%`;
}

export function receiptData(order) {
  const o = order || {};
  const rate = rateOf(o.taxRate);
  const items = (Array.isArray(o.items) ? o.items : []).map((item) => {
    const b = lineBreakdown(item.price, item.quantity, item.priceIncludesTax, rate);
    const u = unitOf(item);
    return {
      name: item.name || "Producto",
      notes: item.notes || "",
      qtyText: u === "pz" ? qtyText(item.quantity) : formatQtyUnit(item.quantity, u),
      unit: b.unitGross,
      per: perUnit(u),
      amount: b.gross,
      count: Number.isInteger(Number(item.quantity)) && !isBulk(item) ? Number(item.quantity) : 1,
    };
  });
  const units = items.reduce((s, i) => s + i.count, 0);
  const stamp = o.paidAt || o.createdAt;
  const p = storeParts(stamp, venueStore.timezone);
  const pad = (n) => String(n).padStart(2, "0");
  const paid = o.paymentStatus === "paid";
  const method = o.paymentMethod;
  const methodDetail = [];
  if (method === "split") {
    methodDetail.push(["Tarjeta", money(o.cardAmount)], ["Efectivo", money(o.cashReceived)]);
  } else if (Number(o.cashReceived)) {
    methodDetail.push(["Recibido", money(o.cashReceived)]);
  }
  if (o.paymentReference) methodDetail.push(["Ref.", String(o.paymentReference)]);
  const takesCash = method === "cash" || method === "split";
  const tax = Number(o.tax || 0);
  const base = round2(Number(o.subtotal || 0) - Number(o.discountAmount || 0) - tax);
  let stampWord = "PAGADO";
  if (o.paymentStatus === "refunded") stampWord = "DEVUELTA";
  else if (o.status === "cancelled") stampWord = "CANCELADA";
  else if (!paid) stampWord = "POR COBRAR";
  else if (o.offlinePending) stampWord = "PAGADO - SIN SINCRONIZAR";

  return {
    shop: venueStore.businessName || "Mi Tiendita",
    kind: BUSINESS_TYPE_LABEL[venueStore.businessType] || BUSINESS_TYPE_LABEL.abarrotes,
    address: venueStore.address || "",
    phone: venueStore.phone || "",
    folio: folioOf(o.id),
    dateText: p ? `${DAYS[p.weekday]} ${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year} ${pad(p.hour)}:${pad(p.minute)}` : "",
    cashier: authStore.username || "",
    countText: `${units} ${units === 1 ? "artículo" : "artículos"}`,
    items,
    subtotal: o.subtotal,
    discountPercentText: o.discountAmount ? pctText(o.discountPercent) : "",
    discountAmount: o.discountAmount,
    cardExtraTax: o.cardExtraTax,
    deliveryFee: o.deliveryFee,
    total: o.total,
    taxNote: `Precios con IVA incluido. Base ${money(base)} + IVA ${pctText(rate * 100)} ${money(tax)}`,
    paid,
    methodText: METHOD[method] || "-",
    methodDetail,
    change: paid && takesCash && Number(o.cashReceived || 0) > 0 ? Number(o.change || 0) : null,
    saved: paid && Number(o.discountAmount) ? o.discountAmount : 0,
    stamp: stampWord,
    offlinePending: Boolean(o.offlinePending),
    thanks: closingLine(venueStore.businessType),
    note: closingNote(venueStore.businessType),
    invoiceUrl: paid && o.invoiceToken && !o.offlinePending ? `${appPublicOrigin()}/factura/${o.invoiceToken}` : "",
  };
}

/** Imprime el ticket de una venta en la térmica. openDrawer abre el cajón (pago en efectivo). */
export function printReceiptDirect(order, { openDrawer = false } = {}) {
  const bytes = buildReceipt(receiptData(order), { cols: cols(), openDrawer: openDrawer && printerStore.drawer });
  return printBytes(bytes);
}
