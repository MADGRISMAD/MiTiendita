<template>
  <div class="cx">
    <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
    <p v-if="err" class="adm-banner err" role="alert"><PosIcon name="alert" :size="18" /> <span>{{ err }}</span></p>

    <section v-if="loading" class="adm-card cx-card"><p class="adm-hint">Cargando…</p></section>

    <section v-else-if="closed" class="adm-card cx-card">
      <h3>Caja cerrada</h3>
      <p class="adm-hint">Abre la caja para hacer un Corte X</p>
    </section>

    <section v-else-if="unsynced > 0" class="adm-card cx-card">
      <h3>Ventas pendientes</h3>
      <p class="adm-hint">Hay ventas sin sincronizar; espera a que se envíen antes de entregar la caja</p>
    </section>

    <section v-else-if="!sent" class="adm-card cx-card">
      <h3>Efectivo esperado</h3>
      <p class="cx-big">{{ money(data.expected) }}</p>
      <label class="adm-field">
        <span>Efectivo contado</span>
        <input v-model="counted" class="adm-inp" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
      </label>
      <p v-if="hasCount" class="cx-diff" :class="label">
        {{ label === "cuadra" ? "Cuadra" : label === "sobra" ? `Sobran ${money(diff)}` : `Faltan ${money(-diff)}` }}
      </p>
      <label class="adm-field">
        <span>Entrega la caja a</span>
        <select v-model="toUser" class="adm-inp">
          <option value="" disabled>Elige a quién</option>
          <option v-for="m in team" :key="m.username" :value="m.username">{{ m.name || m.username }}</option>
        </select>
      </label>
      <p v-if="!team.length" class="adm-hint">No hay otra persona en el equipo a quien entregar la caja</p>
      <div class="cx-acts">
        <button type="button" class="adm-btn primary" :disabled="busy || !hasCount || !toUser" @click="send">{{ busy ? "Enviando…" : "Entregar la caja" }}</button>
      </div>
    </section>
  </div>
</template>

<script setup>
// Corte X: cuenta el efectivo y lo entrega a otra persona sin cerrar la caja.
import { computed, onMounted, ref } from "vue";
import PosIcon from "./PosIcon.js";
import { apiService, apiErrorMessage } from "../apiService";
import { authStore } from "../authStore";
import { listUnsynced } from "../offlineDb";
import { cutDifference, cutLabel } from "../cutX";

const loading = ref(true);
const busy = ref(false);
const err = ref("");
const flash = ref("");
const sent = ref(false);
const closed = ref(false);
const unsynced = ref(0);
const data = ref({ expected: 0 });
const team = ref([]);
const counted = ref("");
const toUser = ref("");

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const hasCount = computed(() => counted.value !== "" && Number.isFinite(Number(counted.value)) && Number(counted.value) >= 0);
const diff = computed(() => cutDifference(counted.value, data.value.expected));
const label = computed(() => cutLabel(diff.value));

// Ventas hechas sin conexión que aún no llegan al servidor: se atribuirían a quien recibe
async function countUnsynced() {
  try {
    return (await listUnsynced(authStore.tenantId)).length;
  } catch {
    return 0;
  }
}

async function load() {
  err.value = "";
  try {
    unsynced.value = await countUnsynced();
    data.value = await apiService.cashCutExpected();
    team.value = await apiService.cashCutTeam();
  } catch (e) {
    if (e?.response?.data?.code === "cash_closed") closed.value = true;
    else err.value = apiErrorMessage(e, "No se pudo leer el efectivo de la caja.");
  } finally {
    loading.value = false;
  }
}

async function send() {
  busy.value = true;
  err.value = "";
  try {
    // Se revisa otra vez: pudo quedar una venta pendiente mientras se contaba
    unsynced.value = await countUnsynced();
    if (unsynced.value > 0) return;
    await apiService.createCashCut(toUser.value, Number(counted.value));
    const who = team.value.find((m) => m.username === toUser.value);
    flash.value = `Caja entregada a ${who?.name || toUser.value}. Falta que confirme el efectivo.`;
    sent.value = true;
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo entregar la caja.");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.cx { display: grid; gap: 0.75rem; }
.cx-card { display: grid; gap: 0.85rem; }
.cx-card h3 { margin: 0; font-size: 1.02rem; font-weight: 800; }
.cx-big { margin: 0; font-size: 1.8rem; font-weight: 800; }
.cx-diff { margin: 0; font-weight: 800; }
.cx-diff.cuadra { color: var(--timber-success, #1a7f4b); }
.cx-diff.sobra { color: var(--timber-warning); }
.cx-diff.falta { color: var(--timber-danger, #c0392b); }
.cx-acts { display: flex; flex-wrap: wrap; gap: 0.6rem; }
</style>
