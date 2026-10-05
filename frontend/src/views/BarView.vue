<template>
  <AppShell>
    <div class="adm bar">
      <header class="adm-head">
        <div>
          <h1>Barra</h1>
          <p>{{ headline }}</p>
        </div>
        <div class="adm-acts">
          <button type="button" class="adm-btn" :aria-pressed="sound" :title="sound ? 'Sonido activado' : 'Sonido apagado'" @click="toggleSound">
            <PosIcon :name="sound ? 'check' : 'x'" :size="18" /> <span>Sonido</span>
          </button>
        </div>
      </header>

      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
      </p>

      <nav class="adm-tabs main only-mobile" role="tablist" aria-label="Columnas de la barra">
        <button
          v-for="c in COLUMNS"
          :key="c.id"
          type="button"
          role="tab"
          :aria-selected="mobileCol === c.id"
          :class="{ on: mobileCol === c.id }"
          @click="mobileCol = c.id"
        >
          {{ c.short }}<em v-if="byStatus[c.id].length">{{ byStatus[c.id].length }}</em>
        </button>
      </nav>

      <div v-if="!loading && !active.length" class="adm-card adm-empty">
        <PosIcon name="cup" :size="32" />
        <h3>Sin pedidos por preparar</h3>
        <p>Cuando cobres una bebida con receta en <router-link to="/pos">Vender</router-link>, aparece aquí con su número.</p>
      </div>

      <div v-else class="cols">
        <section v-for="c in COLUMNS" :key="c.id" class="col" :class="[c.id, { hide: mobileCol !== c.id }]" :aria-label="c.label">
          <h2>{{ c.label }} <em>{{ byStatus[c.id].length }}</em></h2>
          <TransitionGroup name="card" tag="div" class="cards">
            <article v-for="o in byStatus[c.id]" :key="o.id" class="card" :class="{ fresh: freshIds.has(o.id), late: minutes(o) >= LATE_MIN && c.id !== 'ready' }">
              <header>
                <strong class="num">#{{ o.number || '—' }}</strong>
                <span class="who">{{ o.customerName || 'Mostrador' }}</span>
                <time :datetime="o.queuedAt">{{ ago(o) }}</time>
              </header>
              <ul>
                <li v-for="(it, k) in o.items" :key="k">
                  <b>{{ fmtQty(it.quantity) }}×</b>
                  <span>
                    {{ it.name }}
                    <small v-if="it.modifiers.length">{{ it.modifiers.join(' · ') }}</small>
                    <small v-if="it.notes" class="note">{{ it.notes }}</small>
                  </span>
                </li>
              </ul>
              <p v-if="o.notes" class="note">{{ o.notes }}</p>
              <div class="acts">
                <button v-if="c.prev" type="button" class="adm-btn sm" :disabled="busyId === o.id" :aria-label="`Regresar #${o.number}`" @click="move(o, c.prev)">
                  <PosIcon name="undo" :size="16" />
                </button>
                <button type="button" class="adm-btn primary" :disabled="busyId === o.id" @click="move(o, c.next)">
                  {{ c.action }}
                </button>
              </div>
            </article>
          </TransitionGroup>
        </section>
      </div>

      <details v-if="delivered.length" class="adm-card done">
        <summary>Entregados recientemente ({{ delivered.length }})</summary>
        <ul>
          <li v-for="o in delivered" :key="o.id">
            <span><strong>#{{ o.number }}</strong> {{ o.customerName || 'Mostrador' }} · {{ o.items.length }} {{ o.items.length === 1 ? 'bebida' : 'bebidas' }}</span>
            <button type="button" class="adm-link" :disabled="busyId === o.id" @click="move(o, 'ready')">Regresar a «Lista»</button>
          </li>
        </ul>
      </details>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import "../admin.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";

const COLUMNS = [
  { id: "queued", label: "En cola", short: "En cola", action: "Preparar", next: "preparing", prev: null },
  { id: "preparing", label: "Preparando", short: "Preparando", action: "Lista", next: "ready", prev: "queued" },
  { id: "ready", label: "Para entregar", short: "Listas", action: "Entregada", next: "delivered", prev: "preparing" },
];
const POLL_MS = 5000;
const LATE_MIN = 8; // un pedido con más de 8 minutos se marca

const orders = ref([]);
const loading = ref(true);
const error = ref("");
const busyId = ref("");
const mobileCol = ref("queued");
const now = ref(Date.now());
const freshIds = reactive(new Set());
const sound = ref(readSound());

function readSound() {
  try {
    return localStorage.getItem("barSound") !== "off";
  } catch {
    return true;
  }
}
function toggleSound() {
  sound.value = !sound.value;
  try {
    localStorage.setItem("barSound", sound.value ? "on" : "off");
  } catch {
    /* sin almacenamiento */
  }
  if (sound.value) ding();
}
let audio = null;
function ding() {
  if (!sound.value) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.4);
  } catch {
    /* el navegador no deja sonar sin un toque previo */
  }
}

