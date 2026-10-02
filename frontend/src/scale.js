// Báscula conectada por puerto serie (USB o COM) con Web Serial: Chrome o Edge en PC.
// Se configura por dispositivo en Configuración → Báscula. Lee el peso continuo y lo deja en scaleStore.
import { reactive } from "vue";
import { parseScaleWeight } from "./bulk";

const KEY = "timber_scale";
// Cuánto tiempo sin lecturas para dar la báscula por muda
const STALE_MS = 3000;

// Cómo pide el peso cada báscula. «continuous»: lo manda sola todo el tiempo.
export const SCALE_COMMANDS = {
  continuous: { label: "La báscula lo manda sola (continuo)", bytes: null },
  P: { label: "Pedir con «P» (Torrey y compatibles)", bytes: [0x50, 0x0d] },
  W: { label: "Pedir con «W»", bytes: [0x57, 0x0d] },
  ENQ: { label: "Pedir con ENQ (CAS y compatibles)", bytes: [0x05] },
};

function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      enabled: Boolean(raw.enabled),
      baudRate: Number(raw.baudRate) || 9600,
      command: SCALE_COMMANDS[raw.command] ? raw.command : "continuous",
      unit: raw.unit === "g" || raw.unit === "lb" ? raw.unit : "kg",
      portInfo: raw.portInfo && typeof raw.portInfo === "object" ? raw.portInfo : null,
    };
  } catch {
    return { enabled: false, baudRate: 9600, command: "continuous", unit: "kg", portInfo: null };
  }
}

export const scaleStore = reactive({
  ...readSettings(),
  connected: false,
  connecting: false,
  /** Último peso leído en kg (null si no ha llegado nada) */
  kg: null,
  /** Hora (ms) de la última lectura */
  at: 0,
  error: "",
});

export function scaleSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function saveScaleSettings(patch = {}) {
  const reopen =
    scaleStore.connected && (patch.baudRate != null && patch.baudRate !== scaleStore.baudRate);
  Object.assign(scaleStore, patch);
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        enabled: scaleStore.enabled,
        baudRate: scaleStore.baudRate,
        command: scaleStore.command,
        unit: scaleStore.unit,
        portInfo: scaleStore.portInfo,
      })
    );
  } catch {
    /* ignore */
  }
  if (patch.enabled === false) disconnectScale();
  else if (reopen) disconnectScale().then(() => connectScale());
  else if (patch.command != null) restartPolling();
}

/** Hay báscula activa y mandando peso reciente. */
export function scaleLive(now = Date.now()) {
  return scaleStore.enabled && scaleStore.connected && scaleStore.kg != null && now - scaleStore.at < STALE_MS;
}

let port = null;

function samePort(info, saved) {
  return Boolean(saved && info && info.usbVendorId === saved.usbVendorId && info.usbProductId === saved.usbProductId);
}

/** El puerto que se eligió para la báscula (no el de la impresora). */
async function rememberedPort() {
  const ports = await navigator.serial.getPorts();
  if (scaleStore.portInfo) return ports.find((p) => samePort(p.getInfo?.(), scaleStore.portInfo)) || null;
  return ports.length === 1 ? ports[0] : null;
}
let reader = null;
let pollTimer = null;
let buffer = "";

function friendly(error) {
  const name = error?.name || "";
  if (name === "NotFoundError") return "No elegiste ninguna báscula.";
  if (name === "SecurityError") return "El navegador no dio permiso para usar la báscula.";
  if (name === "InvalidStateError") return "La báscula está ocupada por otra pestaña o programa.";
  if (name === "NetworkError") return "Se desconectó la báscula.";
  return error?.message || "No se pudo conectar la báscula.";
}

function onChunk(text) {
  buffer += text;
  // Cada lectura termina en salto de línea o retorno; si no llega, se toma lo acumulado
  const parts = buffer.split(/[\r\n\x03]+/);
  buffer = parts.pop() || "";
  if (buffer.length > 64) {
    parts.push(buffer);
    buffer = "";
  }
  for (const line of parts) {
    const kg = parseScaleWeight(line, scaleStore.unit);
    if (kg != null) {
      scaleStore.kg = kg;
      scaleStore.at = Date.now();
    }
  }
}

async function readLoop() {
  const decoder = new TextDecoder();
  while (port?.readable) {
    reader = port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onChunk(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      scaleStore.error = friendly(error);
      break;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
      reader = null;
    }
  }
  scaleStore.connected = false;
}

function restartPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  const bytes = SCALE_COMMANDS[scaleStore.command]?.bytes;
  if (!bytes || !port?.writable) return;
  pollTimer = setInterval(async () => {
    if (!port?.writable) return;
    const writer = port.writable.getWriter();
    try {
      await writer.write(Uint8Array.from(bytes));
    } catch {
      /* la siguiente vuelta lo reintenta */
    } finally {
      writer.releaseLock();
    }
  }, 300);
}

/**
 * Conecta la báscula. prompt=true abre el selector de puertos (solo desde un clic);
 * false reusa el puerto que ya tiene permiso (al abrir Vender).
 */
export async function connectScale({ prompt = false } = {}) {
  if (scaleStore.connected || scaleStore.connecting) return true;
  if (!scaleSupported()) {
    scaleStore.error = "Este navegador no puede leer la báscula. Usa Chrome o Edge en PC.";
    return false;
  }
  scaleStore.connecting = true;
  scaleStore.error = "";
  try {
    const p = prompt ? await navigator.serial.requestPort() : await rememberedPort();
    if (!p) return false;
    if (!p.readable) await p.open({ baudRate: scaleStore.baudRate || 9600 });
    port = p;
    scaleStore.connected = true;
    scaleStore.kg = null;
    scaleStore.at = 0;
    buffer = "";
    if (prompt) saveScaleSettings({ enabled: true, portInfo: p.getInfo?.() || null });
    readLoop();
    restartPolling();
    return true;
  } catch (error) {
    scaleStore.error = friendly(error);
    scaleStore.connected = false;
    return false;
  } finally {
    scaleStore.connecting = false;
  }
}

export async function disconnectScale() {
  clearInterval(pollTimer);
  pollTimer = null;
  const p = port;
  port = null;
  scaleStore.connected = false;
  scaleStore.kg = null;
  try {
    await reader?.cancel();
  } catch {
    /* ignore */
  }
  try {
    await p?.close();
  } catch {
    /* ignore */
  }
}

/** Pitido corto y vibración al tomar el peso. */
export function weighBeep() {
  try {
    navigator.vibrate?.(60);
  } catch {
    /* ignore */
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1320;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}
