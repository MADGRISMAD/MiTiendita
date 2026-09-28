<template>
  <AppShell>
    <div class="reports-page">
      <div class="toolbar">
        <p>Reportes y historial de ventas por rango de fecha.</p>
        <div class="date-range">
          <label>Desde <input v-model="dateFrom" type="date" /></label>
          <label>Hasta <input v-model="dateTo" type="date" /></label>
          <button type="button" class="btn-primary" :disabled="loadingReport" @click="loadReport">
            {{ loadingReport ? 'Cargando…' : 'Consultar' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <!-- Tarjetas resumen -->
      <div v-if="summary" class="summary-cards">
        <div class="summary-card">
          <span class="label">Total ventas</span>
          <span class="value">${{ summary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</span>
        </div>
        <div class="summary-card">
          <span class="label"># de tickets</span>
          <span class="value">{{ summary.totalOrders }}</span>
        </div>
        <div class="summary-card">
          <span class="label">Ticket promedio</span>
          <span class="value">${{ summary.averageTicket.toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</span>
        </div>
      </div>

      <!-- Top 5 productos -->
      <div v-if="summary && summary.topProducts.length" class="section">
        <h3>Top 5 productos</h3>
        <div class="top-grid">
          <div v-for="(p, i) in summary.topProducts" :key="i" class="top-item">
            <span class="rank">#{{ i + 1 }}</span>
            <span class="top-name">{{ p.name }}</span>
            <span class="top-qty">{{ p.quantity }} uds</span>
            <span class="top-rev">${{ p.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</span>
          </div>
        </div>
      </div>

      <!-- Tabla de órdenes -->
      <div v-if="orders.length" class="section">
        <h3>Órdenes en el rango ({{ orders.length }})</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Total</th>
                <th># Productos</th>
                <th>Pago</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in orders" :key="o.id">
                <td>{{ formatDate(o.createdAt) }}</td>
                <td>${{ (Number(o.total) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 }) }}</td>
                <td>{{ (o.items || []).length }}</td>
                <td>
                  <span class="badge" :class="o.paymentStatus || 'pending'">
                    {{ paymentLabel(o.paymentStatus) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-if="queried && !orders.length && !loadingReport" class="empty">No hay órdenes en este rango.</p>
    </div>
  </AppShell>
</template>

<script setup>
import { ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function weekAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

const dateFrom = ref(weekAgoISO());
const dateTo = ref(todayISO());
const loadingReport = ref(false);
const error = ref("");
const queried = ref(false);
const summary = ref(null);
const orders = ref([]);

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function paymentLabel(status) {
  const map = { paid: "Pagado", pending: "Pendiente", refunded: "Devuelto" };
  return map[status] || status || "Pendiente";
}

async function loadReport() {
  if (!dateFrom.value || !dateTo.value) {
    error.value = "Selecciona ambas fechas.";
    return;
  }
  loadingReport.value = true;
  error.value = "";
  queried.value = true;
  try {
    const from = dateFrom.value;
    const to = dateTo.value + "T23:59:59.999Z";
    const [ordersRes, summaryRes] = await Promise.all([
      apiService.getOrdersReport(from, to),
      apiService.getOrdersReportSummary(from, to),
    ]);
    orders.value = ordersRes || [];
    summary.value = summaryRes || null;
  } catch (e) {
    error.value = e.response?.data || "No se pudo cargar el reporte.";
    orders.value = [];
    summary.value = null;
  } finally {
    loadingReport.value = false;
  }
}
</script>

<style scoped>
.reports-page { animation: t-fade-up .45s ease both; }
.toolbar { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.2rem; flex-wrap:wrap; }
.toolbar p { margin:0; color:var(--timber-muted); }
.date-range { display:flex; align-items:flex-end; gap:.65rem; flex-wrap:wrap; }
.date-range label { display:grid; gap:.25rem; font-size:.85rem; font-weight:600; color:var(--timber-muted); }
.date-range input {
  min-height:2.75rem; border:1px solid var(--timber-line); border-radius:.7rem;
  padding:.5rem .7rem; font:inherit; background:var(--timber-panel-elevated); color:var(--timber-ink);
}
.btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; border-radius:.7rem; padding:.65rem 1.05rem; font-weight:600; cursor:pointer; box-shadow:var(--timber-shadow); white-space:nowrap; min-height:2.75rem; }
.btn-primary:disabled { opacity:.65; cursor:wait; }

.summary-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(10rem,1fr)); gap:.85rem; margin-bottom:1.25rem; }
.summary-card {
  background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1rem;
  padding:1rem 1.1rem; box-shadow:var(--timber-shadow); display:flex; flex-direction:column; gap:.3rem;
}
.summary-card .label { font-size:.8rem; font-weight:600; color:var(--timber-muted); text-transform:uppercase; letter-spacing:.03em; }
.summary-card .value { font-family:var(--font-display); font-size:1.55rem; font-weight:800; letter-spacing:-.02em; }

.section { margin-bottom:1.25rem; }
.section h3 { margin:0 0 .65rem; font-family:var(--font-display); font-size:1.1rem; font-weight:700; }

.top-grid { display:grid; gap:.4rem; }
.top-item {
  display:grid; grid-template-columns:2rem 1fr auto auto; gap:.65rem; align-items:center;
  background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:.75rem;
  padding:.7rem .85rem; font-size:.9rem;
}
.rank { font-weight:800; color:var(--timber-primary); }
.top-name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.top-qty { color:var(--timber-muted); font-size:.82rem; }
.top-rev { font-weight:700; }

.table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--timber-line); border-radius:1rem; }
table { width:100%; border-collapse:collapse; font-size:.88rem; }
thead { background:var(--timber-panel-elevated); }
th { padding:.7rem .85rem; text-align:left; font-weight:700; font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:var(--timber-muted); border-bottom:1px solid var(--timber-line); }
td { padding:.7rem .85rem; border-bottom:1px solid var(--timber-line); }
tbody tr:last-child td { border-bottom:none; }

.badge { display:inline-block; padding:.2rem .55rem; border-radius:999px; font-size:.72rem; font-weight:700; }
.badge.paid { background:var(--timber-success-soft); color:var(--timber-success); }
.badge.pending { background:var(--timber-surface); color:var(--timber-muted); }
.badge.refunded { background:var(--timber-danger-soft); color:var(--timber-danger); }

.empty, .error { color:var(--timber-muted); }
.error { color:var(--timber-danger); margin-bottom:.75rem; }
</style>
