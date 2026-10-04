<template>
  <div class="pt">
    <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
    <p v-if="err" class="adm-banner err" role="alert"><PosIcon name="alert" :size="18" /> <span>{{ err }}</span></p>

    <!-- Estado -->
    <section class="adm-card pt-card">
      <h3>Terminal Mercado Pago</h3>
      <p class="adm-hint">
        Vincula tu terminal Point para que, al cobrar con tarjeta, el monto aparezca solo en la terminal y la venta se
        registre únicamente cuando el pago salga aprobado. El dinero llega directo a tu cuenta de Mercado Pago.
      </p>

      <p v-if="loading" class="pt-state off"><i></i>Verificando…</p>

      <template v-else-if="st">
        <!-- Lista -->
        <p v-if="st.configured && st.ok" class="pt-state on">
          <i></i>Terminal lista: <b>{{ st.terminalLabel }}</b>
        </p>

        <!-- Vinculada pero con problema -->
        <div v-else-if="st.configured" class="pt-alert" role="alert">
          <strong>Reconecta tu terminal</strong>
          <span>{{ st.message }}</span>
        </div>

        <p v-else-if="st.connected" class="pt-state off"><i></i>Cuenta conectada · falta elegir la terminal</p>
        <p v-else class="pt-state off"><i></i>Sin vincular: con tarjeta se cobra manualmente.</p>

        <div class="pt-acts">
          <!-- 1. Conectar / reconectar cuenta -->
          <button
            v-if="!st.connected || needsReconnect"
            type="button"
            class="adm-btn primary"
            :disabled="busy"
            @click="connect"
          >
            {{ st.connected ? 'Reconectar cuenta de Mercado Pago' : 'Conectar mi cuenta de Mercado Pago' }}
          </button>

          <!-- 2. Elegir terminal -->
          <button
            v-if="st.connected && !needsReconnect && (!st.configured || st.code === 'terminal_missing' || st.ok)"
            type="button"
            class="adm-btn"
            :class="{ primary: !st.configured || st.code === 'terminal_missing' }"
            :disabled="busy"
            @click="loadTerminals"
          >
            {{ st.configured && st.ok ? 'Cambiar terminal' : 'Elegir mi terminal' }}
          </button>

          <button v-if="st.configured" type="button" class="adm-btn" :disabled="busy" @click="load(true)">Verificar conexión</button>
          <button v-if="st.connected" type="button" class="adm-btn danger-ghost" :disabled="busy" @click="unlink">Desvincular</button>
        </div>
      </template>
    </section>

    <!-- Selector de terminal -->
    <section v-if="terminals" class="adm-card pt-card">
      <h3>Elige tu terminal</h3>
      <p v-if="!terminals.length" class="adm-hint">
        No encontramos terminales en tu cuenta. Revisa que tu Point esté dada de alta en la app de Mercado Pago y vuelve a intentar.
      </p>
      <ul v-else class="pt-list">
        <li v-for="t in terminals" :key="t.id">
          <span>
            <strong>{{ t.id }}</strong>
            <small>Modo: {{ t.operating_mode || '—' }}</small>
          </span>
          <button type="button" class="adm-btn primary" :disabled="busy" @click="pick(t.id)">Usar esta</button>
        </li>
      </ul>
      <p class="adm-hint">Al vincularla, la terminal pasa a modo punto de venta (PDV): solo recibe cobros desde este sistema.</p>
    </section>

    <section class="adm-card pt-card">
      <h3>Cómo funciona</h3>
      <ol class="pt-steps">
        <li>Conectas tu cuenta de Mercado Pago (una sola vez).</li>
        <li>Eliges cuál de tus terminales usará esta tienda.</li>
        <li>En la caja eliges «Tarjeta» y el cobro llega a la terminal. Si se desconecta, te avisamos antes de cobrar.</li>
      </ol>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PosIcon from "./PosIcon.js";
import { apiService } from "../apiService";

