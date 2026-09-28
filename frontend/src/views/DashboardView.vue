<template>
  <AppShell>
    <div class="dash t-page">
      <div class="hero-strip">
        <div>
          <h2>Resumen de ventas</h2>
          <p>{{ todayLabel }} · {{ businessName }}</p>
        </div>
        <div class="hero-actions">
          <router-link to="/pos" class="t-btn t-btn-primary">Vender</router-link>
          <router-link to="/orders" class="t-btn t-btn-ghost">Caja</router-link>
        </div>
      </div>

      <GettingStarted />

      <div class="cash-pill" :class="cashOpen ? 'open' : 'closed'">
        <span class="dot" />
        <strong>{{ cashOpen ? 'Caja abierta' : 'Caja cerrada' }}</strong>
        <span v-if="cashOpen && cashSession">
          Fondo {{ formatMoney(cashSession.openingFloat) }}
          · Ventas turno {{ formatMoney(cashTotals.total) }}
          <template v-if="cashOpenSince"> · Desde {{ cashOpenSince }}</template>
        </span>
        <span v-else>Abre caja para cobrar</span>
      </div>

      <div v-if="cashOpenWarning" class="cash-warning-banner">
        ⚠️ ¡Cuidado! La caja lleva abierta más de 12 horas. ¿Olvidaste hacer corte?
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <p class="kpi-label">Ventas cobradas hoy</p>
          <p class="kpi-value">{{ formatMoney(todaySales) }}</p>
          <p class="kpi-sub">{{ paidToday.length }} tickets pagados</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Ticket promedio</p>
          <p class="kpi-value">{{ formatMoney(avgTicket) }}</p>
          <p class="kpi-sub">sobre cobrados</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Tickets hoy</p>
          <p class="kpi-value">{{ todayOrders.length }}</p>
          <p class="kpi-sub">{{ unpaidCount }} por cobrar</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">IVA del día</p>
          <p class="kpi-value">{{ formatMoney(todayTax) }}</p>
          <p class="kpi-sub">
            <template v-if="todayCardExtra">+ extra tarjeta {{ formatMoney(todayCardExtra) }}</template>
            <template v-else>incluido en tickets</template>
          </p>
        </div>
        <div class="kpi">
          <p class="kpi-label">Arts. vendidos</p>
          <p class="kpi-value">{{ todayArts }}</p>
          <p class="kpi-sub">{{ productCount }} en catálogo</p>
        </div>
      </div>

      <!-- Widget de alertas de stock bajo -->
      <section v-if="lowStockItems.length" class="t-card low-stock-widget">
        <div class="panel-head">
          <h3>⚠️ Stock bajo</h3>
          <router-link to="/products">Ver catálogo</router-link>
        </div>
        <ul class="low-stock-wlist">
          <li v-for="item in lowStockItems.slice(0, 8)" :key="item.id">
            <span class="lsw-name">{{ item.name }}</span>
            <span class="lsw-stock">{{ Number(item.stock) || 0 }} uds</span>
            <span class="lsw-threshold">mín. {{ item.lowStockThreshold != null ? item.lowStockThreshold : 5 }}</span>
          </li>
        </ul>
      </section>

      <div class="mid">
        <section class="t-card panel">
          <div class="panel-head">
            <h3>Por forma de pago (hoy)</h3>
          </div>
          <div class="pay-bars">
            <div v-for="row in payBreakdown" :key="row.id" class="pay-row">
              <div class="pay-top">
                <span>{{ row.label }}</span>
                <strong>{{ formatMoney(row.amount) }}</strong>
              </div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: row.pct + '%' }" />
              </div>
              <p class="pay-meta">{{ row.count }} ticket(s) · {{ row.pct }}%</p>
            </div>
            <p v-if="!payBreakdown.length" class="t-empty">Sin ventas cobradas hoy.</p>
          </div>
        </section>

        <section class="t-card panel">
          <div class="panel-head">
            <h3>Ventas por hora</h3>
          </div>
          <div class="hours">
            <div v-for="h in hourly" :key="h.hour" class="hour-col" :title="h.label + ': ' + formatMoney(h.amount)">
              <div class="hour-bar-wrap">
                <div class="hour-bar" :style="{ height: h.pct + '%' }" />
              </div>
              <span>{{ h.short }}</span>
            </div>
          </div>
          <p class="hours-hint">Solo tickets cobrados de hoy</p>
        </section>
      </div>

      <div class="lower">
        <section class="t-card panel">
          <div class="panel-head">
            <h3>Últimas ventas</h3>
            <router-link to="/orders">Ver caja</router-link>
          </div>
          <p v-if="!recentOrders.length" class="t-empty">Aún no hay ventas.</p>
          <ul v-else class="recent-list">
            <li v-for="o in recentOrders" :key="o.id">
              <div class="rec-main">
                <strong>#{{ shortId(o.id) }}</strong>
                <span class="meta">
                  {{ formatTime(o.createdAt) }}
                  · {{ itemCount(o) }} arts
                  · {{ methodText(o.paymentMethod) }}
                </span>
              </div>
              <span class="t-badge" :class="o.paymentStatus">{{ paymentText(o.paymentStatus) }}</span>
              <span class="amount">{{ formatMoney(o.total) }}</span>
              <router-link
                class="print-link"
                :to="`/print/order/${o.id}?mode=receipt`"
                target="_blank"
              >Ticket</router-link>
            </li>
          </ul>
        </section>

        <section class="t-card panel">
          <div class="panel-head">
            <h3>Top productos hoy</h3>
          </div>
          <p v-if="!topProducts.length" class="t-empty">Sin movimiento.</p>
          <ol v-else class="top-list">
            <li v-for="(p, i) in topProducts" :key="p.name">
              <span class="rank">{{ i + 1 }}</span>
              <div>
                <strong>{{ p.name }}</strong>
                <span class="meta">{{ p.qty }} uds · {{ p.tickets }} ticket(s)</span>
              </div>
              <span class="amount">{{ formatMoney(p.sales) }}</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import GettingStarted from "../components/GettingStarted.vue";
