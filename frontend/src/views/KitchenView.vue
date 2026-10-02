<template>
  <AppShell>
    <div class="kds">
      <header class="kds-bar">
        <div>
          <h1>Cocina</h1>
          <p>{{ activeCount }} activos · actualización automática</p>
        </div>
        <button type="button" class="refresh" :disabled="loading" @click="load">
          {{ loading ? '…' : 'Actualizar' }}
        </button>
      </header>

      <div class="board">
        <section
          v-for="col in columns"
          :key="col.status"
          class="col"
          :class="col.tone"
        >
          <header class="col-head">
            <h2>{{ col.label }}</h2>
            <span class="count">{{ byStatus(col.status).length }}</span>
          </header>

          <div class="col-body">
            <article
              v-for="o in byStatus(col.status)"
              :key="o.id"
              class="ticket"
              :class="urgencyClass(o)"
            >
              <div class="ticket-top">
                <p class="table">{{ o.tableName || 'Sin mesa' }}</p>
                <span class="timer" :class="urgencyClass(o)">{{ ago(o.createdAt) }}</span>
              </div>
              <p class="meta">{{ modalityText(o.modality) }}</p>

            <ul class="items">
              <li v-for="(item, i) in o.items || []" :key="i">
                <span class="qty">{{ item.quantity }}</span>
                <span class="name">{{ item.name }}</span>
              </li>
            </ul>

            <div class="ticket-actions">
              <a
                class="print-link"
                :href="`/print/order/${o.id}?mode=kitchen`"
                target="_blank"
                rel="noopener"
              >Imprimir</a>
              <button
                type="button"
                class="bump"
                :class="col.btnClass"
                :disabled="busyId === o.id"
                @click="advance(o, col.next)"
              >
                {{ busyId === o.id ? '…' : col.action }}
              </button>
            </div>
            </article>

            <p v-if="!byStatus(col.status).length" class="empty">Vacío</p>
          </div>
        </section>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";
import { labelOf, modalityLabel } from "../labels";

const orders = ref([]);
const loading = ref(false);
const busyId = ref(null);
const now = ref(Date.now());
let pollTimer;
let clockTimer;

const columns = [
  { status: "pending", label: "Nuevos", next: "preparing", action: "EMPEZAR", tone: "tone-new", btnClass: "primary" },
  { status: "preparing", label: "Preparando", next: "ready", action: "LISTO", tone: "tone-cook", btnClass: "primary" },
  { status: "ready", label: "Listos", next: "served", action: "ENTREGADO", tone: "tone-ready", btnClass: "success" },
];

function byStatus(status) {
  return orders.value
    .filter((o) => o.status === status && o.paymentStatus !== "paid")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

const activeCount = computed(() =>
  orders.value.filter(
    (o) => ["pending", "preparing", "ready"].includes(o.status) && o.paymentStatus !== "paid"
  ).length
);

function modalityText(m) {
  return labelOf(modalityLabel, m);
}

function minsWaiting(d) {
  if (!d) return 0;
  return Math.floor((now.value - new Date(d).getTime()) / 60000);
}

function ago(d) {
  const mins = minsWaiting(d);
  if (mins < 1) return "ahora";
  return `${mins} min`;
}

function urgencyClass(o) {
  const m = minsWaiting(o.createdAt);
  if (m >= 15) return "hot";
  if (m >= 8) return "warm";
  return "fresh";
}

async function load() {
  loading.value = true;
  try {
    orders.value = (await apiService.getOrders()) || [];
  } catch {
    orders.value = [];
  } finally {
    loading.value = false;
  }
}

async function advance(o, next) {
  if (!next || busyId.value) return;
  busyId.value = o.id;
  try {
    const updated = await apiService.updateOrderStatus(o.id, next);
    const idx = orders.value.findIndex((x) => x.id === updated.id);
    if (idx >= 0) orders.value[idx] = updated;
    else await load();
  } catch {
    await load();
  } finally {
    busyId.value = null;
  }
}

onMounted(() => {
  load();
  pollTimer = setInterval(load, 5000);
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 30000);
});
onUnmounted(() => {
  clearInterval(pollTimer);
  clearInterval(clockTimer);
});
</script>

