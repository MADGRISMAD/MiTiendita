<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="!busy && $emit('close')">
      <form class="adm-dlg" role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc" @submit.prevent="submit">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico warn">!</span>
          <div>
            <h3 id="del-title">{{ title }}</h3>
            <p id="del-desc">Esta acción no se puede deshacer.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" :disabled="busy" @click="$emit('close')">×</button>
        </div>

        <div class="del-box">
          <p class="del-label">Se eliminará</p>
          <ul>
            <li v-for="line in removes" :key="line">{{ line }}</li>
          </ul>
          <template v-if="keeps.length">
            <p class="del-label keep">Se conserva</p>
            <ul>
              <li v-for="line in keeps" :key="line">{{ line }}</li>
            </ul>
          </template>
        </div>

        <label class="adm-field">
          <span>
            Para confirmar, escribe <b class="del-name">{{ expected }}</b>
          </span>
          <input
            ref="input"
            v-model="typed"
            class="adm-inp"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="expected"
            :disabled="busy"
          />
        </label>
        <p v-if="error" class="pf-err" role="alert">{{ error }}</p>

        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" :disabled="busy" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn danger" :disabled="busy || !matches">{{ busy ? "Eliminando…" : confirmLabel }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";

const props = defineProps({
  title: { type: String, required: true },
  expected: { type: String, required: true }, // el texto exacto que hay que escribir (el nombre)
  removes: { type: Array, default: () => [] },
  keeps: { type: Array, default: () => [] },
  confirmLabel: { type: String, default: "Eliminar" },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["confirm", "close"]);

const input = ref(null);
const typed = ref("");
const norm = (v) => String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
const matches = computed(() => norm(typed.value) === norm(props.expected));

function submit() {
  if (matches.value && !props.busy) emit("confirm", typed.value);
}
onMounted(() => nextTick(() => input.value?.focus()));
</script>

<style scoped>
.del-box { padding: 0.7rem 0.85rem; border: 1px solid var(--timber-danger, #b3261e); border-radius: 0.8rem; background: color-mix(in srgb, var(--timber-danger, #b3261e) 7%, transparent); display: grid; gap: 0.25rem; }
.del-box ul { margin: 0; padding-left: 1.1rem; font-size: 0.88rem; line-height: 1.45; }
.del-label { margin: 0; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--timber-danger, #b3261e); }
.del-label.keep { margin-top: 0.4rem; color: var(--timber-muted); }
.del-name { word-break: break-word; user-select: all; }
</style>
