<template>
  <Teleport to="body">
    <div v-if="open" class="cl-bg" @click.self="canClose && $emit('close')">
      <div class="cl-card" role="alertdialog" aria-modal="true" aria-labelledby="cl-title">
        <button v-if="canClose" type="button" class="cl-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        <span class="cl-ico"><PosIcon name="alert" :size="30" /></span>
        <h3 id="cl-title">{{ title }}</h3>
        <p class="cl-lead">{{ lead }}</p>

        <button ref="nowBtn" type="button" class="cl-btn cl-primary" @click="$emit('now')">
          <PosIcon name="lock" :size="18" /> Hacer el corte ahora
        </button>

        <template v-if="status.state === 'ask'">
          <div class="cl-or"><span>o elige a qué hora lo harás</span></div>
          <div class="cl-later">
            <select v-model.number="picked" class="cl-sel" aria-label="Hora del corte">
              <option v-for="o in options" :key="o" :value="o">{{ label(o) }}</option>
            </select>
            <button type="button" class="cl-btn" :disabled="!picked" @click="$emit('postpone', picked)">Posponer</button>
          </div>
          <p class="cl-note">Solo se puede posponer <b>una vez</b>. La caja no puede pasar de {{ maxHours }} horas abierta: el corte debe hacerse a más tardar a las <b>{{ clock(status.maxAt) }}</b>.</p>
        </template>
        <p v-else class="cl-note">{{ note }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import PosIcon from "./PosIcon.js";
import { MAX_HOURS, postponeOptions } from "../cashShift";
import { storeClock } from "../storeTime";
import { venueStore } from "../venueStore";

const props = defineProps({
  session: { type: Object, default: null },
  status: { type: Object, required: true },
  now: { type: Number, default: () => Date.now() },
  canClose: { type: Boolean, default: false },
});
defineEmits(["now", "postpone", "close"]);

const maxHours = MAX_HOURS;
const open = computed(() => props.status.state === "ask" || props.status.state === "blocked");
const options = computed(() => (props.status.state === "ask" ? postponeOptions(props.session, props.now) : []));
const picked = ref(0);
const nowBtn = ref(null);

const clock = (ms) => storeClock(new Date(ms), venueStore.timezone);
function label(ms) {
  const mins = Math.max(1, Math.round((ms - props.now) / 60000));
  const left = mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}` : `${mins} min`;
  return `${clock(ms)} (en ${left})${ms === props.status.maxAt ? " · límite" : ""}`;
}
const hoursText = computed(() => {
  const h = Math.floor(props.status.hours || 0);
  const m = Math.floor(((props.status.hours || 0) - h) * 60);
  return `${h} h ${m} min`;
});

const title = computed(() => {
  if (props.status.state === "ask") return "Han pasado 12 horas con la caja abierta";
  if (props.status.postponed && props.status.hours < MAX_HOURS) return "Llegó la hora del corte";
  return `La caja llegó a ${MAX_HOURS} horas abierta`;
});
const lead = computed(() => {
  const since = `Abrió a las ${clock(props.status.opened)} y lleva ${hoursText.value}.`;
  if (props.status.state === "ask") return `${since} ¿Quieres hacer el corte en este momento o prefieres hacerlo más tarde?`;
  return `${since} Para seguir vendiendo hay que hacer el corte.`;
});
const note = computed(() =>
  props.status.postponed && props.status.hours < MAX_HOURS
    ? "Ya pospusiste el corte una vez y no se puede posponer de nuevo."
    : `El límite de una caja abierta es de ${MAX_HOURS} horas y no se puede posponer más.`
);

// Elige por defecto una hora cercana (la primera de la lista) cada vez que aparece la alerta
watch(
  options,
  (list) => {
    if (!list.includes(picked.value)) picked.value = list[Math.min(3, list.length - 1)] || 0;
  },
  { immediate: true }
);
watch(open, (v) => {
  if (v) nextTick(() => nowBtn.value?.focus());
});
</script>

<style scoped>
.cl-bg {
  position: fixed; inset: 0; z-index: 320;
  background: rgba(10, 18, 32, 0.6);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.cl-card {
  position: relative;
  width: min(26rem, 100%);
  display: grid; justify-items: center; gap: 0.7rem;
  padding: 1.5rem 1.2rem 1.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 1.25rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}
.cl-x {
  position: absolute; top: 0.6rem; right: 0.6rem;
  width: 2.2rem; height: 2.2rem; display: grid; place-items: center;
  border: none; border-radius: 0.6rem; background: var(--timber-surface); color: var(--timber-ink); cursor: pointer;
}
.cl-ico {
  display: grid; place-items: center; width: 3.6rem; height: 3.6rem; border-radius: 50%;
  background: var(--timber-warning-soft); color: var(--timber-warning);
}
.cl-card h3 { margin: 0; font-size: 1.25rem; font-weight: 800; line-height: 1.25; }
.cl-lead { margin: 0; font-size: 0.92rem; line-height: 1.45; color: var(--timber-muted); }
.cl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  min-height: 3rem; padding: 0 1rem; border-radius: 0.85rem; cursor: pointer;
  border: 1px solid var(--timber-line); background: var(--timber-surface); color: var(--timber-ink);
  font: inherit; font-size: 0.98rem; font-weight: 800;
}
.cl-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cl-primary { width: 100%; border-color: transparent; background: var(--timber-primary); color: var(--timber-on-primary, #fff); }
.cl-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--timber-primary) 45%, transparent); outline-offset: 2px; }
.cl-or { width: 100%; display: flex; align-items: center; gap: 0.6rem; color: var(--timber-muted); font-size: 0.8rem; font-weight: 700; }
.cl-or::before, .cl-or::after { content: ""; flex: 1; height: 1px; background: var(--timber-line); }
.cl-later { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; }
.cl-sel {
  min-width: 0; min-height: 3rem; padding: 0 0.7rem; border-radius: 0.85rem;
  border: 1px solid var(--timber-line); background: var(--timber-panel-elevated); color: var(--timber-ink);
  font: inherit; font-size: 0.95rem;
}
.cl-note { margin: 0; font-size: 0.82rem; line-height: 1.4; color: var(--timber-muted); }
</style>
