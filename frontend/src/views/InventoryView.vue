<template>
  <AppShell>
    <div class="inv-page">
      <div class="hero">
        <div>
          <h2>Inventario</h2>
          <p>Proveedores, compras, caducidad y qué reordenar.</p>
        </div>
        <div class="hero-actions">
          <button v-if="isAdmin && tab === 'proveedores'" type="button" class="t-btn t-btn-primary" @click="openSupplier()">
            Nuevo proveedor
          </button>
          <button v-if="isAdmin && tab === 'compras'" type="button" class="t-btn t-btn-primary" @click="openPurchase()">
            Registrar compra
          </button>
          <button v-if="tab === 'caducidad'" type="button" class="t-btn t-btn-ghost" @click="exportExpiry">
            Exportar CSV
          </button>
        </div>
      </div>

      <div class="tabs">
        <button v-for="t in tabs" :key="t.id" type="button" :class="{ active: tab === t.id }" @click="tab = t.id">
          {{ t.label }}
        </button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <!-- Proveedores -->
      <section v-if="tab === 'proveedores'">
        <div class="toolbar">
          <input v-model="supplierQuery" type="search" placeholder="Buscar proveedor…" @input="onSupplierSearch" />
        </div>
        <div class="grid">
          <article v-for="s in suppliers" :key="s.id" class="card">
            <div class="card-head">
              <h3>{{ s.name }}</h3>
            </div>
            <p v-if="s.contact">Contacto: {{ s.contact }}</p>
            <p v-if="s.whatsapp">
              WhatsApp:
              <a :href="waLink(s.whatsapp)" target="_blank" rel="noopener">{{ s.whatsapp }}</a>
            </p>
            <p v-if="s.visitDays?.length">Visita: {{ visitLabel(s.visitDays) }}</p>
            <p v-if="s.notes" class="notes">{{ s.notes }}</p>
            <div v-if="isAdmin" class="actions">
              <button type="button" @click="openSupplier(s)">Editar</button>
              <button type="button" class="danger" @click="removeSupplier(s)">Eliminar</button>
            </div>
          </article>
          <p v-if="!suppliers.length && !loading" class="empty">Aún no hay proveedores. Agrégalos para registrar compras.</p>
        </div>
      </section>

      <!-- Compras -->
      <section v-else-if="tab === 'compras'">
        <p v-if="!purchases.length && !loading" class="empty">Todavía no hay entradas. Registra una compra para sumar stock y actualizar el costo.</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in purchases" :key="p.id" class="clickable" @click="openPurchaseDetail(p)">
                <td>{{ formatDate(p.date) }}</td>
                <td>{{ p.supplierName }}</td>
                <td>{{ (p.items || []).length }}</td>
                <td>{{ money(p.totalCost) }}</td>
                <td>{{ p.costMethod === 'average' ? 'Promedio' : 'Último' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Caducidad -->
      <section v-else-if="tab === 'caducidad'">
        <div class="kpi-row">
          <div class="kpi danger"><span>Vencidos</span><strong>{{ expiry.summary?.expired || 0 }}</strong></div>
          <div class="kpi warn"><span>7 días</span><strong>{{ expiry.summary?.d7 || 0 }}</strong></div>
          <div class="kpi"><span>15 días</span><strong>{{ expiry.summary?.d15 || 0 }}</strong></div>
          <div class="kpi"><span>30 días</span><strong>{{ expiry.summary?.d30 || 0 }}</strong></div>
        </div>
        <p v-if="!(expiry.items || []).length && !loading" class="empty">
          No hay lotes por caducar en 30 días. Marca productos «con caducidad» y captura lote al comprar.
        </p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Lote</th>
                <th>Caduca</th>
                <th>Días</th>
                <th>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in expiry.items || []" :key="row.id" :class="'bucket-' + row.bucket">
                <td>{{ row.foodName }}</td>
                <td>{{ row.lot || '—' }}</td>
                <td>{{ formatDate(row.expiresAt) }}</td>
                <td>{{ row.bucket === 'expired' ? 'Vencido' : row.daysLeft }}</td>
                <td>{{ row.quantity }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Sugerido -->
      <section v-else-if="tab === 'sugerido'">
        <p class="hint">
          Con stock mínimo y ventas de los últimos 14 días. Si el proveedor tiene días de visita, cubre hasta la siguiente visita.
        </p>
        <p v-if="!(suggestions.groups || []).length && !loading" class="empty">Nada que reordenar por ahora.</p>
        <article v-for="g in suggestions.groups || []" :key="g.supplierId || 'none'" class="suggest-card">
          <div class="card-head">
            <h3>{{ g.supplierName }}</h3>
            <a v-if="g.whatsapp" class="wa" :href="waLink(g.whatsapp)" target="_blank" rel="noopener">WhatsApp</a>
          </div>
          <p class="meta">
            {{ g.itemCount }} producto(s) · estimado {{ money(g.estimatedCost) }}
            <template v-if="g.visitDays?.length"> · visita {{ visitLabel(g.visitDays) }}</template>
          </p>
          <ul>
            <li v-for="item in g.items" :key="item.foodId">
              <strong>{{ item.name }}</strong>
              <span>stock {{ item.stock }} / mín. {{ item.lowStockThreshold }} · pedir {{ item.suggestedQty }}</span>
              <span v-if="item.unitCost">{{ money(item.estimatedCost) }}</span>
            </li>
          </ul>
        </article>
      </section>

      <!-- Bitácora -->
      <section v-else>
        <p v-if="!activity.length && !loading" class="empty">Todavía no hay movimientos de inventario.</p>
        <ul v-else class="log">
          <li v-for="row in activity" :key="row.id">
            <strong>{{ formatDateTime(row.createdAt) }}</strong>
            <span>{{ row.message }}</span>
            <em v-if="row.user">{{ row.user }}</em>
          </li>
        </ul>
      </section>

      <!-- Modal proveedor -->
      <Teleport to="body">
        <div v-if="showSupplier" class="modal-bg" @click.self="showSupplier = false">
          <form class="modal" @submit.prevent="saveSupplier" role="dialog" aria-modal="true">
            <h3>{{ editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor' }}</h3>
            <div class="modal-body">
              <label>Nombre<input v-model="supplierForm.name" required maxlength="80" /></label>
              <label>Contacto<input v-model="supplierForm.contact" maxlength="80" placeholder="Nombre o correo" /></label>
              <label>WhatsApp<input v-model="supplierForm.whatsapp" inputmode="tel" placeholder="6641234567" /></label>
              <fieldset class="days">
                <legend>Días de visita</legend>
                <label v-for="d in WEEKDAYS" :key="d.id">
                  <input v-model="supplierForm.visitDays" type="checkbox" :value="d.id" />
                  {{ d.short }}
                </label>
              </fieldset>
              <label>Notas<textarea v-model="supplierForm.notes" rows="2" maxlength="400" /></label>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showSupplier = false">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Modal compra -->
      <Teleport to="body">
        <div v-if="showPurchase" class="modal-bg" @click.self="showPurchase = false">
          <form class="modal wide" @submit.prevent="savePurchase" role="dialog" aria-modal="true">
            <h3>Registrar compra</h3>
            <div class="modal-body">
              <label>Proveedor
                <select v-model="purchaseForm.supplierId" required>
                  <option value="" disabled>Elige un proveedor</option>
                  <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </label>
              <label>Fecha<input v-model="purchaseForm.date" type="date" required /></label>
              <label>Notas<input v-model="purchaseForm.notes" maxlength="400" /></label>

              <div class="line-add">
                <input
                  v-model="productQuery"
                  type="search"
                  placeholder="Buscar producto para agregar…"
                  @input="onProductSearch"
                />
                <ul v-if="productHits.length" class="hits">
                  <li v-for="f in productHits" :key="f.id">
                    <button type="button" @click="addLine(f)">{{ f.name }} · stock {{ Number(f.stock) || 0 }}</button>
                  </li>
                </ul>
              </div>

              <div v-for="(line, idx) in purchaseForm.items" :key="idx" class="line">
                <div class="line-head">
                  <strong>{{ line.name }}</strong>
                  <button type="button" class="danger" @click="purchaseForm.items.splice(idx, 1)">Quitar</button>
                </div>
                <div class="line-grid">
                  <label>Cantidad<input v-model.number="line.quantity" type="number" min="1" step="1" required /></label>
                  <label>Costo unitario<input v-model.number="line.unitCost" type="number" min="0" step="0.01" required /></label>
                  <label v-if="line.tracksExpiry">Lote<input v-model="line.lot" required maxlength="60" /></label>
                  <label v-if="line.tracksExpiry">Caducidad<input v-model="line.expiresAt" type="date" required /></label>
                </div>
                <p v-if="line.tracksExpiry" class="line-hint">Este producto lleva caducidad: captura lote y fecha.</p>
              </div>
              <p v-if="!purchaseForm.items.length" class="empty">Agrega al menos un producto.</p>
              <p class="total">Total {{ money(purchaseTotal) }}</p>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showPurchase = false">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving || !purchaseForm.items.length">
                {{ saving ? 'Confirmando…' : 'Confirmar entrada' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Detalle compra -->
      <Teleport to="body">
        <div v-if="purchaseDetail" class="modal-bg" @click.self="purchaseDetail = null">
          <div class="modal wide" role="dialog" aria-modal="true">
            <h3>Compra · {{ purchaseDetail.supplierName }}</h3>
            <div class="modal-body">
              <p class="meta">{{ formatDate(purchaseDetail.date) }} · {{ purchaseDetail.costMethod === 'average' ? 'Costo promedio' : 'Último costo' }}</p>
              <p v-if="purchaseDetail.notes">{{ purchaseDetail.notes }}</p>
              <ul class="detail-items">
                <li v-for="(item, i) in purchaseDetail.items || []" :key="i">
                  <strong>{{ item.name }}</strong>
                  <span>{{ item.quantity }} × {{ money(item.unitCost) }}</span>
                  <span v-if="item.lot">Lote {{ item.lot }} · caduca {{ formatDate(item.expiresAt) }}</span>
                </li>
              </ul>
              <p class="total">Total {{ money(purchaseDetail.totalCost) }}</p>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn-primary" @click="purchaseDetail = null">Cerrar</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";
import { venueStore, formatTodayLabel, fetchVenueSettings } from "../venueStore";
import { hasRole } from "../authStore";

const WEEKDAYS = [
  { id: 1, short: "Lun" },
  { id: 2, short: "Mar" },
  { id: 3, short: "Mié" },
  { id: 4, short: "Jue" },
  { id: 5, short: "Vie" },
  { id: 6, short: "Sáb" },
  { id: 0, short: "Dom" },
];

const tabs = [
  { id: "proveedores", label: "Proveedores" },
  { id: "compras", label: "Compras" },
  { id: "caducidad", label: "Caducidad" },
  { id: "sugerido", label: "Sugerido" },
  { id: "bitacora", label: "Bitácora" },
];

const route = useRoute();
const tab = ref(String(route.query.tab || "proveedores"));
const isAdmin = computed(() => hasRole("admin"));
const loading = ref(false);
const saving = ref(false);
const error = ref("");

const suppliers = ref([]);
const supplierQuery = ref("");
const showSupplier = ref(false);
const editingSupplier = ref(null);
const supplierForm = reactive({
  name: "",
  contact: "",
  whatsapp: "",
  visitDays: [],
  notes: "",
});

const purchases = ref([]);
const showPurchase = ref(false);
const purchaseDetail = ref(null);
const purchaseForm = reactive({
  supplierId: "",
  date: todayISO(),
  notes: "",
  items: [],
});
const productQuery = ref("");
const productHits = ref([]);
let productTimer = null;
let supplierTimer = null;

const expiry = ref({ summary: {}, items: [] });
const suggestions = ref({ groups: [] });
const activity = ref([]);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function money(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}
function formatDate(value) {
  if (!value) return "—";
  const raw = String(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return raw.slice(0, 10);
  return dt.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function visitLabel(days) {
  const set = new Set((days || []).map(Number));
  return WEEKDAYS.filter((d) => set.has(d.id)).map((d) => d.short).join(", ");
}
function waLink(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${full}`;
}

const purchaseTotal = computed(() =>
  purchaseForm.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0)
);

watch(tab, (id) => {
  error.value = "";
  if (id === "proveedores") loadSuppliers();
  if (id === "compras") {
    loadSuppliers();
    loadPurchases();
  }
  if (id === "caducidad") loadExpiry();
  if (id === "sugerido") loadSuggestions();
  if (id === "bitacora") loadActivity();
});

function onSupplierSearch() {
  clearTimeout(supplierTimer);
  supplierTimer = setTimeout(() => loadSuppliers(), 280);
}

async function loadSuppliers() {
  loading.value = true;
  error.value = "";
  try {
    suppliers.value = (await apiService.getSuppliers(supplierQuery.value.trim() || undefined)) || [];
  } catch {
    error.value = "No se pudieron cargar los proveedores.";
    suppliers.value = [];
  } finally {
    loading.value = false;
  }
}

function openSupplier(s) {
  editingSupplier.value = s?.id || null;
  supplierForm.name = s?.name || "";
  supplierForm.contact = s?.contact || "";
  supplierForm.whatsapp = s?.whatsapp || "";
  supplierForm.visitDays = [...(s?.visitDays || [])];
  supplierForm.notes = s?.notes || "";
  showSupplier.value = true;
}

async function saveSupplier() {
  saving.value = true;
  error.value = "";
  try {
    const payload = { ...supplierForm, visitDays: [...supplierForm.visitDays] };
    if (editingSupplier.value) {
      const updated = await apiService.updateSupplier(editingSupplier.value, payload);
      const idx = suppliers.value.findIndex((x) => x.id === editingSupplier.value);
      if (idx >= 0) suppliers.value[idx] = updated;
    } else {
      const created = await apiService.createSupplier(payload);
      suppliers.value = [created, ...suppliers.value];
    }
    showSupplier.value = false;
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No se pudo guardar el proveedor.";
  } finally {
    saving.value = false;
  }
}

async function removeSupplier(s) {
  if (!confirm(`¿Eliminar a ${s.name}? Las compras anteriores se conservan.`)) return;
  try {
    await apiService.deleteSupplier(s.id);
    suppliers.value = suppliers.value.filter((x) => x.id !== s.id);
  } catch {
    error.value = "No se pudo eliminar.";
  }
}

async function loadPurchases() {
  loading.value = true;
  try {
    purchases.value = (await apiService.getPurchases()) || [];
  } catch {
    error.value = "No se pudieron cargar las compras.";
    purchases.value = [];
  } finally {
    loading.value = false;
  }
}

function openPurchase() {
  if (!suppliers.value.length) {
    error.value = "Primero agrega un proveedor.";
    tab.value = "proveedores";
    return;
  }
  purchaseForm.supplierId = suppliers.value[0]?.id || "";
  purchaseForm.date = todayISO();
  purchaseForm.notes = "";
  purchaseForm.items = [];
  productQuery.value = "";
  productHits.value = [];
  showPurchase.value = true;
}

function openPurchaseDetail(p) {
  purchaseDetail.value = p;
}

function onProductSearch() {
  clearTimeout(productTimer);
  productTimer = setTimeout(async () => {
    const q = productQuery.value.trim();
    if (q.length < 2) {
      productHits.value = [];
      return;
    }
    try {
      productHits.value = ((await apiService.searchFoods(q)) || []).slice(0, 8);
    } catch {
      productHits.value = [];
    }
  }, 220);
}

function addLine(food) {
  if (purchaseForm.items.some((l) => l.foodId === food.id)) {
    productHits.value = [];
    productQuery.value = "";
    return;
  }
  purchaseForm.items.push({
    foodId: food.id,
    name: food.name,
    quantity: 1,
    unitCost: Number(food.cost) || 0,
    lot: "",
    expiresAt: "",
    tracksExpiry: Boolean(food.tracksExpiry),
  });
  productHits.value = [];
  productQuery.value = "";
}

async function savePurchase() {
  if (!purchaseForm.items.length) return;
  saving.value = true;
  error.value = "";
  try {
    const created = await apiService.createPurchase({
      supplierId: purchaseForm.supplierId,
      date: purchaseForm.date,
      notes: purchaseForm.notes,
      items: purchaseForm.items.map((l) => ({
        foodId: l.foodId,
        quantity: Number(l.quantity) || 0,
        unitCost: Number(l.unitCost) || 0,
        lot: l.lot || "",
        expiresAt: l.tracksExpiry ? l.expiresAt : null,
      })),
    });
    purchases.value = [created, ...purchases.value];
    showPurchase.value = false;
    fetchVenueSettings().catch(() => {});
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No se pudo confirmar la compra.";
  } finally {
    saving.value = false;
  }
}

async function loadExpiry() {
  loading.value = true;
  try {
    expiry.value = (await apiService.getExpiringLots(30)) || { summary: {}, items: [] };
  } catch {
    error.value = "No se pudo consultar la caducidad.";
    expiry.value = { summary: {}, items: [] };
  } finally {
    loading.value = false;
  }
}

function exportExpiry() {
  const rows = expiry.value.items || [];
  const header = "Producto,Lote,Caducidad,Dias,Cantidad,Costo unitario,Alerta";
  const lines = rows.map((row) => {
    const exp = row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 10) : "";
    const label = row.bucket === "expired" ? "Vencido" : `${row.daysLeft} dias`;
    const cells = [
      csvCell(row.foodName || ""),
      csvCell(row.lot || ""),
      exp,
      row.daysLeft == null ? "" : row.daysLeft,
      Number(row.quantity) || 0,
      Number(row.unitCost) || 0,
      label,
    ];
    return cells.join(",");
  });
  const blob = new Blob(["\uFEFF" + [header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "caducidad.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function loadSuggestions() {
  loading.value = true;
  try {
    suggestions.value = (await apiService.getPurchaseSuggestions()) || { groups: [] };
  } catch {
    error.value = "No se pudo armar el sugerido.";
    suggestions.value = { groups: [] };
  } finally {
    loading.value = false;
  }
}

async function loadActivity() {
  loading.value = true;
  try {
    activity.value = (await apiService.getInventoryActivity()) || [];
  } catch {
    error.value = "No se pudo leer la bitácora.";
    activity.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (!tabs.some((t) => t.id === tab.value)) tab.value = "proveedores";
  if (tab.value === "proveedores") loadSuppliers();
  else if (tab.value === "compras") {
    loadSuppliers();
    loadPurchases();
  } else if (tab.value === "caducidad") loadExpiry();
  else if (tab.value === "sugerido") loadSuggestions();
  else loadActivity();
});
</script>

<style scoped>
.inv-page { animation: t-fade-up .45s ease both; overflow: auto; max-height: 100%; padding-bottom: 1rem; }
.hero { display:flex; justify-content:space-between; align-items:flex-end; gap:1rem; flex-wrap:wrap; margin-bottom:.85rem; }
.hero h2 { margin:0; font-family:var(--font-display); font-size:1.55rem; font-weight:800; }
.hero p { margin:.25rem 0 0; color:var(--timber-muted); }
.hero-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
.tabs { display:flex; gap:.45rem; margin-bottom:1rem; flex-wrap:wrap; }
.tabs button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:999px; padding:.45rem .9rem; cursor:pointer; font-size:.85rem; font-weight:600; }
.tabs button.active { background:var(--timber-primary); color:var(--timber-on-primary); border-color:transparent; }
.toolbar { margin-bottom:.9rem; }
.toolbar input { width:100%; max-width:22rem; min-height:2.75rem; border:1px solid var(--timber-line); border-radius:.7rem; padding:.55rem .85rem; font:inherit; background:var(--timber-panel-elevated); color:var(--timber-ink); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr)); gap:1rem; }
.card, .suggest-card { background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1.1rem; padding:1.15rem; box-shadow:var(--timber-shadow); color:var(--timber-ink); }
.card-head { display:flex; justify-content:space-between; gap:.5rem; align-items:start; }
.card h3, .suggest-card h3 { margin:0; font-family:var(--font-display); font-size:1.15rem; font-weight:700; }
.card p, .suggest-card .meta { margin:.4rem 0 0; font-size:.88rem; color:var(--timber-muted); }
.notes { font-style:italic; }
.actions { display:flex; gap:.45rem; margin-top:.95rem; flex-wrap:wrap; }
.actions button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:.6rem; padding:.45rem .7rem; cursor:pointer; font-size:.8rem; font-weight:600; }
.actions .danger, .line .danger { color:var(--timber-danger); border-color:color-mix(in srgb, var(--timber-danger) 35%, transparent); }
.empty, .hint { color:var(--timber-muted); }
.hint { margin:0 0 .85rem; font-size:.9rem; line-height:1.45; }
.error { color:var(--timber-danger); margin-bottom:.75rem; }
.table-wrap { overflow:auto; background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1rem; }
table { width:100%; border-collapse:collapse; font-size:.9rem; }
th, td { text-align:left; padding:.7rem .85rem; border-bottom:1px solid var(--timber-line); }
th { color:var(--timber-muted); font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; }
.clickable { cursor:pointer; }
.clickable:hover { background:var(--timber-primary-soft); }
.bucket-expired { background:color-mix(in srgb, var(--timber-danger) 10%, transparent); }
.bucket-7 { background:color-mix(in srgb, var(--timber-warning) 12%, transparent); }
.kpi-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr)); gap:.65rem; margin-bottom:.9rem; }
.kpi { background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:.85rem; padding:.75rem .85rem; display:grid; gap:.2rem; }
.kpi span { font-size:.75rem; color:var(--timber-muted); font-weight:700; }
.kpi strong { font-size:1.35rem; }
.kpi.danger { border-color:color-mix(in srgb, var(--timber-danger) 40%, var(--timber-line)); }
.kpi.warn { border-color:color-mix(in srgb, var(--timber-warning) 45%, var(--timber-line)); }
.suggest-card { margin-bottom:.85rem; }
.suggest-card ul { list-style:none; margin:.75rem 0 0; padding:0; display:grid; gap:.45rem; }
.suggest-card li { display:flex; flex-wrap:wrap; gap:.35rem 1rem; justify-content:space-between; padding:.5rem .65rem; border-radius:.6rem; background:var(--timber-panel-elevated); border:1px solid var(--timber-line); font-size:.85rem; }
.suggest-card li span { color:var(--timber-muted); }
.wa { font-size:.82rem; font-weight:700; color:var(--timber-primary); }
.log { list-style:none; margin:0; padding:0; display:grid; gap:.45rem; }
.log li { display:grid; gap:.15rem; padding:.7rem .85rem; border-radius:.75rem; background:var(--timber-panel); border:1px solid var(--timber-line); }
.log strong { font-size:.78rem; color:var(--timber-muted); }
.log em { font-size:.75rem; color:var(--timber-muted); font-style:normal; }

.modal-bg {
  position:fixed; inset:0; z-index:200;
  background:rgba(10,16,14,0.55); backdrop-filter:blur(6px);
  display:flex; align-items:flex-end; justify-content:center;
  padding:0.75rem; padding-bottom:calc(0.75rem + env(safe-area-inset-bottom,0px)); box-sizing:border-box;
}
.modal {
  background:var(--timber-panel); color:var(--timber-ink);
  border-radius:1.15rem 1.15rem .85rem .85rem;
  padding:1.15rem 1.15rem .85rem; width:min(28rem,100%);
  max-height:min(92dvh,44rem); display:flex; flex-direction:column; gap:.75rem;
  border:1px solid var(--timber-line); box-shadow:0 -8px 32px rgba(0,0,0,.22); overflow:hidden;
}
.modal.wide { width:min(40rem,100%); }
.modal h3 { margin:0; font-family:var(--font-display); font-size:1.3rem; font-weight:700; }
.modal-body { display:grid; gap:.7rem; overflow:auto; min-height:0; }
.modal label { display:grid; gap:.3rem; font-size:.88rem; font-weight:600; }
.modal input, .modal select, .modal textarea {
  min-height:3rem; border:1px solid var(--timber-line); border-radius:.7rem;
  padding:.65rem .8rem; font:inherit; background:var(--timber-panel-elevated); color:var(--timber-ink);
}
.days { border:1px solid var(--timber-line); border-radius:.7rem; padding:.65rem .75rem; display:flex; flex-wrap:wrap; gap:.45rem .7rem; }
.days legend { font-size:.82rem; font-weight:700; padding:0 .25rem; }
.days label { display:flex; align-items:center; gap:.3rem; font-weight:600; min-height:auto; }
.line { border:1px solid var(--timber-line); border-radius:.8rem; padding:.7rem; display:grid; gap:.5rem; }
.line-head { display:flex; justify-content:space-between; align-items:center; gap:.5rem; }
.line-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr)); gap:.5rem; }
.line-hint { margin:0; font-size:.78rem; color:var(--timber-muted); }
.line-add { position:relative; }
.hits { position:absolute; z-index:2; left:0; right:0; top:100%; margin:.25rem 0 0; padding:.25rem; list-style:none; background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:.7rem; box-shadow:var(--timber-shadow); max-height:12rem; overflow:auto; }
.hits button { width:100%; text-align:left; border:none; background:transparent; color:inherit; padding:.55rem .65rem; border-radius:.45rem; cursor:pointer; font:inherit; }
.hits button:hover { background:var(--timber-primary-soft); }
.total { margin:0; font-weight:800; }
.detail-items { list-style:none; margin:0; padding:0; display:grid; gap:.45rem; }
.detail-items li { display:grid; gap:.1rem; padding:.45rem 0; border-bottom:1px solid var(--timber-line); font-size:.9rem; }
.modal-actions {
  flex-shrink:0; display:grid; grid-template-columns:1fr 1.2fr; gap:.55rem;
  padding-top:.25rem; border-top:1px solid var(--timber-line);
}
.modal-actions button {
  min-height:3.15rem; border-radius:.85rem; border:1px solid var(--timber-line);
  background:var(--timber-surface); color:var(--timber-ink); font-weight:700; font-size:1rem; cursor:pointer;
}
.modal-actions .btn-primary { border:none; background:var(--timber-primary); color:var(--timber-on-primary); }
.t-btn { min-height:2.5rem; padding:0 .9rem; border-radius:.7rem; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; }
.t-btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; }
.t-btn-ghost { background:var(--timber-panel-elevated); color:var(--timber-ink); border:1px solid var(--timber-line); }
@media (min-width:720px) {
  .modal-bg { align-items:center; padding:1.5rem; }
  .modal { border-radius:1.15rem; padding:1.35rem; }
}
</style>
