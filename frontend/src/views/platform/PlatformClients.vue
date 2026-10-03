<template>
  <PlatformFrame title="Clientes" :subtitle="subtitle">
    <div class="pf-tools" :class="{ 'hide-narrow': id }">
      <label class="adm-search">
        <PosIcon name="search" :size="16" />
        <span class="pf-sr">Buscar cliente</span>
        <input v-model="query" class="adm-inp" type="search" placeholder="Buscar tienda, dueño o correo" />
      </label>
      <label class="pf-sr" for="sort">Ordenar por</label>
      <select id="sort" v-model="sort" class="pf-select">
        <option value="recent">Más recientes</option>
        <option value="name">Nombre</option>
        <option value="seen">Menos actividad primero</option>
        <option value="trial">Prueba por vencer</option>
      </select>
    </div>
    <nav class="adm-tabs" :class="{ 'hide-narrow': id }" aria-label="Filtrar clientes">
      <button v-for="f in FILTERS" :key="f.id" type="button" :class="{ on: filter === f.id }" :aria-pressed="filter === f.id" @click="setFilter(f.id)">
        {{ f.label }}<em :class="{ alert: f.alert && f.count }">{{ f.count }}</em>
      </button>
    </nav>

    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <div class="pf-split" :class="{ detail: Boolean(id) }">
      <section class="adm-card pf-pane-list" aria-label="Lista de clientes" :class="{ 'adm-loading': loading }">
        <ul v-if="shown.length" class="pf-list">
          <li v-for="c in shown" :key="c.id">
            <button type="button" class="pf-row" :class="{ on: id === c.id, unread: c.waiting }" :aria-current="id === c.id ? 'true' : undefined" @click="open(c.id)">
              <ClientAvatar :name="c.businessName" />
              <span class="body">
                <span class="top">
                  <strong>{{ c.businessName }}</strong>
                  <span v-if="c.waiting" class="adm-pill warn" :title="`${c.waiting} por responder`">{{ c.waiting }} ✉</span>
                </span>
                <span class="sub" style="font-weight: 600">{{ c.ownerName || "Sin dueño" }}</span>
                <span class="meta">
                  <StatusPill :client="c" />
                  <span class="pf-chip">{{ c.planName }}</span>
                  <span class="pf-chip" :class="quiet(c) ? 'warn' : ''">{{ lastSeen(c) === "nunca ha entrado" ? "sin entrar" : lastSeen(c) }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else-if="!loading" class="adm-empty">
          <h3>{{ clients.length ? "Ningún cliente coincide" : "Aún no hay clientes" }}</h3>
          <p>{{ clients.length ? "Cambia el filtro o la búsqueda." : "Cuando alguien cree su tienda aparece aquí." }}</p>
        </div>
        <p v-else class="pf-empty-list">Cargando clientes…</p>
      </section>

      <div class="pf-pane-detail">
        <ClientPanel
          v-if="id"
          :id="id"
          :can-edit="isAdmin"
          :waiting="current?.waiting || 0"
          :initial-ticket="String(route.query.t || '')"
          @updated="patch"
          @close="close"
        />
        <div v-else class="adm-card adm-empty">
          <h3>Elige un cliente</h3>
          <p>Verás su plan, quién entra, sus tickets y la historia de lo que se ha hecho con su cuenta.</p>
        </div>
      </div>
    </div>
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import StatusPill from "../../components/platform/StatusPill.vue";
import ClientPanel from "../../components/platform/ClientPanel.vue";
import PosIcon from "../../components/PosIcon.js";
import { apiService } from "../../apiService";
import { hasRole } from "../../authStore";
import { lastSeen, toDate } from "../../platform/format";

const route = useRoute();
const router = useRouter();
const isAdmin = computed(() => hasRole("platform_admin"));

const id = computed(() => String(route.params.id || ""));
const clients = ref([]);
const loading = ref(true);
const error = ref("");
const query = ref("");
const filter = ref(["all", "active", "trialing", "past_due", "suspended", "waiting"].includes(route.query.f) ? route.query.f : "all");
const sort = ref("recent");

const count = (fn) => clients.value.filter(fn).length;
const FILTERS = computed(() => [
  { id: "all", label: "Todos", count: clients.value.length },
  { id: "active", label: "Activos", count: count((c) => c.billingStatus === "active") },
  { id: "trialing", label: "En prueba", count: count((c) => c.billingStatus === "trialing") },
  { id: "past_due", label: "Pago atrasado", count: count((c) => c.billingStatus === "past_due"), alert: true },
  { id: "suspended", label: "Suspendidos", count: count((c) => c.billingStatus === "suspended") },
  { id: "waiting", label: "Con ticket", count: count((c) => c.waiting > 0), alert: true },
]);

const current = computed(() => clients.value.find((c) => c.id === id.value) || null);
const subtitle = computed(() => {
  if (loading.value && !clients.value.length) return "Cargando…";
  const n = clients.value.length;
  return `${n} ${n === 1 ? "cliente" : "clientes"}${count((c) => c.billingStatus === "active") ? ` · ${count((c) => c.billingStatus === "active")} activos` : ""}`;
});

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = clients.value.filter((c) => {
    if (filter.value === "waiting") return c.waiting > 0;
    return filter.value === "all" || c.billingStatus === filter.value;
  });
  if (q) {
    list = list.filter((c) => [c.businessName, c.ownerName, c.ownerEmail, c.phone].some((v) => String(v || "").toLowerCase().includes(q)));
  }
  const time = (v) => toDate(v)?.getTime() ?? 0;
  const sorters = {
    recent: (a, b) => time(b.createdAt) - time(a.createdAt),
    name: (a, b) => a.businessName.localeCompare(b.businessName, "es"),
    seen: (a, b) => (time(a.lastSeenAt) || -1) - (time(b.lastSeenAt) || -1),
    trial: (a, b) => (a.billingStatus === "trialing" ? time(a.trialEndsAt) : Infinity) - (b.billingStatus === "trialing" ? time(b.trialEndsAt) : Infinity),
  };
  return [...list].sort(sorters[sort.value]);
});

const quiet = (c) => c.billingStatus === "active" && c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() > 14 * 86400000;

function setFilter(f) {
  filter.value = f;
  router.replace({ query: { ...route.query, f: f === "all" ? undefined : f } }).catch(() => {});
}
function open(cid) {
  router.push({ name: "platformClient", params: { id: cid }, query: { f: route.query.f } }).catch(() => {});
}
function close() {
  router.push({ name: "platformClients", query: { f: route.query.f } }).catch(() => {});
}
// El detalle avisa cuando cambia algo para que la lista no quede desactualizada
function patch(card) {
  const i = clients.value.findIndex((c) => c.id === card.id);
  if (i >= 0) clients.value[i] = { ...clients.value[i], ...card, waiting: clients.value[i].waiting };
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const list = await apiService.platformListTenants();
    clients.value = Array.isArray(list) ? list : [];
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar los clientes.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => route.query.f, (f) => {
  if (["all", "active", "trialing", "past_due", "suspended", "waiting"].includes(f)) filter.value = f;
  else if (!f) filter.value = "all";
});
</script>
