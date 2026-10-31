<template>
  <Teleport to="body">
    <div v-if="open" class="pa-bg" @click.self="$emit('answer', false)">
      <form class="pa-card" role="alertdialog" aria-labelledby="pa-title" @submit.prevent="$emit('answer', true)" @keydown.esc.stop.prevent="$emit('answer', false)">
        <span class="pa-ico"><PosIcon name="printer" :size="30" /></span>
        <h3 id="pa-title">{{ title }}</h3>
        <p v-if="label || amount" class="pa-sum">
          <span v-if="label">{{ label }}</span>
          <strong v-if="amount">{{ amount }}</strong>
        </p>
        <p v-if="note" class="pa-note">{{ note }}</p>
        <div class="pa-acts">
          <button type="button" class="pa-btn" @click="$emit('answer', false)">No imprimir</button>
          <button ref="yes" type="submit" class="pa-btn pa-primary"><PosIcon name="printer" :size="18" /> {{ yesLabel }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";
import PosIcon from "./PosIcon.js";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "¿Quieres imprimir el ticket de esta compra?" },
  label: { type: String, default: "" },
  amount: { type: String, default: "" },
  note: { type: String, default: "" },
  yesLabel: { type: String, default: "Imprimir ticket" },
});
defineEmits(["answer"]);

const yes = ref(null);
watch(
  () => props.open,
  (v) => {
    if (v) nextTick(() => yes.value?.focus());
  },
  { immediate: true }
);
</script>

<style scoped>
.pa-bg {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(10, 18, 32, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.pa-card {
  width: min(24rem, 100%);
  display: grid; justify-items: center; gap: 0.7rem;
  padding: 1.4rem 1.2rem 1.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 1.25rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}
.pa-ico {
  display: grid; place-items: center;
  width: 3.6rem; height: 3.6rem; border-radius: 50%;
  background: color-mix(in srgb, var(--timber-primary) 14%, transparent);
  color: var(--timber-primary);
}
.pa-card h3 { margin: 0; font-size: 1.25rem; font-weight: 800; line-height: 1.25; }
.pa-sum {
  display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 0.2rem 0.8rem;
  margin: 0; padding: 0.55rem 1rem; border-radius: 0.8rem;
  background: var(--timber-surface); color: var(--timber-muted);
  font-size: 0.9rem; font-weight: 700;
}
.pa-sum strong { color: var(--timber-ink); font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.pa-note { margin: 0; font-size: 0.86rem; line-height: 1.4; color: var(--timber-muted); }
.pa-acts { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 0.5rem; margin-top: 0.2rem; }
.pa-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  min-height: 3.1rem; padding: 0 0.8rem; border-radius: 0.85rem; cursor: pointer;
  border: 1px solid var(--timber-line); background: var(--timber-surface); color: var(--timber-ink);
  font: inherit; font-size: 1rem; font-weight: 800;
}
.pa-primary { border-color: transparent; background: var(--timber-primary); color: var(--timber-on-primary, #fff); }
.pa-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--timber-primary) 45%, transparent); outline-offset: 2px; }
</style>
