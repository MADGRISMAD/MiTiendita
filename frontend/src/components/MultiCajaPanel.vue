<template>
  <div class="mc">
    <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
    <p v-if="err" class="adm-banner err" role="alert"><PosIcon name="alert" :size="18" /> <span>{{ err }}</span></p>

    <section v-if="loading" class="adm-card mc-card"><p class="adm-hint">Cargando…</p></section>

    <section v-else-if="mode === 'locked'" class="adm-card mc-card">
      <h3>Pasa a Crecimiento</h3>
      <p class="adm-hint">Con MultiCaja cobras en varias cajas a la vez, cada una con su nombre, su corte y su terminal. Está disponible desde el plan Crecimiento.</p>
      <div class="mc-acts"><router-link to="/billing" class="adm-btn primary">Ver planes</router-link></div>
    </section>

    <section v-else-if="mode === 'contact'" class="adm-card mc-card">
      <h3>Contáctanos</h3>
      <p class="adm-hint">Tu licencia perpetua no incluye MultiCaja por ahora. Escríbenos en Soporte y te ayudamos a activarlo.</p>
    </section>

    <template v-else>
      <section class="adm-card mc-card">
        <h3>Cuántas cajas tienes</h3>
        <p v-if="store.shared" class="adm-hint">Con terminal compartida, todas las cajas usan la terminal de la tienda</p>
        <p class="adm-hint">Tu plan permite hasta {{ limit }} cajas. Cada computadora elige su caja al entrar a cobrar.</p>
        <div class="adm-choices">
          <button v-for="n in counts" :key="n" type="button" class="adm-choice" :aria-pressed="count === n" @click="setCount(n)">
            <strong>{{ n === 1 ? '1 caja' : `${n} cajas` }}</strong>
          </button>
        </div>
      </section>

      <section v-for="r in rows" :key="r.number" class="adm-card mc-card">
        <div class="mc-head">
          <h3>Caja {{ r.number }}</h3>
          <span v-if="r.openBy" class="adm-pill info">Abierta por {{ r.openBy }}</span>
        </div>
        <label class="adm-field">
          <span>Nombre</span>
          <input v-model="names[r.number - 1]" class="adm-inp" type="text" maxlength="30" :placeholder="`Caja ${r.number}`" />
        </label>
        <label class="adm-field">
          <span>Terminal de cobro</span>
          <select class="adm-inp" :value="''" :disabled="busy || !terminals.length || r.number > savedCount" @change="assign(r, $event.target.value)">
            <option value="">{{ termLabel(r) ? termLabel(r) + ' (actual)' : 'Sin terminal' }}</option>
            <option v-for="t in terminals" :key="t.id" :value="t.id">{{ t.id }}</option>
          </select>
        </label>
        <p v-if="r.number > savedCount" class="adm-hint">Guarda las cajas primero</p>
        <p v-else-if="!terminals.length" class="adm-hint">Conecta tu cuenta de Mercado Pago en «Terminal de cobro» para elegir terminal.</p>
        <div v-if="r.openBy" class="mc-acts">
          <button type="button" class="adm-btn danger-ghost" :disabled="busy" @click="release(r)">Liberar</button>
        </div>
      </section>

      <div class="mc-acts">
        <button type="button" class="adm-btn primary" :disabled="busy" @click="save">{{ busy ? 'Guardando…' : 'Guardar cajas' }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { alertDialog, confirmDialog } from "../dialog";
import PosIcon from "./PosIcon.js";
import { apiService, apiErrorMessage } from "../apiService";
import { allowedCounts, multicajaMode } from "../multicajaPlan";

const loading = ref(true);
const busy = ref(false);
const err = ref("");
const flash = ref("");
const plan = ref("");
const limit = ref(1);
const rows = ref([]);
const names = ref([]);
const count = ref(1);
const terminals = ref([]);
const store = ref({}); // estado de la terminal de la tienda (la usa la Caja 1)
const savedCount = ref(1);
const serverRows = ref([]);

// La Caja 1 guarda su terminal a nivel tienda; las demás, en su fila
function termLabel(r) {
  if (r.number === 1) return store.value.configured ? store.value.terminalLabel || "terminal de la tienda" : "";
  return r.terminalId ? r.terminalLabel || r.terminalId : "";
}

const mode = computed(() => multicajaMode(plan.value, limit.value));
const counts = computed(() => allowedCounts(limit.value));

function apply(data) {
  plan.value = data.plan;
  limit.value = data.limit;
  rows.value = data.registers || [];
  names.value = rows.value.map((r) => r.name || "");
  count.value = rows.value.length || 1;
  savedCount.value = count.value;
  serverRows.value = rows.value;
}

// Tras asignar o liberar: solo terminal y apertura; lo editado sin guardar se conserva
function refresh(data) {
  plan.value = data.plan;
  limit.value = data.limit;
  serverRows.value = data.registers || [];
  for (const r of rows.value) {
    const f = serverRows.value.find((x) => x.number === r.number);
    if (f) Object.assign(r, { terminalId: f.terminalId, terminalLabel: f.terminalLabel, openBy: f.openBy, sessionId: f.sessionId });
  }
}

async function loadStore() {
  store.value = await apiService.pointStatus().catch(() => ({}));
}

// Cambiar la cantidad solo ajusta la lista en pantalla; se guarda con «Guardar cajas»
function setCount(n) {
  count.value = n;
  const next = [];
  for (let i = 1; i <= n; i++) {
    next.push(rows.value.find((r) => r.number === i) || { number: i, name: "", terminalId: null, terminalLabel: null, openBy: null });
  }
  rows.value = next;
  names.value = next.map((r, i) => names.value[i] ?? r.name ?? "");
}

async function load() {
  err.value = "";
  try {
    apply(await apiService.getRegisters());
    if (mode.value === "panel") {
      await loadStore();
      terminals.value = await apiService.pointTerminals().catch(() => []);
    }
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudieron leer las cajas.");
  } finally {
    loading.value = false;
  }
}

async function save() {
  const open = serverRows.value.find((x) => x.number > count.value && x.openBy);
  if (open) {
    await alertDialog(`La Caja ${open.number} sigue abierta por ${open.openBy}. Haz su corte o libérala antes de reducir`);
    return;
  }
  busy.value = true;
  err.value = flash.value = "";
  try {
    apply(await apiService.saveRegisters(count.value, names.value.map((n) => String(n || "").trim().slice(0, 30))));
    flash.value = "Cajas guardadas.";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudieron guardar las cajas.");
  } finally {
    busy.value = false;
  }
}

async function assign(r, terminalId) {
  if (!terminalId) return;
  busy.value = true;
  err.value = flash.value = "";
  try {
    // La caja 1 usa la terminal de la tienda (sin número)
    await apiService.registerTerminal(terminalId, r.number > 1 ? r.number : undefined);
    refresh(await apiService.getRegisters());
    if (r.number === 1) await loadStore();
    flash.value = `Terminal asignada a la caja ${r.number}.`;
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo asignar la terminal.");
  } finally {
    busy.value = false;
  }
}

async function release(r) {
  if (!(await confirmDialog(`¿Liberar la caja ${r.number}?\n\nQuien la tiene abierta dejará de usarla y la caja quedará libre.`, { confirmLabel: "Liberar", tone: "danger" }))) return;
  busy.value = true;
  err.value = flash.value = "";
  try {
    await apiService.releaseRegister(r.number);
    refresh(await apiService.getRegisters());
    flash.value = `Caja ${r.number} liberada.`;
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo liberar la caja.");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mc { display: grid; gap: 0.75rem; }
.mc-card { display: grid; gap: 0.85rem; }
.mc-card h3 { margin: 0; font-size: 1.02rem; font-weight: 800; }
.mc-head { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; flex-wrap: wrap; }
.mc-acts { display: flex; flex-wrap: wrap; gap: 0.6rem; }
</style>
