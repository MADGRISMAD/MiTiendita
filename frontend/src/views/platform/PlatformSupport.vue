<template>
  <PlatformFrame title="Soporte" :subtitle="subtitle">
    <template #actions>
      <button type="button" class="adm-btn primary" @click="openNew">Nuevo ticket</button>
    </template>

    <div class="pf-tools">
      <nav class="adm-tabs" aria-label="Filtrar tickets">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          type="button"
          :class="{ on: filter === f.id }"
          :aria-pressed="filter === f.id"
          @click="setFilter(f.id)"
        >
          {{ f.label }}<em v-if="f.count != null" :class="{ alert: f.id === 'open' && f.count }">{{ f.count }}</em>
        </button>
      </nav>
      <label class="adm-search">
        <PosIcon name="search" :size="16" />
        <span class="pf-sr">Buscar en los tickets</span>
        <input v-model="query" class="adm-inp" type="search" placeholder="Buscar cliente, asunto o correo" />
      </label>
    </div>

    <p v-if="inboxError" class="adm-banner warn" role="status">{{ inboxError }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <div class="pf-split" :class="{ detail: Boolean(selected) }">
      <section class="adm-card pf-pane-list" aria-label="Lista de tickets" :class="{ 'adm-loading': loading }">
        <ul v-if="items.length" class="pf-list">
          <li v-for="item in items" :key="item.tenantId + item.ticketId">
            <button
              type="button"
              class="pf-row"
              :class="{
                on: isSelected(item),
                unread: item.status === 'open',
                late: item.status === 'open' && waitTone(item.updatedAt) === 'bad',
              }"
              :aria-current="isSelected(item) ? 'true' : undefined"
              @click="open(item)"
            >
              <ClientAvatar :name="item.businessName" />
              <span class="body">
                <span class="top">
                  <strong>{{ item.businessName }}</strong>
                  <time :datetime="item.updatedAt" :class="item.status === 'open' ? waitTone(item.updatedAt) : ''">
                    {{ ago(item.updatedAt) }}
                  </time>
                </span>
                <span class="sub">{{ item.subject }}</span>
                <span class="prev">{{ item.preview }}</span>
                <span class="meta">
                  <span v-if="item.status === 'open'" class="adm-pill warn">Por responder</span>
                  <span v-else class="adm-pill good">Respondido</span>
                  <span v-if="item.messageCount > 1" class="pf-chip">{{ item.messageCount }} mensajes</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else-if="!loading" class="adm-empty">
          <template v-if="query">
            <h3>Nada coincide con «{{ query }}»</h3>
            <p>Prueba con el nombre de la tienda o una palabra del asunto.</p>
          </template>
          <template v-else-if="filter === 'open'">
            <h3>Todo respondido</h3>
            <p>No tienes tickets esperando respuesta. Buen trabajo.</p>
          </template>
          <template v-else>
            <h3>Aún no hay tickets</h3>
            <p>Cuando un cliente escriba o abras un ticket, aparece aquí.</p>
          </template>
        </div>
        <p v-else class="pf-empty-list">Cargando tickets…</p>
      </section>

      <div class="pf-pane-detail">
        <template v-if="selected">
          <div class="pf-card-stack">
            <button type="button" class="adm-btn sm pf-back" @click="close">← Todos los tickets</button>
            <div class="adm-card pf-detail-head">
              <ClientAvatar :name="selected.businessName" />
              <div class="pf-grow">
                <h2>{{ selected.businessName }}</h2>
                <p class="pf-muted" style="margin: 0.1rem 0 0; font-size: 0.84rem; font-weight: 600">
                  <template v-if="client">{{ client.planName }} · </template>{{ selected.from }}
                </p>
              </div>
              <StatusPill v-if="client" :client="client" />
              <div class="acts">
                <router-link class="adm-btn sm" :to="{ name: 'platformClient', params: { id: selected.tenantId } }">
                  Ver cliente
                </router-link>
              </div>
            </div>
            <TicketPane :tenant-id="selected.tenantId" :ticket-id="selected.ticketId" @changed="afterReply" />
          </div>
        </template>
        <div v-else class="adm-card adm-empty">
          <h3>Elige un ticket</h3>
          <p>La conversación se abre aquí. Los que esperan respuesta van primero, los más viejos arriba.</p>
        </div>
      </div>
    </div>

    <section v-if="unmatched.length" class="adm-card pf-card-stack">
      <div class="adm-card-head">
        <div>
          <h2>Correos sin cliente</h2>
          <p>Llegaron a soporte desde un correo que no es de ninguna tienda registrada.</p>
        </div>
        <button type="button" class="adm-btn sm" :aria-expanded="showUnmatched" @click="showUnmatched = !showUnmatched">
          {{ showUnmatched ? "Ocultar" : `Ver ${unmatched.length}` }}
        </button>
      </div>
      <ul v-if="showUnmatched" class="pf-list">
        <li v-for="mail in unmatched" :key="mail.id" class="pf-row" style="cursor: default">
          <span class="body">
            <span class="top">
              <strong>{{ mail.from }}</strong>
              <time :datetime="mail.at">{{ ago(mail.at) }}</time>
            </span>
            <span class="sub">{{ mail.subject || "(sin asunto)" }}</span>
            <span class="prev">{{ mail.text }}</span>
          </span>
        </li>
      </ul>
    </section>

    <NewTicketDialog v-if="showNew" :tenants="tenants" @close="showNew = false" @created="afterCreated" />
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import StatusPill from "../../components/platform/StatusPill.vue";
import TicketPane from "../../components/platform/TicketPane.vue";
import NewTicketDialog from "../../components/platform/NewTicketDialog.vue";
import PosIcon from "../../components/PosIcon.js";
import { apiService } from "../../apiService";
import { ago, waitTone } from "../../platform/format";
import { refreshWaiting } from "../../platform/platformStore";

