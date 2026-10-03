<template>
  <div class="pf-card-stack">
    <div class="pf-tools">
      <button type="button" class="adm-btn primary" @click="showNew = true">Nuevo ticket</button>
      <span v-if="loading" class="pf-muted">Buscando correos…</span>
    </div>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>
    <p v-else-if="inboxError" class="adm-banner warn" role="status">{{ inboxError }}</p>
    <p class="adm-hint">Solo ves los tickets asignados a ti. Un admin no puede abrir los de otra persona.</p>

    <div class="pf-split" :class="{ detail: Boolean(activeId) }">
      <section class="adm-card pf-pane-list" aria-label="Tickets de este cliente">
        <ul v-if="tickets.length" class="pf-list">
          <li v-for="t in tickets" :key="t.id">
            <button type="button" class="pf-row" :class="{ on: activeId === t.id, unread: t.status === 'open' }" @click="activeId = t.id">
              <span class="body">
                <span class="top">
                  <strong>{{ t.subject }}</strong>
                  <time :class="t.status === 'open' ? waitTone(t.updatedAt) : ''" :datetime="t.updatedAt">{{ ago(t.updatedAt) }}</time>
                </span>
                <span class="meta">
                  <span class="adm-pill" :class="t.status === 'open' ? 'warn' : 'good'">
                    {{ t.status === "open" ? "Por responder" : "Respondido" }}
                  </span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <p v-else-if="!loading" class="pf-empty-list">Todavía no hay tickets con este cliente.</p>
      </section>
      <div class="pf-pane-detail">
        <div v-if="activeId" class="pf-card-stack">
          <button type="button" class="adm-btn sm pf-back" @click="activeId = ''">← Tickets</button>
          <TicketPane :tenant-id="detail.id" :ticket-id="activeId" @changed="reload" />
        </div>
        <div v-else class="adm-card adm-empty">
          <h3>Elige un ticket</h3>
          <p>O abre uno nuevo para escribirle a este cliente.</p>
        </div>
      </div>
    </div>

    <NewTicketDialog v-if="showNew" :tenants="[]" :fixed-tenant-id="detail.id" @close="showNew = false" @created="created" />
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import TicketPane from "./TicketPane.vue";
import NewTicketDialog from "./NewTicketDialog.vue";
import { apiService } from "../../apiService";
import { ago, waitTone } from "../../platform/format";
import { refreshWaiting } from "../../platform/platformStore";

const props = defineProps({ detail: { type: Object, required: true }, initialTicket: { type: String, default: "" } });
const emit = defineEmits(["waiting"]);

const tickets = ref([]);
const loading = ref(true);
const error = ref("");
const inboxError = ref("");
const activeId = ref(props.initialTicket);
const showNew = ref(false);
let seq = 0;

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = "";
  try {
    const data = await apiService.platformClientMail(props.detail.id);
    if (mine !== seq) return;
    tickets.value = data.tickets || [];
    inboxError.value = data.inboxError || "";
    emit("waiting", tickets.value.filter((t) => t.status === "open").length);
    if (!activeId.value) activeId.value = tickets.value.find((t) => t.status === "open")?.id || "";
  } catch (e) {
    if (mine === seq) error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar los correos.";
  } finally {
    if (mine === seq) loading.value = false;
  }
}

async function reload() {
  await load();
  refreshWaiting();
}
async function created({ ticketId }) {
  showNew.value = false;
  activeId.value = ticketId || "";
  await reload();
}
watch(() => props.detail.id, () => {
  activeId.value = "";
  load();
}, { immediate: true });
</script>
