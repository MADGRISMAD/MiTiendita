<template>
  <PlatformFrame title="Vendedores" :subtitle="subtitle">
    <template #actions>
      <button type="button" class="adm-btn primary" @click="showNew = true">Nuevo vendedor</button>
    </template>

    <p v-if="flash" class="adm-banner ok" role="status">{{ flash }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <div v-if="!id" class="adm-kpis" aria-label="Resumen de vendedores">
      <div class="adm-kpi"><span>Vendedores</span><strong class="pf-num">{{ totals.sellers }}</strong><small>con código de referencia</small></div>
      <div class="adm-kpi"><span>Clientes referidos</span><strong class="pf-num">{{ totals.clients }}</strong><small>entre todos</small></div>
      <div class="adm-kpi" :class="{ warn: totals.pending > 0 }">
        <span>Comisiones por pagar</span><strong class="pf-num">{{ money(totals.pending) }}</strong><small>pendiente de liquidar</small>
      </div>
      <div class="adm-kpi"><span>Comisiones pagadas</span><strong class="pf-num">{{ money(totals.paid) }}</strong><small>desde siempre</small></div>
    </div>

    <div class="pf-tools" :class="{ 'hide-narrow': id }">
      <label class="adm-search">
        <PosIcon name="search" :size="16" />
        <span class="pf-sr">Buscar vendedor</span>
        <input v-model="query" class="adm-inp" type="search" placeholder="Buscar nombre, código, correo o estado" />
      </label>
    </div>

    <div class="pf-split" :class="{ detail: Boolean(id) }">
      <section class="adm-card pf-pane-list" aria-label="Lista de vendedores" :class="{ 'adm-loading': loading }">
        <ul v-if="shown.length" class="pf-list">
          <li v-for="r in shown" :key="r.id">
            <button type="button" class="pf-row" :class="{ on: id === r.id }" :aria-current="id === r.id ? 'true' : undefined" @click="open(r.id)">
              <ClientAvatar :name="r.name" />
              <span class="body">
                <span class="top">
                  <strong>{{ r.name }}</strong>
                  <span class="pf-chip">{{ Math.round(r.rate * 100) }}%</span>
                </span>
                <span class="sub" style="font-weight: 600">{{ r.code }}<template v-if="r.state"> · {{ r.state }}</template></span>
                <span class="meta">
                  <span class="pf-chip">{{ r.clients }} {{ r.clients === 1 ? "cliente" : "clientes" }}</span>
                  <span v-if="r.pending > 0" class="adm-pill warn">Por pagar {{ money(r.pending) }}</span>
                  <span v-if="r.status !== 'active'" class="adm-pill">Pausado</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
        <div v-else-if="!loading" class="adm-empty">
          <h3>{{ items.length ? "Ningún vendedor coincide" : "Aún no hay vendedores" }}</h3>
          <p>
            {{ items.length ? "Cambia la búsqueda." : "Da de alta a quien vende Mi Tiendita para que tenga su código y se le paguen comisiones por cada cobro de sus clientes." }}
          </p>
          <button v-if="!items.length" type="button" class="adm-btn primary" @click="showNew = true">Dar de alta al primero</button>
        </div>
        <p v-else class="pf-empty-list">Cargando vendedores…</p>

        <details v-if="ladder.length" class="pf-ladder-note">
          <summary>¿Cómo suben las comisiones?</summary>
          <ReferralLadder :ladder="ladder" compact />
          <p class="adm-hint">Empiezan en 10% y suben con las <strong>ventas cerradas</strong> (tiendas que ya pagaron). Cada cobro paga el nivel que tenga el vendedor en ese momento.</p>
        </details>
      </section>

      <div class="pf-pane-detail">
        <ReferrerPanel v-if="id" :id="id" @updated="patch" @close="close" />
        <div v-else class="adm-card adm-empty">
          <h3>Elige un vendedor</h3>
          <p>Verás sus clientes, su nivel de comisión, lo que se le debe y el historial de pagos.</p>
        </div>
      </div>
    </div>

    <ReferrerDialog v-if="showNew" @close="showNew = false" @saved="created" />
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import ReferrerPanel from "../../components/platform/ReferrerPanel.vue";
import ReferrerDialog from "../../components/platform/ReferrerDialog.vue";
import ReferralLadder from "../../components/platform/ReferralLadder.vue";
import PosIcon from "../../components/PosIcon.js";
import { apiService } from "../../apiService";
import { money } from "../../platform/format";

const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id || ""));
const items = ref([]);
const ladder = ref([]);
const totals = ref({ sellers: 0, clients: 0, pending: 0, paid: 0 });
const loading = ref(true);
const error = ref("");
const flash = ref("");
const query = ref("");
const showNew = ref(false);

const subtitle = computed(() => {
  if (loading.value && !items.value.length) return "Cargando…";
  const n = items.value.length;
  return n ? `${n} ${n === 1 ? "vendedor" : "vendedores"} · ${totals.value.clients} clientes referidos` : "Sin vendedores todavía";
});

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = q
    ? items.value.filter((r) => [r.name, r.code, r.email, r.state, r.city].some((v) => String(v || "").toLowerCase().includes(q)))
    : items.value;
  return [...list].sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name, "es"));
});

function open(rid) {
  router.push({ name: "platformReferrer", params: { id: rid } }).catch(() => {});
}
function close() {
  router.push({ name: "platformReferrers" }).catch(() => {});
}

function say(message) {
  flash.value = message;
  setTimeout(() => (flash.value = ""), 5000);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await apiService.platformReferrers();
    items.value = data.items || [];
    ladder.value = data.ladder || [];
    totals.value = data.totals || totals.value;
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar a los vendedores.";
  } finally {
    loading.value = false;
  }
}

// El detalle avisa cuando cambia algo para que la lista y las cifras no queden viejas
function patch() {
  load();
}

async function created(next) {
  showNew.value = false;
  await load();
  say(`Listo. El código de ${next.name} es ${next.code}.`);
  open(next.id);
}

onMounted(load);
</script>