import { apiService } from "../apiService";
import { venueStore, formatTodayLabel } from "../venueStore";
import { labelOf, paymentStatusLabel } from "../labels";

const orders = ref([]);
const productCount = ref(0);
const lowStockItems = ref([]);
const cashOpen = ref(false);
const cashSession = ref(null);
const cashTotals = ref({ cash: 0, card: 0, transfer: 0, other: 0, total: 0 });

const businessName = computed(() => venueStore.businessName || "Tu tienda");
const todayLabel = computed(() => formatTodayLabel(venueStore.timezone));

// Hora de apertura y aviso de caja abierta mucho tiempo
const cashOpenSince = computed(() => {
  if (!cashOpen.value || !cashSession.value) return "";
  const d = new Date(cashSession.value.createdAt || cashSession.value.openedAt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
});
const cashOpenWarning = computed(() => {
  if (!cashOpen.value || !cashSession.value) return false;
  const d = new Date(cashSession.value.createdAt || cashSession.value.openedAt);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 3600000 >= 12;
});

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

const todayOrders = computed(() => {
  const start = startOfToday();
  return orders.value.filter((o) => new Date(o.createdAt) >= start && o.status !== "cancelled");
});

const paidToday = computed(() =>
  todayOrders.value.filter((o) => o.paymentStatus === "paid")
);

const unpaidCount = computed(() =>
  todayOrders.value.filter((o) => o.paymentStatus !== "paid").length
);

const todaySales = computed(() =>
  paidToday.value.reduce((sum, o) => sum + Number(o.total || 0), 0)
);

const avgTicket = computed(() =>
  paidToday.value.length ? todaySales.value / paidToday.value.length : 0
);

const todayTax = computed(() =>
  paidToday.value.reduce((sum, o) => sum + Number(o.tax || 0), 0)
);

const todayCardExtra = computed(() =>
  paidToday.value.reduce((sum, o) => sum + Number(o.cardExtraTax || 0), 0)
);

const todayArts = computed(() =>
  paidToday.value.reduce(
    (s, o) => s + (o.items || []).reduce((a, i) => a + Number(i.quantity || 0), 0),
    0
  )
);

const payBreakdown = computed(() => {
  const buckets = {
    cash: { id: "cash", label: "Efectivo", amount: 0, count: 0 },
    card: { id: "card", label: "Tarjeta", amount: 0, count: 0 },
    transfer: { id: "transfer", label: "Transferencia", amount: 0, count: 0 },
    split: { id: "split", label: "Mixto", amount: 0, count: 0 },
    other: { id: "other", label: "Otro", amount: 0, count: 0 },
  };
  for (const o of paidToday.value) {
    const key = buckets[o.paymentMethod] ? o.paymentMethod : "other";
    buckets[key].amount += Number(o.total || 0);
    buckets[key].count += 1;
  }
  const total = todaySales.value || 1;
  return Object.values(buckets)
    .filter((b) => b.count > 0)
    .map((b) => ({
      ...b,
      pct: Math.round((b.amount / total) * 100),
    }));
});

const hourly = computed(() => {
  const map = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    amount: 0,
    short: String(hour).padStart(2, "0"),
    label: `${String(hour).padStart(2, "0")}:00`,
  }));
  for (const o of paidToday.value) {
    const h = new Date(o.paidAt || o.createdAt).getHours();
    map[h].amount += Number(o.total || 0);
  }
  const max = Math.max(...map.map((h) => h.amount), 1);
  // Solo mostrar franja comercial típica 7–22, o todas si hay datos fuera
  const active = map.filter((h) => h.hour >= 7 && h.hour <= 22);
  return active.map((h) => ({
    ...h,
    pct: Math.max(4, Math.round((h.amount / max) * 100)),
  }));
});

