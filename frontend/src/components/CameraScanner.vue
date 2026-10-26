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

onMounted(async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("sin cámara");
    // La librería pesa: solo se baja cuando alguien abre la cámara
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
    const hints = new Map([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    const started = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.value, (result) => {
      if (!result || stopped) return;
      stopped = true;
      navigator.vibrate?.(40);
      emit("detect", result.getText());
    });
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
