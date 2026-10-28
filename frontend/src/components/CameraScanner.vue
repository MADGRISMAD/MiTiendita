<template>
  <div class="cam-back" @click.self="$emit('close')">
    <div class="cam" role="dialog" aria-modal="true" aria-label="Escanear con la cámara">
      <header class="cam-head">
        <strong>Escanear con la cámara</strong>
        <button type="button" class="cam-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" /></button>
      </header>
      <div class="cam-view">
        <video ref="video" muted playsinline></video>
        <span v-if="!error" class="cam-line"></span>
      </div>
      <p class="cam-msg" :class="{ err: !!error }">{{ error || "Apunta al código de barras. Se lee solo." }}</p>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import PosIcon from "./PosIcon";

const emit = defineEmits(["detect", "close"]);
const video = ref(null);
const error = ref("");
let controls = null;
let stopped = false;

function messageFor(err) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "Este navegador no deja usar la cámara aquí (hace falta HTTPS).";
  if (err?.name === "NotAllowedError") return "Permiso de cámara denegado. Actívalo en los ajustes del navegador y vuelve a intentar.";
  if (err?.name === "NotFoundError") return "No se encontró una cámara en este dispositivo.";
  return "No se pudo abrir la cámara.";
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];
const CONSTRAINTS = { video: { facingMode: { ideal: "environment" } }, audio: false };

function found(text) {
  if (stopped) return;
  stopped = true;
  navigator.vibrate?.(40);
  emit("detect", text);
}

/** Detector del navegador (en Android usa el motor de Google): más rápido. null si este navegador no lo trae. */
async function startNative() {
  if (!("BarcodeDetector" in window)) return null;
  const known = (await window.BarcodeDetector.getSupportedFormats?.().catch(() => [])) || [];
  const formats = FORMATS.filter((f) => known.includes(f));
  if (!formats.includes("ean_13")) return null;
  const detector = new window.BarcodeDetector({ formats });
  const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  const el = video.value;
  el.srcObject = stream;
  await el.play().catch(() => {});
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || stopped || el.readyState < 2) return;
    busy = true;
    try {
      const [hit] = await detector.detect(el);
      if (hit?.rawValue) found(hit.rawValue);
    } catch {
      /* un cuadro que no se pudo leer: se intenta con el siguiente */
    }
    busy = false;
  }, 80);
  return { stop: () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); el.srcObject = null; } };
}

/** Librería zxing para los navegadores sin detector propio (iPhone, etc.). Se baja solo cuando se necesita. */
async function startZxing() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS.map((f) => BarcodeFormat[f.toUpperCase()])]]);
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
  return reader.decodeFromConstraints(CONSTRAINTS, video.value, (result) => result && found(result.getText()));
}

onMounted(async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("sin cámara");
    let started = null;
    try {
      started = await startNative();
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "NotFoundError") throw err;
    }
    started = started || (await startZxing());
    if (stopped) started.stop();
    else controls = started;
  } catch (err) {
    error.value = messageFor(err);
  }
});

onBeforeUnmount(() => {
  stopped = true;
  controls?.stop();
});
</script>

<style scoped>
.cam-back { position: fixed; inset: 0; z-index: 2000; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; padding: 16px; }
.cam { width: min(100%, 440px); background: #fff; border-radius: 16px; overflow: hidden; color: #1a1a1a; }
.cam-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; }
.cam-x { border: 0; background: none; width: 32px; height: 32px; cursor: pointer; color: inherit; }
.cam-view { position: relative; background: #000; aspect-ratio: 4 / 3; }
.cam-view video { width: 100%; height: 100%; object-fit: cover; }
.cam-line { position: absolute; left: 10%; right: 10%; top: 50%; height: 2px; background: #e5484d; box-shadow: 0 0 8px #e5484d; }
.cam-msg { margin: 0; padding: 12px 14px; font-size: 14px; text-align: center; }
.cam-msg.err { color: #c0392b; }
</style>