const topProducts = computed(() => {
  const map = new Map();
  for (const o of paidToday.value) {
    for (const item of o.items || []) {
      const name = item.name || "Producto";
      const prev = map.get(name) || { name, qty: 0, sales: 0, tickets: 0 };
      prev.qty += Number(item.quantity || 0);
      prev.sales += Number(item.price || 0) * Number(item.quantity || 0);
      prev.tickets += 1;
      map.set(name, prev);
    }
  }
  return [...map.values()].sort((a, b) => b.sales - a.sales).slice(0, 8);
});

const recentOrders = computed(() => [...orders.value].slice(0, 12));

function formatMoney(n) {
  return Number(n || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}
function formatTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function paymentText(s) {
  return labelOf(paymentStatusLabel, s);
}
function methodText(m) {
  const map = { cash: "Efectivo", card: "Tarjeta", transfer: "Transfer.", split: "Mixto", other: "Otro" };
  return map[m] || (m ? String(m) : "—");
}
function shortId(id) {
  return String(id || "").slice(-6).toUpperCase();
}
function itemCount(o) {
  return (o.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
}

onMounted(async () => {
  try {
    orders.value = (await apiService.getOrders()) || [];
  } catch {
    orders.value = [];
  }
  try {
    const foods = await apiService.getAllFoods();
    productCount.value = Array.isArray(foods) ? foods.length : 0;
  } catch {
    productCount.value = 0;
  }
  try {
    lowStockItems.value = (await apiService.getLowStockFoods()) || [];
  } catch {
    lowStockItems.value = [];
  }
  try {
    const data = await apiService.getCashSession();
    cashOpen.value = Boolean(data.open);
    cashSession.value = data.session;
    cashTotals.value = data.totals || cashTotals.value;
  } catch {
    cashOpen.value = false;
  }
});
</script>

<style scoped>
.dash {
  overflow: auto;
  max-height: 100%;
  padding-bottom: 1rem;
}
.hero-strip {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}
.hero-strip h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 800;
}
.hero-strip p { margin: 0.25rem 0 0; color: var(--timber-muted); }
.hero-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.cash-pill {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.85rem;
  padding: 0.55rem 0.85rem;
  border-radius: 0.7rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel);
  margin-bottom: 1rem;
  font-size: 0.88rem;
  color: var(--timber-muted);
}
.cash-pill strong { color: var(--timber-ink); }
.cash-pill .dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--timber-warning);
}
.cash-pill.open .dot {
  background: var(--timber-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--timber-success) 25%, transparent);
}
.cash-warning-banner {
  background: var(--timber-warning-soft, #fff3cd);
  color: var(--timber-warning, #856404);
  border: 1px solid var(--timber-warning, #ffc107);
  border-radius: 0.65rem;
  padding: 0.65rem 0.85rem;
  margin-bottom: 1rem;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.kpi {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  padding: 0.9rem 1rem;
}
.kpi.accent {
  background: color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel));
  border-color: color-mix(in srgb, var(--timber-primary) 28%, var(--timber-line));
}
.kpi-label {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--timber-muted);
  font-weight: 700;
}
.kpi-value {
  margin: 0.3rem 0 0;
  font-size: 1.45rem;
  font-weight: 800;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.kpi-sub { margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--timber-muted); }

.mid, .lower {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem;
  margin-bottom: 0.85rem;
}

@media (max-width: 767.98px) {
  .hero-actions .t-btn-ghost { display: none; }
  .hours { grid-template-columns: repeat(8, 1fr); }
  .hour-col:nth-child(n + 9) { display: none; }
  .mid, .lower { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .recent-list li {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "main amount"
      "badge print";
  }
  .rec-main { grid-area: main; }
  .amount { grid-area: amount; }
  .t-badge { grid-area: badge; justify-self: start; }
  .print-link { grid-area: print; justify-self: end; }
}

@media (min-width: 768px) and (max-width: 1099.98px) {
  .mid { grid-template-columns: 1fr; }
  .lower { grid-template-columns: 1.1fr 0.9fr; }
  .hours { grid-template-columns: repeat(12, 1fr); }
  .hour-col:nth-child(n + 13) { display: none; }
}

@media (min-width: 1100px) {
  .mid, .lower { grid-template-columns: 1.2fr 1fr; }
  .hours { grid-template-columns: repeat(16, 1fr); }
}

.panel { padding: 1rem; }
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}
.panel-head h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}
.panel-head a {
  color: var(--timber-primary);
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
}