const route = useRoute();
const router = useRouter();
const st = ref(null);
const terminals = ref(null);
const loading = ref(true);
const busy = ref(false);
const err = ref("");
const flash = ref("");

const needsReconnect = computed(() => ["token_revoked", "not_connected", "unauthorized"].includes(st.value?.code));

function msgOf(e, fallback) {
  const d = e?.response?.data;
  return (typeof d === "string" && d) || d?.message || (!e?.response ? "Sin conexión con el servidor." : fallback);
}

async function load(announce = false) {
  loading.value = !announce;
  busy.value = announce;
  err.value = "";
  try {
    st.value = await apiService.pointStatus();
    if (announce) flash.value = st.value.ok ? "La terminal está conectada y lista." : "";
  } catch (e) {
    err.value = msgOf(e, "No se pudo verificar la terminal.");
  } finally {
    loading.value = false;
    busy.value = false;
  }
}

async function connect() {
  busy.value = true;
  err.value = "";
  try {
    const { url } = await apiService.pointConnect();
    window.location.href = url; // vuelve a /settings?s=terminal&mp=ok
  } catch (e) {
    err.value = msgOf(e, "No se pudo iniciar la conexión.");
    busy.value = false;
  }
}

async function loadTerminals() {
  busy.value = true;
  err.value = "";
  try {
    terminals.value = await apiService.pointTerminals();
  } catch (e) {
    err.value = msgOf(e, "No se pudieron leer tus terminales.");
  } finally {
    busy.value = false;
  }
}

async function pick(id) {
  busy.value = true;
  err.value = "";
  try {
    await apiService.pointRegisterTerminal(id);
    terminals.value = null;
    flash.value = "Terminal vinculada. Ya puedes cobrar con tarjeta desde la caja.";
    await load();
  } catch (e) {
    err.value = msgOf(e, "No se pudo vincular la terminal.");
  } finally {
    busy.value = false;
  }
}

async function unlink() {
  if (!window.confirm("¿Desvincular tu cuenta y terminal? Con tarjeta se cobrará manualmente hasta que la vuelvas a vincular.")) return;
  busy.value = true;
  try {
    await apiService.pointDisconnect();
    terminals.value = null;
    flash.value = "Terminal desvinculada.";
    await load();
  } catch (e) {
    err.value = msgOf(e, "No se pudo desvincular.");
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  const mp = String(route.query.mp || "");
  if (mp) {
    const { mp: _drop, ...rest } = route.query;
    router.replace({ query: rest }).catch(() => {});
  }
  await load();
  if (mp === "ok") {
    flash.value = "Cuenta de Mercado Pago conectada. Ahora elige tu terminal.";
    if (st.value?.connected && !st.value.configured) loadTerminals();
  } else if (mp === "error") {
    err.value = "No se pudo conectar tu cuenta de Mercado Pago. Intenta de nuevo.";
  }
});
</script>

<style scoped>
.pt { display: grid; gap: 0.75rem; }
.pt-card { display: grid; gap: 0.85rem; }
.pt-card h3 { margin: 0; font-size: 1.02rem; font-weight: 800; }
.pt-state { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 0.9rem; font-weight: 700; }
.pt-state i { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--timber-muted); }
.pt-state.on { color: var(--timber-success); }
.pt-state.on i { background: var(--timber-success); box-shadow: 0 0 0 3px var(--timber-success-soft); }
.pt-state.off { color: var(--timber-muted); }
.pt-alert {
  display: grid;
  gap: 0.15rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.85rem;
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
  font-size: 0.9rem;
}
.pt-acts { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.pt-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.pt-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel-elevated);
}
.pt-list span { display: grid; min-width: 0; }
.pt-list strong { overflow: hidden; text-overflow: ellipsis; font-size: 0.9rem; }
.pt-list small { font-size: 0.78rem; color: var(--timber-muted); }
.pt-steps { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.3rem; font-size: 0.9rem; color: var(--timber-muted); }
</style>