<template>
  <Teleport to="body">
    <div v-if="file" class="pc-bg" @click.self="$emit('cancel')">
      <div class="pc-card" role="dialog" aria-modal="true" aria-label="Encuadrar foto">
        <h3>Encuadra la foto</h3>
        <p v-if="error" class="pc-err" role="alert">{{ error }}</p>
        <p v-else-if="!bitmap" class="pc-hint">Cargando la imagen…</p>
        <template v-else>
          <p class="pc-hint">Arrastra para encuadrar y usa el zoom. Lo que ves dentro del marco es lo que se guarda.</p>
          <div
            ref="frame"
            class="pc-frame"
            :style="{ height: fw + 'px', cursor: drag ? 'grabbing' : 'grab' }"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="up"
            @pointercancel="up"
          >
            <img
              :src="src"
              alt="Vista previa del recorte"
              draggable="false"
              :style="{
                width: bitmap.width * s + 'px',
                height: bitmap.height * s + 'px',
                left: fw / 2 - cx * s + 'px',
                top: fw / 2 - cy * s + 'px',
              }"
            />
          </div>
          <label class="pc-zoom">
            Zoom
            <input v-model.number="zoom" type="range" min="1" max="4" step="0.01" aria-label="Zoom" />
          </label>
        </template>
        <div class="pc-acts">
          <button type="button" class="pc-btn" @click="$emit('cancel')">Cancelar</button>
          <button type="button" class="pc-btn pc-primary" :disabled="!bitmap || busy" @click="confirm">Usar esta foto</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({ file: { type: Object, default: null } });
const emit = defineEmits(["done", "cancel"]);

const OUT = 400; // lado de la foto guardada (cuadrada, igual que las miniaturas)
const MAX_CHARS = 60_000; // peso máximo del resultado (~45 KB de imagen)
const MAX_INPUT = 25 * 1024 * 1024;

const bitmap = ref(null);
const src = ref("");
const error = ref("");
const frame = ref(null);
const fw = ref(300);
const zoom = ref(1);
const cx = ref(0);
const cy = ref(0);
const drag = ref(null);
const busy = ref(false);

const base = computed(() => (bitmap.value ? Math.max(fw.value / bitmap.value.width, fw.value / bitmap.value.height) : 1));
const s = computed(() => base.value * zoom.value);

function clamp() {
  if (!bitmap.value) return;
  const half = fw.value / (2 * s.value);
  cx.value = Math.min(Math.max(cx.value, half), bitmap.value.width - half);
  cy.value = Math.min(Math.max(cy.value, half), bitmap.value.height - half);
}
watch([zoom, fw], clamp);

function release() {
  bitmap.value?.close?.();
  bitmap.value = null;
  if (src.value) URL.revokeObjectURL(src.value);
  src.value = "";
}

watch(
  () => props.file,
  async (f) => {
    release();
    error.value = "";
    if (!f) return;
    if (!f.type?.startsWith("image/")) {
      error.value = "Elige una imagen (JPG, PNG o WebP).";
      return;
    }
    if (f.size > MAX_INPUT) {
      error.value = "La imagen pesa demasiado. Elige una de menos de 25 MB.";
      return;
    }
    try {
      const b = await createImageBitmap(f);
      src.value = URL.createObjectURL(f);
      bitmap.value = b;
      zoom.value = 1;
      cx.value = b.width / 2;
      cy.value = b.height / 2;
      await nextTick();
      fw.value = Math.round(frame.value?.clientWidth || 300);
    } catch {
      error.value = "No se pudo leer la imagen. Prueba con otra.";
    }
  },
  { immediate: true }
);
onBeforeUnmount(release);

function down(e) {
  drag.value = { x: e.clientX, y: e.clientY };
  e.currentTarget.setPointerCapture(e.pointerId);
}
function move(e) {
  if (!drag.value) return;
  cx.value -= (e.clientX - drag.value.x) / s.value;
  cy.value -= (e.clientY - drag.value.y) / s.value;
  drag.value = { x: e.clientX, y: e.clientY };
  clamp();
}
function up() {
  drag.value = null;
}

function render(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  const side = fw.value / s.value;
  ctx.drawImage(bitmap.value, cx.value - side / 2, cy.value - side / 2, side, side, 0, 0, size, size);
  return canvas;
}

// Baja calidad (y luego tamaño) hasta que quepa en MAX_CHARS.
function compress() {
  const side = fw.value / s.value;
  let size = Math.round(Math.min(OUT, side)); // nunca agrandar más allá de los pixeles de la foto
  for (let round = 0; round < 3; round++) {
    const canvas = render(size);
    for (const q of [0.88, 0.8, 0.72, 0.64, 0.56]) {
      const url = canvas.toDataURL("image/jpeg", q);
      if (url.length <= MAX_CHARS) return url;
    }
    size = Math.round(size * 0.8);
  }
  throw new Error("La imagen sigue siendo muy pesada. Prueba con una más sencilla.");
}

function confirm() {
  if (!bitmap.value) return;
  busy.value = true;
  try {
    emit("done", compress());
  } catch (e) {
    error.value = e instanceof Error ? e.message : "No se pudo preparar la foto.";
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.pc-bg {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(10, 18, 32, 0.6);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.pc-card {
  width: min(24rem, 100%);
  background: var(--timber-panel);
  color: var(--timber-ink);
  border: 1px solid var(--timber-line);
  border-radius: 1.2rem;
  padding: 1rem;
  display: grid; gap: 0.7rem;
}
.pc-card h3 { margin: 0; font-size: 1.15rem; font-weight: 700; }
.pc-hint { margin: 0; font-size: 0.85rem; color: var(--timber-muted); }
.pc-err { margin: 0; font-size: 0.88rem; color: var(--timber-danger, #b42318); }
.pc-frame {
  position: relative; width: 100%; overflow: hidden; touch-action: none; user-select: none;
  border-radius: 0.8rem; background: var(--timber-surface);
  outline: 2px solid var(--timber-primary);
}
.pc-frame img { position: absolute; max-width: none; pointer-events: none; }
.pc-zoom { display: flex; align-items: center; gap: 0.7rem; font-size: 0.85rem; font-weight: 700; }
.pc-zoom input { width: 100%; }
.pc-acts { display: flex; justify-content: flex-end; gap: 0.5rem; }
.pc-btn {
  min-height: 2.6rem; padding: 0 1rem; border-radius: 0.7rem; cursor: pointer; font-weight: 700;
  border: 1px solid var(--timber-line); background: var(--timber-surface); color: var(--timber-ink);
}
.pc-primary { background: var(--timber-primary); border-color: var(--timber-primary); color: #fff; }
.pc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