.pay-bars { display: grid; gap: 0.75rem; }
.pay-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bar-track {
  height: 0.45rem;
  border-radius: 999px;
  background: var(--timber-surface);
  overflow: hidden;
  margin-top: 0.3rem;
}
.bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--timber-primary);
}
.pay-meta { margin: 0.25rem 0 0; font-size: 0.78rem; color: var(--timber-muted); }

.hours {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 0.25rem;
  align-items: end;
  min-height: 8.5rem;
}
.hour-col {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.25rem;
  text-align: center;
  min-height: 8rem;
}
.hour-bar-wrap {
  height: 7rem;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.hour-bar {
  width: 100%;
  max-width: 0.85rem;
  border-radius: 0.3rem 0.3rem 0.1rem 0.1rem;
  background: linear-gradient(180deg, var(--timber-accent), var(--timber-primary));
  min-height: 0.2rem;
}
.hour-col span {
  font-size: 0.62rem;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
}
.hours-hint {
  margin: 0.55rem 0 0;
  font-size: 0.78rem;
  color: var(--timber-muted);
}

.recent-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.recent-list li {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 0.55rem;
  align-items: center;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--timber-line);
}
.rec-main strong { display: block; font-variant-numeric: tabular-nums; }
.meta { display: block; font-size: 0.78rem; color: var(--timber-muted); margin-top: 0.1rem; }
.amount { font-weight: 800; font-variant-numeric: tabular-nums; }
.print-link {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--timber-primary);
  text-decoration: none;
}

.top-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.top-list li {
  display: grid;
  grid-template-columns: 1.6rem 1fr auto;
  gap: 0.55rem;
  align-items: center;
}
.rank {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.4rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 800;
}
.top-list strong { display: block; font-size: 0.92rem; }

.t-badge.paid { background: var(--timber-success-soft); color: var(--timber-success); }
.t-badge.unpaid { background: var(--timber-warning-soft); color: var(--timber-warning); }

/* —— Widget de stock bajo —— */
.low-stock-widget {
  padding: 1rem;
  margin-bottom: 0.85rem;
  background: color-mix(in srgb, var(--timber-warning) 8%, var(--timber-panel));
  border-color: color-mix(in srgb, var(--timber-warning) 30%, var(--timber-line));
}
.low-stock-wlist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.45rem;
}
.low-stock-wlist li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  border-radius: 0.55rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  font-size: 0.85rem;
}
.lsw-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.lsw-stock { font-weight: 800; color: var(--timber-warning); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.lsw-threshold { font-size: 0.72rem; color: var(--timber-muted); flex-shrink: 0; }
</style>
