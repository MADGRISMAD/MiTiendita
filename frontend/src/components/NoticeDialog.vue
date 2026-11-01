<template>
  <Teleport to="body">
    <div v-if="open" class="pa-bg" :class="{ top }" @click.self="$emit('answer', false)">
      <form class="pa-card" role="alertdialog" aria-modal="true" aria-labelledby="pa-title" @submit.prevent="$emit('answer', true)" @keydown.esc.stop.prevent="$emit('answer', false)">
        <span class="pa-ico" :class="tone"><PosIcon :name="icon" :size="30" /></span>
        <h3 id="pa-title">{{ title }}</h3>
        <p v-if="label || amount" class="pa-sum">
          <span v-if="label">{{ label }}</span>
          <strong v-if="amount">{{ amount }}</strong>
        </p>
        <p v-if="message" class="pa-msg">{{ message }}</p>
        <p v-if="note" class="pa-note">{{ note }}</p>
        <textarea
          v-if="input === 'textarea'"
          ref="field"
          class="pa-field pa-area"
          rows="6"
          :value="modelValue"
          :placeholder="placeholder"
          @input="$emit('update:modelValue', $event.target.value)"
          @keydown.enter.stop
        ></textarea>
        <input
          v-else-if="input === 'text'"
          ref="field"
          class="pa-field"
          type="text"
          autocomplete="off"
          :value="modelValue"
          :placeholder="placeholder"
          @input="$emit('update:modelValue', $event.target.value)"
        />
        <div class="pa-acts" :class="{ single: !showNo }">
          <button v-if="showNo" ref="no" type="button" class="pa-btn" @click="$emit('answer', false)">{{ noLabel }}</button>
          <button ref="yes" type="submit" class="pa-btn pa-primary" :class="tone">
            <PosIcon v-if="yesIcon" :name="yesIcon" :size="18" /> {{ yesLabel }}
          </button>
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
  message: { type: String, default: "" },
  label: { type: String, default: "" },
  amount: { type: String, default: "" },
  note: { type: String, default: "" },
  icon: { type: String, default: "printer" },
  yesIcon: { type: String, default: "printer" },
  yesLabel: { type: String, default: "Imprimir ticket" },
  noLabel: { type: String, default: "No imprimir" },
  showNo: { type: Boolean, default: true },
  tone: { type: String, default: "" }, // '' | 'warn' | 'danger' | 'info'
  input: { type: String, default: "" }, // '' | 'text' | 'textarea'
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  top: { type: Boolean, default: false }, // por encima de cualquier otra ventana
});
defineEmits(["answer", "update:modelValue"]);

const yes = ref(null);
const no = ref(null);
const field = ref(null);
watch(
  () => props.open,
  (v) => {
    if (!v) return;
    nextTick(() => {
      if (field.value) {
        field.value.focus();
        field.value.select?.();
      } else if (props.tone === "danger" && no.value) no.value.focus(); // en lo destructivo, Enter no confirma por accidente
      else yes.value?.focus();
    });
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
.pa-bg.top { z-index: 600; }
.pa-card {
  width: min(24rem, 100%);
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
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
.pa-ico.warn { background: var(--timber-warning-soft); color: var(--timber-warning); }
.pa-ico.danger { background: var(--timber-danger-soft); color: var(--timber-danger); }
.pa-card h3 { margin: 0; font-size: 1.25rem; font-weight: 800; line-height: 1.25; white-space: pre-line; overflow-wrap: anywhere; }
.pa-msg { margin: 0; width: 100%; font-size: 0.92rem; line-height: 1.45; color: var(--timber-muted); white-space: pre-line; overflow-wrap: anywhere; text-align: left; }
.pa-sum {
  display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap; gap: 0.2rem 0.8rem;
  margin: 0; padding: 0.55rem 1rem; border-radius: 0.8rem;
  background: var(--timber-surface); color: var(--timber-muted);
  font-size: 0.9rem; font-weight: 700;
}
.pa-sum strong { color: var(--timber-ink); font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.pa-note { margin: 0; font-size: 0.86rem; line-height: 1.4; color: var(--timber-muted); }
.pa-field {
  width: 100%; box-sizing: border-box; min-height: 3rem; padding: 0.5rem 0.8rem; border-radius: 0.85rem;
  border: 1px solid var(--timber-line); background: var(--timber-panel-elevated); color: var(--timber-ink);
  font: inherit; font-size: 1rem; text-align: left;
}
.pa-area { resize: vertical; min-height: 7rem; font-size: 0.9rem; }
.pa-field:focus { outline: none; border-color: var(--timber-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--timber-primary) 15%, transparent); }
.pa-acts { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 0.5rem; margin-top: 0.2rem; }
.pa-acts.single { grid-template-columns: minmax(0, 1fr); }
.pa-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  min-height: 3.1rem; padding: 0 0.8rem; border-radius: 0.85rem; cursor: pointer;
  border: 1px solid var(--timber-line); background: var(--timber-surface); color: var(--timber-ink);
  font: inherit; font-size: 1rem; font-weight: 800;
}
.pa-primary { border-color: transparent; background: var(--timber-primary); color: var(--timber-on-primary, #fff); }
.pa-primary.danger { background: var(--timber-danger); color: #fff; }
.pa-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--timber-primary) 45%, transparent); outline-offset: 2px; }
</style>
