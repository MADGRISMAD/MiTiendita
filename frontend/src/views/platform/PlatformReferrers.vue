<template>
  <PlatformFrame title="Vendedores" :subtitle="subtitle">
    <template #actions>
      <button type="button" class="adm-btn primary" @click="showNew = true">Nuevo vendedor</button>
    </template>

    <p v-if="flash" class="adm-banner ok" role="status">{{ flash }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <section v-if="mine && !id" class="adm-card pf-card-stack my-seller" aria-label="Mi código de vendedor">
      <div class="adm-card-head">
        <div>
          <h2>Mi código de vendedor</h2>
          <p>
            Como socio también puedes vender Mi Tiendita y ganar la comisión de vendedor, aparte de tu parte como dueño. Es tu propio código, ligado a tu cuenta: no necesitas otra
            contraseña.
          </p>
        </div>
        <button v-if="!mine.linked" type="button" class="adm-btn primary" :disabled="mineBusy" @click="activateMine">{{ mineBusy ? "Activando…" : "Activar mi código" }}</button>
        <button v-else type="button" class="adm-btn" @click="open(mine.seller.id)">Ver mi detalle</button>
      </div>
      <template v-if="mine.linked">
        <div class="my-code">
          <span class="pf-chip">{{ mine.seller.code }}</span>
          <button type="button" class="adm-btn sm" @click="copy(mine.seller.code, 'Código copiado.')">Copiar código</button>
          <button type="button" class="adm-btn sm" @click="copy(myLink, 'Enlace copiado.')">Copiar enlace de registro</button>
        </div>
        <p class="adm-hint my-link">{{ myLink }}</p>
        <dl class="my-stats">
          <div><dt>Clientes</dt><dd>{{ mine.seller.clients }}</dd></div>
          <div><dt>Comisión actual</dt><dd>{{ Math.round(mine.seller.rate * 100) }}%</dd></div>
          <div><dt>Ganado</dt><dd>{{ money(mine.seller.earned) }}</dd></div>
          <div><dt>Por pagar</dt><dd>{{ money(mine.seller.pending) }}</dd></div>
          <div><dt>Pagado</dt><dd>{{ money(mine.seller.paid) }}</dd></div>
        </dl>
      </template>
    </section>

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
                  <span v-if="r.status === 'pending'" class="adm-pill info">Solicitud nueva</span>
                  <span v-else-if="r.status !== 'active'" class="adm-pill">Pausado</span>
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
          <p class="adm-hint">Empiezan en 15% y suben con las <strong>ventas cerradas</strong> (tiendas que ya pagaron). Cada cobro paga el nivel que tenga el vendedor en ese momento.</p>
        </details>
      </section>

      <div class="pf-pane-detail pf-fixed">
        <ReferrerPanel v-if="id" :id="id" @updated="patch" @close="close" @removed="removed" />
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

// Mi código de vendedor (solo para los socios; para los demás la ruta responde 403 y la tarjeta no sale)
const mine = ref(null);
const mineBusy = ref(false);
const myLink = computed(() => (mine.value?.seller ? `${window.location.origin}/register?ref=${mine.value.seller.code}` : ""));
async function loadMine() {
  try {
    mine.value = await apiService.platformMySeller();
  } catch {
    mine.value = null;
  }
}
async function activateMine() {
  mineBusy.value = true;
  error.value = "";
  try {
    mine.value = await apiService.platformActivateMySeller();
    say(`Listo: tu código es ${mine.value.seller.code}.`);
    await load();
  } catch (e) {
    error.value = typeof e.response?.data === "string" && e.response.data ? e.response.data : "No pude activar tu código.";
  } finally {
    mineBusy.value = false;
  }
}
async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    say(done);
  } catch {
    error.value = "No pude copiar. Selecciónalo y cópialo a mano.";
  }
}

const subtitle = computed(() => {
  if (loading.value && !items.value.length) return "Cargando…";
  const n = items.value.length;
  const pending = items.value.filter((r) => r.status === "pending").length;
  const tail = pending ? ` · ${pending} ${pending === 1 ? "solicitud" : "solicitudes"} por revisar` : "";
  return n ? `${n} ${n === 1 ? "vendedor" : "vendedores"} · ${totals.value.clients} clientes referidos${tail}` : "Sin vendedores todavía";
});

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = q
    ? items.value.filter((r) => [r.name, r.code, r.email, r.state, r.city].some((v) => String(v || "").toLowerCase().includes(q)))
    : items.value;
  // Las solicitudes nuevas arriba para no dejarlas esperando
  const pend = (r) => (r.status === "pending" ? 0 : 1);
  return [...list].sort((a, b) => pend(a) - pend(b) || b.clients - a.clients || a.name.localeCompare(b.name, "es"));
});

function open(rid) {
  router.push({ name: "platformReferrer", params: { id: rid } }).catch(() => {});
}
async function removed() {
  close();
  say("Vendedor eliminado.");
  await Promise.all([load(), loadMine()]);
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
  say(`Listo. El código de ${next.name} es ${next.code}.${next.ownerUsername ? ` Ya puede entrar a /socio con el usuario ${next.ownerUsername}.` : ""}`);
  open(next.id);
}

onMounted(() => {
  load();
  loadMine();
});
</script>

<style scoped>
.my-code { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.my-link { margin: 0.3rem 0 0.4rem; word-break: break-all; }
.my-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.6rem; margin: 0; }
.my-stats div { display: grid; gap: 0.1rem; padding: 0.55rem 0.7rem; border: 1px solid var(--timber-line); border-radius: 0.7rem; }
.my-stats dt { font-size: 0.78rem; color: var(--timber-muted); }
.my-stats dd { margin: 0; font-weight: 800; font-variant-numeric: tabular-nums; }
</style>
