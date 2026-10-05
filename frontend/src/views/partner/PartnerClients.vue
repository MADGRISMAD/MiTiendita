<template>
  <PartnerFrame title="Mis tiendas" :subtitle="subtitle">
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <div class="pf-tools" :class="{ 'hide-narrow': id }">
      <label class="adm-search">
        <PosIcon name="search" :size="16" />
        <span class="pf-sr">Buscar tienda</span>
        <input v-model="query" class="adm-inp" type="search" placeholder="Buscar tienda, dueño o correo" />
      </label>
    </div>
    <nav class="adm-tabs" :class="{ 'hide-narrow': id }" aria-label="Filtrar tiendas">
      <button v-for="f in FILTERS" :key="f.id" type="button" :class="{ on: filter === f.id }" :aria-pressed="filter === f.id" @click="setFilter(f.id)">
        {{ f.label }}<em :class="{ alert: f.alert && f.count }">{{ f.count }}</em>
      </button>
    </nav>

    <div class="pf-split" :class="{ detail: Boolean(id) }">
      <section class="adm-card pf-pane-list" aria-label="Lista de tiendas" :class="{ 'adm-loading': loading }">
        <ul v-if="shown.length" class="pf-list">
          <li v-for="c in shown" :key="c.id">
            <button type="button" class="pf-row" :class="{ on: id === c.id }" :aria-current="id === c.id ? 'true' : undefined" @click="open(c.id)">
              <ClientAvatar :name="c.businessName" />
              <span class="body">
                <span class="top">
                  <strong>{{ c.businessName }}</strong>
                  <span v-if="c.attention" class="adm-pill" :class="c.attention.tone === 'bad' ? 'bad' : 'warn'">!</span>
                </span>
                <span class="sub" style="font-weight: 600">{{ c.ownerName || "Sin dueño" }}<template v-if="c.assigneeName"> · {{ c.assigneeName }}</template></span>
                <span class="meta">
                  <StatusPill :client="c" />
                  <span class="pf-chip">{{ c.planName }}</span>
                  <span v-if="c.attention && c.attention.label !== c.billingStatusName" class="pf-chip warn">{{ c.attention.label }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else-if="!loading" class="adm-empty">
          <h3>{{ clients.length ? "Ninguna tienda coincide" : "Aún no tienes tiendas" }}</h3>
          <p>{{ clients.length ? "Cambia el filtro o la búsqueda." : "Cuando una tienda se registre con tu código aparece aquí." }}</p>
        </div>
        <p v-else class="pf-empty-list">Cargando tiendas…</p>
      </section>

      <div class="pf-pane-detail">
        <PartnerClientPanel v-if="id" :id="id" :team="team" @updated="patch" @close="close" />
        <div v-else class="adm-card adm-empty">
          <h3>Elige una tienda</h3>
          <p>Verás su plan, quién entra, cómo la usa, su historia y las notas de tu equipo.</p>
        </div>
      </div>
    </div>
  </PartnerFrame>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PartnerFrame from "../../components/partner/PartnerFrame.vue";
import PartnerClientPanel from "../../components/partner/PartnerClientPanel.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import StatusPill from "../../components/platform/StatusPill.vue";
import PosIcon from "../../components/PosIcon.js";
import { apiService } from "../../apiService";
import { authStore } from "../../authStore";

const route = useRoute();
const router = useRouter();
const FILTER_IDS = ["all", "mine", "risk", "active", "trialing"];

const id = computed(() => String(route.params.id || ""));
const clients = ref([]);
const team = ref([]);
const loading = ref(true);
const error = ref("");
const query = ref("");
const filter = ref(FILTER_IDS.includes(route.query.f) ? route.query.f : "all");

const tests = {
  all: () => true,
  mine: (c) => c.assignee === authStore.username,
  risk: (c) => c.attention?.tone === "bad",
  active: (c) => c.billingStatus === "active",
  trialing: (c) => c.billingStatus === "trialing",
};
const count = (f) => clients.value.filter(tests[f]).length;
const FILTERS = computed(() => [
  { id: "all", label: "Todas", count: clients.value.length },
  { id: "mine", label: "Mías", count: count("mine") },
  { id: "risk", label: "En riesgo", count: count("risk"), alert: true },
  { id: "active", label: "Pagando", count: count("active") },
  { id: "trialing", label: "En prueba", count: count("trialing") },
]);

const subtitle = computed(() => {
  if (loading.value && !clients.value.length) return "Cargando…";
  const n = clients.value.length;
  return `${n} ${n === 1 ? "tienda" : "tiendas"} · ${count("active")} pagando`;
});
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = clients.value.filter(tests[filter.value]);
  if (q) list = list.filter((c) => [c.businessName, c.ownerName, c.ownerEmail, c.ownerPhone].some((v) => String(v || "").toLowerCase().includes(q)));
  const rank = (c) => (c.attention?.tone === "bad" ? 0 : c.attention ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.businessName.localeCompare(b.businessName, "es"));
});

function setFilter(f) {
  filter.value = f;
  router.replace({ query: { ...route.query, f: f === "all" ? undefined : f } }).catch(() => {});
}
function open(cid) {
  router.push({ name: "partnerClient", params: { id: cid }, query: { f: route.query.f } }).catch(() => {});
}
function close() {
  router.push({ name: "partnerClients", query: { f: route.query.f } }).catch(() => {});
}
function patch(change) {
  const i = clients.value.findIndex((c) => c.id === change.id);
  if (i >= 0) clients.value[i] = { ...clients.value[i], ...change };
}

onMounted(async () => {
  const [list, people] = await Promise.allSettled([apiService.partnerClients(), apiService.partnerTeam()]);
  if (list.status === "fulfilled") clients.value = list.value || [];
  else error.value = typeof list.reason?.response?.data === "string" ? list.reason.response.data : "No pude cargar tus tiendas.";
  if (people.status === "fulfilled") team.value = people.value || [];
  loading.value = false;
});
watch(() => route.query.f, (f) => (filter.value = FILTER_IDS.includes(f) ? f : "all"));
</script>
