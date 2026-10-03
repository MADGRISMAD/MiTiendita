<template>
  <PlatformFrame title="Hoy" :subtitle="today">
    <p class="pf-hello">{{ greeting }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <section aria-label="Resumen de atención">
      <div class="adm-kpis">
        <router-link class="adm-kpi" :class="{ bad: attention.counts.tickets }" :to="{ name: 'platformSupport' }">
          <span>Tickets por responder</span>
          <strong class="pf-num">{{ attention.counts.tickets }}</strong>
          <small>{{ oldestTicket }}</small>
        </router-link>
        <router-link class="adm-kpi" :class="{ warn: attention.counts.pastDue }" :to="{ name: 'platformClients', query: { f: 'past_due' } }">
          <span>Pago atrasado</span>
          <strong class="pf-num">{{ attention.counts.pastDue }}</strong>
          <small>{{ attention.counts.pastDue ? "clientes por contactar" : "todos al corriente" }}</small>
        </router-link>
        <router-link class="adm-kpi" :class="{ warn: attention.counts.trials }" :to="{ name: 'platformClients', query: { f: 'trialing' } }">
          <span>Pruebas por cerrar</span>
          <strong class="pf-num">{{ attention.counts.trials }}</strong>
          <small>vencen en 3 días o ya vencieron</small>
        </router-link>
        <router-link class="adm-kpi" :to="{ name: 'platformClients', query: { f: 'active' } }">
          <span>Clientes activos</span>
          <strong class="pf-num">{{ summary.active }}</strong>
          <small>{{ summary.total }} en total · {{ summary.trialing }} en prueba</small>
        </router-link>
      </div>
    </section>

    <section v-if="isAdmin && books" class="adm-kpis" aria-label="Cifras del mes">
      <div class="adm-kpi good">
        <span>Ganancia de {{ monthName }}</span>
        <strong class="pf-num">{{ money(books.profit) }}</strong>
        <small>ingresos menos IA y gastos</small>
        <Spark :values="books.trend.map((t) => t.profit ?? 0)" tone="good" label="Ganancia de los últimos meses" />
      </div>
      <div class="adm-kpi">
        <span>Ingresos</span>
        <strong class="pf-num">{{ money(books.revenue) }}</strong>
        <small>{{ books.clients.active }} planes activos</small>
        <Spark :values="books.trend.map((t) => t.revenue ?? 0)" label="Ingresos de los últimos meses" />
      </div>
      <router-link class="adm-kpi" :to="{ name: 'platformFinance', query: { v: 'ia' } }">
        <span>Gasto de IA</span>
        <strong class="pf-num">{{ money(books.ai.cost) }}</strong>
        <small>{{ books.ai.uses }} usos este mes</small>
      </router-link>
      <router-link class="adm-kpi" :to="{ name: 'platformFinance', query: { v: 'gastos' } }">
        <span>Otros gastos</span>
        <strong class="pf-num">{{ money(books.expensesTotal) }}</strong>
        <small>{{ books.expenses.length }} anotados</small>
      </router-link>
    </section>

    <div class="pf-two">
      <section class="adm-card pf-card-stack" aria-labelledby="queue-title">
        <div class="adm-card-head">
          <div>
            <h2 id="queue-title">Necesita tu atención</h2>
            <p>De lo más urgente a lo menos. Lo que lleva más tiempo esperando va primero.</p>
          </div>
        </div>
        <p v-if="loading && !attention.items.length" class="pf-muted">Revisando…</p>
        <ul v-else-if="attention.items.length" class="pf-queue">
          <li v-for="item in shownItems" :key="item.key" class="pf-queue-item" :class="item.tone">
            <ClientAvatar :name="item.businessName" />
            <div class="who">
              <strong>{{ item.businessName }}</strong>
              <span class="what">{{ item.title }}</span>
              <span v-if="item.detail" class="detail">{{ item.detail }}</span>
            </div>
            <span v-if="item.since" class="when" :class="item.tone">{{ ago(item.since) }}</span>
            <router-link class="adm-btn sm" :to="linkFor(item)">{{ item.kind === "ticket" ? "Responder" : "Abrir" }}</router-link>
          </li>
        </ul>
        <div v-else class="pf-allclear">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span>Todo en orden: no hay tickets esperando, pagos atrasados ni pruebas por vencer.</span>
        </div>
        <button v-if="attention.items.length > LIMIT" type="button" class="adm-btn sm" @click="showAll = !showAll">
          {{ showAll ? "Ver menos" : `Ver los ${attention.items.length}` }}
        </button>
      </section>

      <div class="pf-card-stack">
        <section class="adm-card pf-card-stack" aria-labelledby="new-title">
          <div class="adm-card-head">
            <div>
              <h2 id="new-title">Últimos registros</h2>
              <p>Tiendas que se dieron de alta hace poco.</p>
            </div>
            <router-link class="adm-btn sm" :to="{ name: 'platformClients' }">Todos</router-link>
          </div>
          <ul v-if="newest.length" class="pf-list">
            <li v-for="c in newest" :key="c.id">
              <router-link class="pf-row" :to="{ name: 'platformClient', params: { id: c.id } }">
                <ClientAvatar :name="c.businessName" size="2.2rem" />
                <span class="body">
                  <span class="top">
                    <strong>{{ c.businessName }}</strong>
                    <time :datetime="c.createdAt">{{ ago(c.createdAt) }}</time>
                  </span>
                  <span class="meta">
                    <StatusPill :client="c" />
                    <span class="pf-chip">{{ c.planName }}</span>
                  </span>
                </span>
              </router-link>
            </li>
          </ul>
          <p v-else-if="!loading" class="pf-muted">Todavía no hay clientes.</p>
        </section>

        <section v-if="isAdmin" class="adm-card pf-card-stack" aria-labelledby="team-title">
          <div class="adm-card-head">
            <div>
              <h2 id="team-title">Movimientos del equipo</h2>
              <p>Quién cambió qué en los clientes.</p>
            </div>
          </div>
          <ul v-if="activity.length" class="pf-timeline">
            <li v-for="a in activity.slice(0, 7)" :key="a.id">
              <span class="dot" aria-hidden="true"></span>
              <div>
                <p>{{ a.message }}</p>
                <small>
                  {{ a.actor || "Sistema" }}
                  <template v-if="a.businessName"> · <router-link :to="{ name: 'platformClient', params: { id: a.tenantId } }">{{ a.businessName }}</router-link></template>
                </small>
              </div>
              <time :datetime="a.at">{{ ago(a.at) }}</time>
            </li>
          </ul>
          <p v-else-if="!loading" class="pf-muted">Aún no hay movimientos.</p>
        </section>
      </div>
    </div>
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import StatusPill from "../../components/platform/StatusPill.vue";
import Spark from "../../components/platform/Spark.vue";
import { apiService } from "../../apiService";
import { authStore, hasRole } from "../../authStore";
import { ago, money } from "../../platform/format";
import { buildAttention } from "../../platform/attention";

const LIMIT = 8;
const isAdmin = computed(() => hasRole("platform_admin"));

const tenants = ref([]);
const tickets = ref([]);
const books = ref(null);
const activity = ref([]);
const loading = ref(true);
const error = ref("");
const showAll = ref(false);

const attention = computed(() => buildAttention({ tenants: tenants.value, tickets: tickets.value }));
const shownItems = computed(() => (showAll.value ? attention.value.items : attention.value.items.slice(0, LIMIT)));
const newest = computed(() =>
  [...tenants.value].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5)
);
const summary = computed(() => ({
  total: tenants.value.length,
  active: tenants.value.filter((t) => t.billingStatus === "active").length,
  trialing: tenants.value.filter((t) => t.billingStatus === "trialing").length,
}));
const oldestTicket = computed(() => {
  const open = tickets.value.filter((t) => t.status === "open");
  if (!open.length) return "ninguno esperando";
  const oldest = open.reduce((a, b) => (new Date(a.updatedAt) < new Date(b.updatedAt) ? a : b));
  return `el más viejo, ${ago(oldest.updatedAt)}`;
});
const monthName = computed(() => new Date().toLocaleDateString("es-MX", { month: "long" }));
const today = computed(() => {
  const s = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
});
const greeting = computed(() => {
  const h = new Date().getHours();
  const part = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const n = attention.value.counts.urgent;
  const tail = n ? ` Hay ${n} ${n === 1 ? "cosa urgente" : "cosas urgentes"} arriba.` : "";
  return `${part}, ${authStore.username || "equipo"}.${tail}`;
});

function linkFor(item) {
  if (item.kind === "ticket") return { name: "platformSupport", query: { t: `${item.tenantId}:${item.ticketId}` } };
  return { name: "platformClient", params: { id: item.tenantId } };
}

async function load() {
  const calls = [
    apiService.platformListTenants(),
    apiService.platformSupport({ status: "open" }),
    isAdmin.value ? apiService.platformOverview() : Promise.resolve(null),
    isAdmin.value ? apiService.platformActivity(12) : Promise.resolve(null),
  ];
  const [t, s, b, a] = await Promise.allSettled(calls);
  if (t.status === "fulfilled") tenants.value = Array.isArray(t.value) ? t.value : [];
  else error.value = "No pude cargar los clientes.";
  if (s.status === "fulfilled") tickets.value = s.value?.items || [];
  if (b.status === "fulfilled" && b.value) books.value = b.value;
  if (a.status === "fulfilled" && a.value) activity.value = a.value.items || [];
  loading.value = false;
}

let poll = null;
onMounted(() => {
  load();
  poll = setInterval(() => {
    if (!document.hidden) load();
  }, 120000);
});
onUnmounted(() => clearInterval(poll));
</script>
