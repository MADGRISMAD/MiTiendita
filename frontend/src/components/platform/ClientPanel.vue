<template>
  <div class="pf-card-stack">
    <button type="button" class="adm-btn sm pf-back" @click="$emit('close')">← Todos los clientes</button>

    <p v-if="loading && !detail" class="adm-card pf-muted">Abriendo al cliente…</p>
    <p v-else-if="error && !detail" class="adm-banner err" role="alert">{{ error }}</p>

    <template v-else-if="detail">
      <section class="adm-card pf-card-stack">
        <div class="pf-detail-head">
          <ClientAvatar :name="detail.businessName" size="3rem" />
          <div class="pf-grow">
            <h2>{{ detail.businessName }}</h2>
            <div class="meta" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem">
              <StatusPill :client="detail" />
              <span class="pf-chip">{{ detail.planName }}</span>
              <span class="pf-chip">{{ lastSeen(detail) === "nunca ha entrado" ? "Nunca ha entrado" : `Entró ${lastSeen(detail)}` }}</span>
            </div>
          </div>
          <div v-if="canEdit" class="acts">
            <button v-if="detail.billingStatus !== 'suspended'" type="button" class="adm-btn sm danger-ghost" @click="openSuspend">
              Suspender
            </button>
            <button v-else type="button" class="adm-btn sm primary" @click="showReactivate = true">Reactivar</button>
          </div>
        </div>

        <nav class="adm-tabs" aria-label="Secciones del cliente">
          <button
            v-for="t in TABS"
            :key="t.id"
            type="button"
            :class="{ on: tab === t.id }"
            :aria-pressed="tab === t.id"
            @click="setTab(t.id)"
          >
            {{ t.label }}<em v-if="t.id === 'correo' && waitingCount" class="alert">{{ waitingCount }}</em>
          </button>
        </nav>
        <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
        <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>

        <ClientSummaryTab v-if="tab === 'resumen'" :detail="detail" :can-edit="canEdit" @changed="reloadQuiet()" />
        <ClientLicenseTab v-else-if="tab === 'licencia'" :detail="detail" :can-edit="canEdit" @saved="onSaved" />
        <ClientPeopleTab v-else-if="tab === 'personas'" :detail="detail" />
        <ClientMailTab v-else-if="tab === 'correo'" :detail="detail" :initial-ticket="initialTicket" @waiting="onWaiting" />
        <ClientActivityTab v-else :detail="detail" />
      </section>
    </template>

    <Teleport to="body">
      <div v-if="showSuspend" class="adm-dlg-bg" @click.self="showSuspend = false">
        <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="sus-title" @submit.prevent="suspend">
          <div class="adm-dlg-head">
            <span class="adm-dlg-ico warn">!</span>
            <div>
              <h3 id="sus-title">Suspender {{ detail?.businessName }}</h3>
              <p>Nadie de la tienda podrá cobrar hasta que la reactives.</p>
            </div>
            <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showSuspend = false">×</button>
          </div>
          <label class="adm-field">
            <span>Motivo (queda en la historia)</span>
            <input v-model="reason" class="adm-inp" required minlength="3" maxlength="200" placeholder="Ej. falta de pago, a petición del cliente" />
          </label>
          <div class="adm-dlg-acts">
            <button type="button" class="adm-btn" @click="showSuspend = false">Cancelar</button>
            <button type="submit" class="adm-btn danger" :disabled="busy">{{ busy ? "Suspendiendo…" : "Suspender" }}</button>
          </div>
        </form>
      </div>
      <div v-if="showReactivate" class="adm-dlg-bg" @click.self="showReactivate = false">
        <div class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="rea-title">
          <div class="adm-dlg-head">
            <span class="adm-dlg-ico">↺</span>
            <div>
              <h3 id="rea-title">Reactivar {{ detail?.businessName }}</h3>
              <p>Elige cómo vuelve a entrar.</p>
            </div>
            <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showReactivate = false">×</button>
          </div>
          <div class="adm-choices">
            <button type="button" class="adm-choice" :disabled="busy" @click="reactivate('active')">
              <strong>Activa, con su plan</strong>
              <small>Vuelve a cobrar de inmediato y corre un mes nuevo.</small>
            </button>
            <button type="button" class="adm-choice" :disabled="busy" @click="reactivate('trial')">
              <strong>Con una prueba nueva</strong>
              <small>Le damos días para decidir antes de cobrar.</small>
            </button>
          </div>
          <div class="adm-dlg-acts">
            <button type="button" class="adm-btn" @click="showReactivate = false">Cancelar</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ClientAvatar from "./ClientAvatar.vue";