const byStatus = computed(() => {
  const out = { queued: [], preparing: [], ready: [] };
  for (const o of orders.value) if (out[o.status]) out[o.status].push(o);
  return out;
});
const active = computed(() => orders.value.filter((o) => o.status !== "delivered"));
const delivered = computed(() => orders.value.filter((o) => o.status === "delivered").slice().reverse());
const headline = computed(() => {
  const q = byStatus.value.queued.length + byStatus.value.preparing.length;
  const r = byStatus.value.ready.length;
  if (!q && !r) return "Todo al día";
  return [q && `${q} por preparar`, r && `${r} para entregar`].filter(Boolean).join(" · ");
});

function minutes(o) {
  return Math.max(0, Math.floor((now.value - new Date(o.queuedAt).getTime()) / 60000));
}
function ago(o) {
  const m = minutes(o);
  return m < 1 ? "ahora" : `${m} min`;
}
function fmtQty(q) {
  return Number(q) % 1 === 0 ? Number(q) : Number(q).toFixed(2);
}

let known = null;
async function load() {
  try {
    const data = await apiService.getPrepQueue();
    const items = Array.isArray(data?.items) ? data.items : [];
    // Pedido nuevo: se resalta y suena
    if (known) {
      const fresh = items.filter((o) => o.status === "queued" && !known.has(o.id));
      for (const o of fresh) {
        freshIds.add(o.id);
        setTimeout(() => freshIds.delete(o.id), 6000);
      }
      if (fresh.length) ding();
    }
    known = new Set(items.map((o) => o.id));
    orders.value = items;
    error.value = "";
  } catch (e) {
    error.value = e?.response?.status === 403 ? "No tienes acceso a la barra." : "Sin conexión con la barra; reintentando…";
  } finally {
    loading.value = false;
  }
}

async function move(o, status) {
  if (!status) return;
  busyId.value = o.id;
  const before = o.status;
  o.status = status; // se ve al instante; si falla, regresa
  try {
    await apiService.setPrepStatus(o.id, status);
  } catch {
    o.status = before;
    error.value = "No se pudo cambiar el pedido. Intenta de nuevo.";
  } finally {
    busyId.value = "";
  }
}

let pollTimer = null;
let clockTimer = null;
onMounted(() => {
  load();
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") load();
  }, POLL_MS);
  clockTimer = setInterval(() => (now.value = Date.now()), 30000);
});
onUnmounted(() => {
  clearInterval(pollTimer);
  clearInterval(clockTimer);
});
</script>

<style scoped>
.cols { display: grid; gap: 0.75rem; }
.col h2 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.55rem;
  font-size: 0.85rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--timber-muted);
}
.col h2 em {
  min-width: 1.5rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-style: normal;
  text-align: center;
}
.col.ready h2 em { background: var(--timber-success-soft); color: var(--timber-success); }
.cards { display: grid; gap: 0.6rem; }
.card {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid var(--timber-line);
  border-left: 5px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.col.queued .card { border-left-color: var(--timber-warning); }
.col.preparing .card { border-left-color: var(--timber-primary); }
.col.ready .card { border-left-color: var(--timber-success); }
.card.fresh { animation: pulse 1.2s ease 3; }
.card.late time { color: var(--timber-danger); font-weight: 800; }
@keyframes pulse {
  50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--timber-warning) 35%, transparent); }
}
.card header { display: flex; align-items: baseline; gap: 0.5rem; }
.num { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.card time { font-size: 0.82rem; color: var(--timber-muted); font-variant-numeric: tabular-nums; }
.card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.4rem; }
.card li { display: flex; gap: 0.45rem; font-size: 1rem; line-height: 1.3; }
.card li b { min-width: 1.8rem; font-variant-numeric: tabular-nums; }
.card li span { display: grid; gap: 0.1rem; font-weight: 700; }
.card li small { font-size: 0.84rem; font-weight: 600; color: var(--timber-primary); }
.note { margin: 0; font-size: 0.84rem; font-weight: 600; color: var(--timber-warning); }
.card li small.note { color: var(--timber-warning); }
.acts { display: flex; gap: 0.45rem; }
.acts .adm-btn.primary { flex: 1; min-height: 3rem; font-size: 1rem; }
.acts .adm-btn.sm { min-height: 3rem; width: 3rem; padding: 0; }
.done summary { cursor: pointer; font-weight: 700; }
.done ul { margin: 0.6rem 0 0; padding: 0; list-style: none; display: grid; gap: 0.4rem; }
.done li { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; font-size: 0.9rem; }
.card-enter-from, .card-leave-to { opacity: 0; transform: translateY(6px); }
.card-enter-active, .card-leave-active { transition: all 0.2s ease; }
.only-mobile { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.only-mobile button { justify-content: center; gap: 0.3rem; min-width: 0; padding: 0 0.4rem; font-size: 0.85rem; white-space: nowrap; }
.col.hide { display: none; }
.col h2 { display: none; }
@media (min-width: 768px) {
  .only-mobile { display: none; }
  .col.hide { display: block; }
  .col h2 { display: flex; }
  .cols { grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; }
}
</style>
