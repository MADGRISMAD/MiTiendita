<template>
  <Teleport to="body">
    <div v-if="pickerState.open" class="rp-bg" @click.self="close">
      <div class="rp-card" role="dialog" aria-modal="true" aria-labelledby="rp-title" @keydown.esc.stop.prevent="close">
        <h3 id="rp-title">¿Qué caja es esta computadora?</h3>
        <p v-if="pickerState.notice" class="rp-notice" role="alert">{{ pickerState.notice }}</p>
        <p v-if="error" class="rp-notice" role="alert">{{ error }}</p>
        <p v-if="loading" class="rp-note">Cargando cajas…</p>
        <ul v-else class="rp-list">
          <li v-for="r in shown" :key="r.number">
            <button type="button" class="rp-opt" :class="{ cur: r.number === current }" :disabled="Boolean(lockText(r))" @click="choose(r.number)">
              <strong>{{ r.name || `Caja ${r.number}` }}</strong>
              <span v-if="lockText(r)" class="rp-state warn">{{ lockText(r) }}</span>
              <span v-else-if="r.openBy" class="rp-state warn">Abierta por {{ r.openBy }}</span>
              <span v-else class="rp-state">Libre</span>
            </button>
          </li>
        </ul>
        <button v-if="!pickerState.forced && registerStore.hasChoice()" type="button" class="rp-cancel" @click="close">Cancelar</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Elegir la caja de esta computadora (planes con varias cajas). Se abre sola si falta la elección
// o si el servidor contesta register_unknown / register_in_use (ver registerPicker.js).
import { computed, onMounted, ref, watch } from "vue";
import { apiService } from "../apiService";
import { authStore } from "../authStore";
import { registerStore } from "../registerStore";
import { confirmDialog } from "../dialog";
import { getRegistersCached, invalidateRegisters, isCartDirty, needsChoice, pickerState, registerLockText } from "../registerPicker";

const registers = ref([]);
const loading = ref(false);
const error = ref("");
const current = computed(() => registerStore.current());
const fetchRegisters = () => getRegistersCached(() => apiService.getRegisters());
// Abierta por otro (o marcada por el servidor como ocupada en otro equipo): no se puede elegir
const lockText = (r) => pickerState.blocked[r.number] || registerLockText(r, registerStore.current(), registerStore.hasChoice());
const shown = computed(() => registers.value.filter((r) => r.active !== false));

async function load() {
  loading.value = true;
  error.value = "";
  try {
    invalidateRegisters(); // al abrirse por un error la lista debe estar al día
    const data = await fetchRegisters();
    registers.value = Array.isArray(data?.registers) ? data.registers : [];
  } catch {
    error.value = "No se pudieron cargar las cajas.";
  } finally {
    loading.value = false;
  }
}

// Primera vez en esta computadora: si el plan tiene varias cajas, se pide elegir
async function checkFirstTime() {
  if (!authStore.token || !authStore.tenantId || registerStore.hasChoice() || pickerState.open) return;
  try {
    const data = await fetchRegisters();
    if (needsChoice(data, registerStore.hasChoice())) {
      registers.value = data.registers;
      pickerState.notice = "";
      pickerState.forced = true;
      pickerState.open = true;
    }
  } catch {
    /* sin permiso o sin internet: se queda en la caja 1 */
  }
}

function close() {
  if (pickerState.forced) return;
  pickerState.open = false;
}

async function choose(n) {
  // Recargar perdería la venta en curso (el ticket actual no se guarda): se pregunta primero
  if (isCartDirty() && !(await confirmDialog("Hay una venta en curso; al cambiar de caja se perderá.\n\n¿Continuar?", { confirmLabel: "Continuar", tone: "danger" }))) return;
  const persisted = registerStore.set(n);
  pickerState.open = false;
  pickerState.blocked = {};
  pickerState.notice = "";
  invalidateRegisters();
  // Sin poder guardar la elección una recarga la olvidaría: las pantallas se refrescan solas
  if (persisted) window.location.reload();
  else pickerState.version += 1;
}

// Abierto por un error del servidor: se cargan las cajas para mostrarlas
watch(
  () => pickerState.open,
  (open) => {
    if (open && !registers.value.length) load();
  }
);
watch(() => authStore.token, checkFirstTime);
onMounted(checkFirstTime);
</script>

<style scoped>
.rp-bg {
  position: fixed; inset: 0; z-index: 650;
  background: rgba(10, 18, 32, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.rp-card {
  width: min(26rem, 100%); max-height: calc(100dvh - 2rem); overflow-y: auto;
  display: grid; gap: 0.7rem; padding: 1.3rem 1.2rem 1.2rem;
  border: 1px solid var(--timber-line); border-radius: 1.25rem;
  background: var(--timber-panel); color: var(--timber-ink);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}
.rp-card h3 { margin: 0; font-size: 1.2rem; font-weight: 800; line-height: 1.25; }
.rp-notice { margin: 0; padding: 0.55rem 0.8rem; border-radius: 0.8rem; background: var(--timber-warning-soft); color: var(--timber-warning); font-size: 0.9rem; font-weight: 700; }
.rp-note { margin: 0; color: var(--timber-muted); font-size: 0.9rem; }
.rp-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.rp-opt {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;
  min-height: 3.2rem; padding: 0.4rem 0.9rem; border-radius: 0.85rem; cursor: pointer;
  border: 1px solid var(--timber-line); background: var(--timber-surface); color: var(--timber-ink);
  font: inherit; text-align: left;
}
.rp-opt.cur { border-color: var(--timber-primary); }
.rp-opt:disabled { opacity: 0.6; cursor: not-allowed; }
.rp-state { font-size: 0.82rem; color: var(--timber-muted); text-align: right; }
.rp-state.warn { color: var(--timber-warning); font-weight: 700; }
.rp-cancel {
  min-height: 2.8rem; border-radius: 0.85rem; cursor: pointer;
  border: 1px solid var(--timber-line); background: var(--timber-surface); color: var(--timber-ink); font: inherit; font-weight: 800;
}
.rp-opt:focus-visible, .rp-cancel:focus-visible { outline: 3px solid color-mix(in srgb, var(--timber-primary) 45%, transparent); outline-offset: 2px; }
</style>