import StatusPill from "./StatusPill.vue";
import ClientSummaryTab from "./ClientSummaryTab.vue";
import ClientLicenseTab from "./ClientLicenseTab.vue";
import ClientPeopleTab from "./ClientPeopleTab.vue";
import ClientMailTab from "./ClientMailTab.vue";
import ClientActivityTab from "./ClientActivityTab.vue";
import { apiService } from "../../apiService";
import { lastSeen } from "../../platform/format";

const props = defineProps({
  id: { type: String, required: true },
  canEdit: { type: Boolean, default: false },
  waiting: { type: Number, default: 0 },
  initialTicket: { type: String, default: "" },
});
const emit = defineEmits(["updated", "close"]);

const route = useRoute();
const router = useRouter();

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "licencia", label: "Licencia y datos" },
  { id: "personas", label: "Personas" },
  { id: "correo", label: "Correo" },
  { id: "actividad", label: "Historia" },
];
const tab = computed(() => (TABS.some((t) => t.id === route.query.v) ? route.query.v : "resumen"));
function setTab(id) {
  router.replace({ query: { ...route.query, v: id === "resumen" ? undefined : id } }).catch(() => {});
}

const detail = ref(null);
const loading = ref(true);
const error = ref("");
const ok = ref("");
const busy = ref(false);
const showSuspend = ref(false);
const showReactivate = ref(false);
const reason = ref("");
const ticketCount = ref(null);
let version = 0;
let seq = 0;

const waitingCount = computed(() => (ticketCount.value != null ? ticketCount.value : props.waiting));

function adopt(card) {
  detail.value = { ...card, updatedAtKey: ++version };
  emit("updated", card);
}

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = "";
  ok.value = "";
  detail.value = null;
  ticketCount.value = null;
  try {
    const card = await apiService.platformGetTenant(props.id);
    if (mine === seq) adopt(card);
  } catch (e) {
    if (mine === seq) error.value = typeof e.response?.data === "string" ? e.response.data : "No pude abrir a este cliente.";
  } finally {
    if (mine === seq) loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

function onSaved(card) {
  // El detalle del backend trae usage; el guardado no: se vuelve a leer completo
  ok.value = "Cambios guardados.";
  reloadQuiet(card);
}
async function reloadQuiet(fallback) {
  try {
    adopt(await apiService.platformGetTenant(props.id));
  } catch {
    if (fallback) adopt(fallback);
  }
}
function onWaiting(n) {
  ticketCount.value = n;
}

function openSuspend() {
  reason.value = "";
  showSuspend.value = true;
}
async function suspend() {
  busy.value = true;
  error.value = "";
  try {
    await apiService.platformSuspendTenant(props.id, reason.value.trim());
    showSuspend.value = false;
    ok.value = "Tienda suspendida.";
    await reloadQuiet();
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude suspender la tienda.";
    showSuspend.value = false;
  } finally {
    busy.value = false;
  }
}
async function reactivate(mode) {
  busy.value = true;
  error.value = "";
  try {
    await apiService.platformReactivateTenant(props.id, mode);
    showReactivate.value = false;
    ok.value = mode === "trial" ? "Tienda reactivada con una prueba nueva." : "Tienda reactivada.";
    await reloadQuiet();
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude reactivar la tienda.";
    showReactivate.value = false;
  } finally {
    busy.value = false;
  }
}
</script>