const route = useRoute();
const router = useRouter();

const filter = ref(["open", "answered", "all"].includes(route.query.f) ? route.query.f : "open");
const query = ref(String(route.query.q || ""));
const items = ref([]);
const counts = ref({ open: 0, answered: 0 });
const loading = ref(true);
const error = ref("");
const inboxError = ref("");
const unmatched = ref([]);
const showUnmatched = ref(false);
const tenants = ref([]);
const showNew = ref(false);

const FILTERS = computed(() => [
  { id: "open", label: "Por responder", count: counts.value.open },
  { id: "answered", label: "Respondidos", count: counts.value.answered },
  { id: "all", label: "Todos", count: counts.value.open + counts.value.answered },
]);

const subtitle = computed(() => {
  if (loading.value && !items.value.length) return "Cargando…";
  const n = counts.value.open;
  return n ? `${n} ${n === 1 ? "ticket espera" : "tickets esperan"} tu respuesta` : "Sin tickets por responder";
});

// El ticket abierto vive en la dirección (?t=tienda:ticket) para poder compartirlo y recargar
const selected = computed(() => {
  const [tenantId, ticketId] = String(route.query.t || "").split(":");
  if (!tenantId || !ticketId) return null;
  const fromList = items.value.find((i) => i.tenantId === tenantId && i.ticketId === ticketId);
  return fromList || { tenantId, ticketId, businessName: tenantName(tenantId), from: "", subject: "" };
});
const clientById = computed(() => new Map(tenants.value.map((t) => [t.id, t])));
const client = computed(() => (selected.value ? clientById.value.get(selected.value.tenantId) || null : null));
function tenantName(id) {
  return clientById.value.get(id)?.businessName || "Cliente";
}
const isSelected = (item) => selected.value?.tenantId === item.tenantId && selected.value?.ticketId === item.ticketId;

function setQuery(patch) {
  router.replace({ query: { ...route.query, ...patch } }).catch(() => {});
}
function open(item) {
  setQuery({ t: `${item.tenantId}:${item.ticketId}` });
}
function close() {
  setQuery({ t: undefined });
}
function setFilter(id) {
  filter.value = id;
  setQuery({ f: id === "open" ? undefined : id });
}

let seq = 0;
async function load({ quiet = false } = {}) {
  const mine = ++seq;
  if (!quiet) loading.value = true;
  error.value = "";
  try {
    const data = await apiService.platformSupport({ status: filter.value, q: query.value.trim() || undefined });
    if (mine !== seq) return;
    items.value = data.items || [];
    counts.value = data.counts || { open: 0, answered: 0 };
    inboxError.value = data.inboxError || "";
  } catch (e) {
    if (mine !== seq) return;
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar los tickets.";
  } finally {
    if (mine === seq) loading.value = false;
  }
}

let searchTimer = null;
watch(query, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    setQuery({ q: value.trim() || undefined });
    load();
  }, 250);
});
watch(filter, () => load());

async function loadSideData() {
  const [list, inbox] = await Promise.allSettled([apiService.platformListTenants(), apiService.platformInbox()]);
  if (list.status === "fulfilled") tenants.value = Array.isArray(list.value) ? list.value : [];
  if (inbox.status === "fulfilled") unmatched.value = inbox.value?.messages || [];
}

function openNew() {
  showNew.value = true;
}
async function afterCreated({ tenantId, ticketId }) {
  showNew.value = false;
  filter.value = "all";
  setQuery({ f: "all", t: ticketId ? `${tenantId}:${ticketId}` : undefined });
  await load();
  refreshWaiting();
}
async function afterReply() {
  await load({ quiet: true });
  refreshWaiting();
}

let poll = null;
onMounted(() => {
  load();
  loadSideData();
  poll = setInterval(() => {
    if (!document.hidden) load({ quiet: true });
  }, 60000);
});
onUnmounted(() => {
  clearInterval(poll);
  clearTimeout(searchTimer);
});
</script>