<style scoped>
.kds {
  display: grid;
  gap: 0.85rem;
  animation: t-fade-up 0.35s ease both;
  min-height: calc(100dvh - 9.5rem);
}

.kds-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}
.kds-bar h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.kds-bar p {
  margin: 0.1rem 0 0;
  color: var(--timber-muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.refresh {
  min-height: 2.85rem;
  padding: 0 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 700;
  cursor: pointer;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

.col {
  display: flex;
  flex-direction: column;
  min-height: 22rem;
  border-radius: 1.1rem;
  padding: 0.75rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.col.tone-new {
  background: linear-gradient(180deg, color-mix(in srgb, var(--timber-warning) 10%, var(--timber-panel)), var(--timber-panel));
}
.col.tone-cook {
  background: linear-gradient(180deg, color-mix(in srgb, var(--timber-accent) 12%, var(--timber-panel)), var(--timber-panel));
}
.col.tone-ready {
  background: linear-gradient(180deg, color-mix(in srgb, var(--timber-success) 12%, var(--timber-panel)), var(--timber-panel));
}

.col-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.65rem;
  gap: 0.5rem;
}
.col-head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--timber-ink);
  color: var(--timber-panel);
  font-weight: 800;
  font-size: 0.85rem;
}

.col-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow: auto;
  flex: 1;
  min-height: 0;
  padding-bottom: 0.25rem;
}

.ticket {
  display: grid;
  gap: 0.55rem;
  padding: 0.8rem;
  border-radius: 0.95rem;
  background: var(--timber-panel-elevated);
  border: 2px solid var(--timber-line);
}
.ticket.fresh { border-color: color-mix(in srgb, var(--timber-success) 40%, var(--timber-line)); }
.ticket.warm { border-color: color-mix(in srgb, var(--timber-warning) 65%, var(--timber-line)); }
.ticket.hot { border-color: var(--timber-danger); background: color-mix(in srgb, var(--timber-danger) 8%, var(--timber-panel-elevated)); }

.ticket-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.4rem;
}
.table {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.meta {
  margin: 0;
  color: var(--timber-muted);
  font-size: 0.78rem;
  font-weight: 600;
}
.timer {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 1.6rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
  background: var(--timber-surface);
  color: var(--timber-ink);
}
.timer.warm { background: var(--timber-warning-soft); color: var(--timber-warning); }
.timer.hot { background: var(--timber-danger-soft); color: var(--timber-danger); }

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.items li {
  display: grid;
  grid-template-columns: 2.1rem 1fr;
  gap: 0.4rem;
  align-items: center;
}
.qty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  border-radius: 0.45rem;
  background: var(--timber-ink);
  color: var(--timber-panel);
  font-size: 1.05rem;
  font-weight: 800;
}
.name {
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.2;
}

.ticket-actions { display: grid; gap: 0.4rem; }
.print-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  border-radius: 0.7rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-weight: 700;
  text-decoration: none;
  font-size: 0.9rem;
}
.bump {
  width: 100%;
  min-height: 3.15rem;
  border: none;
  border-radius: 0.8rem;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  touch-action: manipulation;
}
.bump:disabled { opacity: 0.55; cursor: wait; }
.bump.primary {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.bump.success {
  background: var(--timber-success);
  color: #062812;
}
.bump:active:not(:disabled) { transform: scale(0.98); }

.empty {
  margin: 1.5rem 0;
  text-align: center;
  color: var(--timber-muted);
  font-weight: 600;
  font-size: 0.9rem;
}

@media (max-width: 900px) {
  .board {
    grid-template-columns: 1fr;
  }
  .col {
    min-height: auto;
  }
  .col-body {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    overflow: visible;
  }
  .empty {
    grid-column: 1 / -1;
  }
}
</style>
