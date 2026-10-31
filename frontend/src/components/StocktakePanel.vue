<template>
  <section class="st" :class="{ 'adm-loading': loading }">
    <!-- ============ Lista de conteos ============ -->
    <template v-if="!current">
      <div class="adm-card st-new">
        <div class="adm-card-head">
          <div>
            <h2>Conteo de inventario</h2>
            <p>Cuenta lo que hay en el estante y compáralo con lo que dice el sistema.</p>
          </div>
        </div>
        <p class="adm-hint">
          La pantalla de conteo <b>no te muestra</b> cuántas piezas debería haber, para que cuentes sin sesgo. Al terminar ves las
          diferencias y tú decides si se aplican.
        </p>
        <div v-if="isAdmin" class="st-new-form">
          <label class="adm-field">
            Qué contar
            <select v-model="newMenuId" class="adm-inp">
              <option value="">Todo el inventario</option>
              <option v-for="m in menus" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
            </select>
          </label>
          <button type="button" class="adm-btn primary" :disabled="busy" @click="createCount">
            <PosIcon name="plus" :size="18" /> Empezar conteo
          </button>
        </div>
        <p v-else class="adm-hint">Solo el administrador abre y aplica conteos. Tú puedes ayudar a contar los que estén abiertos.</p>
        <p v-if="error" class="adm-err" role="alert">{{ error }}</p>
      </div>

      <ul v-if="list.length" class="st-list">
        <li v-for="c in list" :key="c.id">
          <button type="button" class="st-item" @click="openCount(c.id)">
            <span class="st-item-main">
              <strong>{{ c.name }}</strong>
              <small>{{ formatWhen(c.createdAt) }} · {{ c.createdBy || "—" }}</small>
            </span>
            <span class="adm-pill" :class="statusTone(c.status)">{{ statusLabel(c.status) }}</span>
          </button>
        </li>
      </ul>
      <div v-else-if="!loading" class="adm-empty">
        <PosIcon name="box" :size="30" />
        <h3>Aún no hay conteos</h3>
        <p>Haz uno cada semana o cada mes para detectar mermas y robo hormiga.</p>
      </div>
    </template>

    <!-- ============ Un conteo ============ -->
    <template v-else>
      <div class="st-top">
        <button type="button" class="adm-btn sm" @click="closeCount"><PosIcon name="back" :size="16" /> Conteos</button>
        <div class="st-title">
          <strong>{{ current.name }}</strong>
          <small>{{ statusLabel(current.status) }} · {{ formatWhen(current.createdAt) }}</small>
        </div>
      </div>

      <!-- Avance -->
      <div class="st-progress" role="progressbar" :aria-valuenow="summary.counted" :aria-valuemin="0" :aria-valuemax="summary.total">
        <div class="st-bar"><span :style="{ width: pct + '%' }" /></div>
        <small>{{ summary.counted }} de {{ summary.total }} contados</small>
      </div>

      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
      </p>
      <p v-if="flash" class="adm-banner ok" role="status">
        <PosIcon name="check" :size="18" /> <span>{{ flash }}</span>
      </p>

      <!-- Modo: contar o revisar -->
      <nav v-if="isOpen" class="adm-tabs" role="tablist" aria-label="Modo del conteo">
        <button type="button" role="tab" :aria-selected="mode === 'count'" :class="{ on: mode === 'count' }" @click="mode = 'count'">Contar</button>
        <button type="button" role="tab" :aria-selected="mode === 'review'" :class="{ on: mode === 'review' }" @click="goReview">
          Revisar<em v-if="summary.withDiff" class="alert">{{ summary.withDiff }}</em>
        </button>
      </nav>

      <!-- Contar escaneando: el lector (o la cámara en el celular) abre la ventana para capturar cuántos hay -->
      <div v-if="mode === 'count' && isOpen" class="st-scan">
        <label class="adm-search st-scan-field">
          <PosIcon name="barcode" :size="17" />
          <input
            ref="scanInput"
            v-model="scanText"
            class="adm-inp"
            type="search"
            inputmode="search"
            enterkeyhint="done"
            placeholder="Escanea el producto a contar"
            aria-label="Escanea o escribe el código del producto a contar"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown.enter.prevent="submitScan"
          />
        </label>
        <button type="button" class="adm-btn st-cam" @click="startCamera">
          <PosIcon name="camera" :size="18" /> <span>Cámara</span>
        </button>
      </div>
      <p v-if="scanMsg" class="st-scan-msg" :class="scanMsg.tone" role="status">{{ scanMsg.text }}</p>

      <div class="adm-tools">
        <label class="adm-search">
          <PosIcon name="search" :size="16" />
          <input v-model="q" class="adm-inp" type="search" placeholder="Buscar producto o código" autocomplete="off" />
        </label>
        <select v-if="mode === 'count' && isOpen && categories.length > 1" v-model="catFilter" class="adm-inp st-filter" aria-label="Categoría">
          <option value="">Todas las categorías</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-if="mode === 'count' && isOpen" v-model="filter" class="adm-inp st-filter" aria-label="Filtrar renglones">
          <option value="all">Todos</option>
          <option value="pending">Por contar</option>
          <option value="done">Contados</option>
        </select>
        <select v-if="mode === 'review' || !isOpen" v-model="reviewFilter" class="adm-inp st-filter" aria-label="Filtrar diferencias">
          <option value="diff">Solo diferencias</option>
          <option value="short">Faltantes</option>
          <option value="over">Sobrantes</option>
          <option value="all">Todo lo contado</option>
        </select>
      </div>

      <!-- Capturar -->
      <ul v-if="mode === 'count' && isOpen" class="st-lines">
        <template v-for="g in countGroups" :key="g.name">
        <li v-if="countGroups.length > 1 || g.name" class="st-cat">
          <strong>{{ g.name || "Sin categoría" }}</strong>
          <small>{{ g.done }} de {{ g.rows.length }} contados</small>
        </li>
        <li v-for="l in g.rows" :key="l.foodId" class="st-line" :class="{ done: l.counted != null }">
          <div class="st-name">
            <strong>{{ l.name }}</strong>
            <small>{{ [l.category, l.code].filter(Boolean).join(" · ") || "—" }}</small>
          </div>
          <label class="st-qty">
            <span class="sr-only">Cantidad contada de {{ l.name }}</span>
            <input
              class="adm-inp"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              placeholder="—"
              :value="draft[l.foodId] ?? (l.counted == null ? '' : l.counted)"
              @input="onInput(l, $event.target.value)"
              @change="saveNow"
            />
            <em>{{ unitLabel(l.unit) }}</em>
          </label>
        </li>
        </template>
        <li v-if="!countRows.length" class="adm-hint st-none">Ningún producto coincide.</li>
      </ul>

      <!-- Revisar / resultado -->
      <template v-else>
        <div class="adm-kpis st-kpis">
          <div class="adm-kpi bad">
            <span>Faltan</span>
            <strong>{{ qty(summary.shortage) }}</strong>
            <small>{{ isAdmin ? money(summary.shortageValue) + " al costo" : "piezas" }}</small>
          </div>
          <div class="adm-kpi ok">
            <span>Sobran</span>
            <strong>{{ qty(summary.surplus) }}</strong>
            <small>{{ isAdmin ? money(summary.surplusValue) + " al costo" : "piezas" }}</small>
          </div>
          <div class="adm-kpi">
            <span>Con diferencia</span>
            <strong>{{ summary.withDiff }}</strong>
            <small>de {{ summary.counted }} contados</small>
          </div>
        </div>

        <ul v-if="reviewRows.length" class="st-lines">
          <li v-for="l in reviewRows" :key="l.foodId" class="st-line review">
            <div class="st-name">
              <strong>{{ l.name }}</strong>
              <small>Sistema {{ qty(l.expected) }} · Contado {{ qty(l.counted) }}</small>
            </div>
            <b class="st-diff" :class="l.diff < 0 ? 'bad' : l.diff > 0 ? 'ok' : ''">
              {{ l.diff > 0 ? "+" : "" }}{{ qty(l.diff) }}
            </b>
          </li>
        </ul>
        <div v-else class="adm-empty">
          <PosIcon name="check" :size="30" />
          <h3>{{ summary.counted ? "Sin diferencias en este filtro" : "Todavía no hay nada contado" }}</h3>
          <p v-if="summary.counted">Lo contado coincide con lo que dice el sistema.</p>
        </div>
      </template>

      <!-- Acciones -->
      <div v-if="isOpen" class="st-foot">
        <p v-if="summary.pending && mode === 'review'" class="adm-hint">
          Quedan {{ summary.pending }} sin contar: esos <b>no se tocan</b> al aplicar.
        </p>
        <div class="st-acts">
          <button v-if="isAdmin" type="button" class="adm-btn danger-ghost" :disabled="busy" @click="cancelCount">Cancelar conteo</button>
          <button v-if="mode === 'count'" type="button" class="adm-btn" :disabled="busy" @click="goReview">Revisar diferencias</button>
          <button v-if="isAdmin && mode === 'review'" type="button" class="adm-btn primary" :disabled="busy || !summary.counted" @click="confirming = true">
            Aplicar al inventario
          </button>
        </div>
      </div>
      <p v-else-if="current.status === 'applied'" class="adm-hint">
        Aplicado {{ formatWhen(current.appliedAt) }} por {{ current.appliedBy || "—" }}. Cada ajuste quedó en la Bitácora.
      </p>
    </template>

    <!-- Cámara (celular): lee un código, abre la ventana de cantidad y, al guardar, vuelve a abrirse para el siguiente -->
    <CameraScanner v-if="cameraOpen" @detect="onCameraDetect" @close="stopCamera" />

    <!-- Cuántos hay del producto escaneado (no se muestra lo que dice el sistema, para contar sin sesgo) -->
    <div v-if="scanLine" class="adm-dlg-bg st-dlg-bg" @click.self="cancelScan">
      <form class="adm-dlg st-dlg" role="dialog" aria-modal="true" aria-labelledby="st-scan-title" @submit.prevent="saveScan">
        <div class="adm-dlg-head">
          <div>
            <h3 id="st-scan-title">{{ scanLine.name }}</h3>
            <p class="adm-hint">{{ [scanLine.category, scanLine.code].filter(Boolean).join(" · ") }}</p>
          </div>
        </div>
        <label class="adm-field">
          ¿Cuántos hay? ({{ unitLabel(scanLine.unit) }})
          <input
            ref="scanQtyInput"
            v-model="scanQty"
            class="adm-inp st-big"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            placeholder="0"
            autocomplete="off"
            @focus="$event.target.select()"
          />
        </label>
        <p v-if="scanLine.counted != null" class="adm-hint">Ya lo contaste antes: {{ qty(scanLine.counted) }}. Lo que captures lo reemplaza.</p>
        <p v-if="scanErr" class="adm-err" role="alert">{{ scanErr }}</p>
        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="cancelScan">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="scanBusy">Guardar</button>
        </div>
      </form>
    </div>

    <!-- Confirmar -->
    <div v-if="confirming" class="adm-dlg-bg" @click.self="confirming = false">
      <div class="adm-dlg" role="dialog" aria-modal="true" aria-label="Aplicar conteo">
        <div class="adm-dlg-head">
          <div>
            <h3>¿Aplicar este conteo?</h3>
            <p class="adm-hint">
              Se corregirán las existencias de {{ summary.withDiff }} {{ summary.withDiff === 1 ? "producto" : "productos" }}.
              Las ventas hechas mientras contabas se respetan. No se puede deshacer, pero queda en la Bitácora.
            </p>
          </div>
        </div>
        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="confirming = false">Volver</button>
          <button type="button" class="adm-btn primary" :disabled="busy" @click="applyCount">Sí, aplicar</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import PosIcon from "./PosIcon.js";
import CameraScanner from "./CameraScanner.vue";
import { apiService } from "../apiService";
import { money } from "../textUtils";

const props = defineProps({
  isAdmin: { type: Boolean, default: false },
  menus: { type: Array, default: () => [] },
});
const emit = defineEmits(["applied"]);

const loading = ref(true);
const busy = ref(false);
const error = ref("");
const flash = ref("");
const list = ref([]);
const current = ref(null);
const newMenuId = ref("");
const mode = ref("count");
const q = ref("");
const filter = ref("all");
const reviewFilter = ref("diff");
const confirming = ref(false);
const draft = reactive({}); // lo escrito y aún no guardado: { foodId: texto }
let saveTimer = null;

const qty = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};
const unitLabel = (u) => ({ kg: "kg", g: "g", litro: "L", l: "L", metro: "m", pieza: "pzas" })[String(u).toLowerCase()] || "pzas";
const formatWhen = (v) => (v ? new Date(v).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const statusLabel = (s) => ({ open: "Abierto", applied: "Aplicado", cancelled: "Cancelado" })[s] || s;
const statusTone = (s) => ({ open: "warn", applied: "ok", cancelled: "" })[s] || "";
const msgOf = (e, fallback) => e?.response?.data?.message || (typeof e?.response?.data === "string" ? e.response.data : "") || fallback;

const isOpen = computed(() => current.value?.status === "open");
const summary = computed(() => current.value?.summary || { total: 0, counted: 0, pending: 0, withDiff: 0, shortage: 0, surplus: 0, shortageValue: 0, surplusValue: 0 });
const pct = computed(() => (summary.value.total ? Math.round((summary.value.counted / summary.value.total) * 100) : 0));

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const matches = (l) => {
  const term = norm(q.value);
  return !term || norm(l.name).includes(term) || norm(l.code).includes(term) || norm(l.category).includes(term);
};
const catFilter = ref("");
const categories = computed(() => [...new Set((current.value?.lines || []).map((l) => l.category || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")));
const countRows = computed(() =>
  (current.value?.lines || [])
    .filter((l) => !catFilter.value || l.category === catFilter.value)
    .filter(matches)
    .filter((l) => {
      if (filter.value === "pending") return l.counted == null;
      if (filter.value === "done") return l.counted != null;
      return true;
    })
);
// Los productos a contar, agrupados por categoría (cada una con su avance)
const countGroups = computed(() => {
  const map = new Map();
  for (const l of countRows.value) {
    const name = l.category || "";
    if (!map.has(name)) map.set(name, { name, rows: [], done: 0 });
    const g = map.get(name);
    g.rows.push(l);
    if (l.counted != null) g.done += 1;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
});
const reviewRows = computed(() =>
  (current.value?.lines || [])
    .filter((l) => l.counted != null && matches(l))
    .filter((l) => {
      if (reviewFilter.value === "diff") return l.diff !== 0;
      if (reviewFilter.value === "short") return l.diff < 0;
      if (reviewFilter.value === "over") return l.diff > 0;
      return true;
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
);

async function loadList() {
  loading.value = true;
  try {
    list.value = (await apiService.getStocktakes()) || [];
  } catch (e) {
    error.value = msgOf(e, "No se pudieron cargar los conteos.");
  } finally {
    loading.value = false;
  }
}

async function createCount() {
  busy.value = true;
  error.value = "";
  try {
    current.value = await apiService.createStocktake({ menuId: newMenuId.value || undefined });
    mode.value = "count";
    filter.value = "all";
    q.value = "";
  } catch (e) {
    error.value = msgOf(e, "No se pudo abrir el conteo.");
  } finally {
    busy.value = false;
  }
}

async function openCount(id) {
  loading.value = true;
  error.value = "";
  try {
    current.value = await apiService.getStocktake(id);
    mode.value = current.value.status === "open" ? "count" : "review";
    reviewFilter.value = current.value.status === "open" ? "diff" : "all";
    q.value = "";
  } catch (e) {
    error.value = msgOf(e, "No se pudo abrir el conteo.");
  } finally {
    loading.value = false;
  }
}

async function closeCount() {
  await saveNow();
  current.value = null;
  flash.value = "";
  error.value = "";
  await loadList();
}

function onInput(line, value) {
  draft[line.foodId] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 900); // guarda solo mientras capturas
}

async function saveNow() {
  clearTimeout(saveTimer);
  const ids = Object.keys(draft);
  if (!ids.length || !current.value || !isOpen.value) return true;
  const counts = ids.map((foodId) => ({ foodId, counted: draft[foodId] === "" ? null : Number(draft[foodId]) }));
  try {
    const saved = await apiService.saveStocktakeCounts(current.value.id, counts);
    ids.forEach((id) => delete draft[id]);
    current.value = saved;
    return true;
  } catch (e) {
    error.value = msgOf(e, "No se pudo guardar lo contado. Revisa las cantidades.");
    return false;
  }
}

async function goReview() {
  if (!(await saveNow())) return;
  mode.value = "review";
  reviewFilter.value = "diff";
  error.value = "";
}

async function applyCount() {
  busy.value = true;
  error.value = "";
  try {
    const r = await apiService.applyStocktake(current.value.id);
    confirming.value = false;
    flash.value = `Conteo aplicado: ${r.applied.length} ${r.applied.length === 1 ? "producto corregido" : "productos corregidos"}.`;
    current.value = await apiService.getStocktake(current.value.id);
    mode.value = "review";
    reviewFilter.value = "all";
    emit("applied");
  } catch (e) {
    confirming.value = false;
    error.value = msgOf(e, "No se pudo aplicar el conteo.");
  } finally {
    busy.value = false;
  }
}

async function cancelCount() {
  if (!window.confirm("¿Cancelar este conteo? Lo contado se descarta y no cambia el inventario.")) return;
  busy.value = true;
  try {
    await apiService.cancelStocktake(current.value.id);
    current.value = null;
    await loadList();
  } catch (e) {
    error.value = msgOf(e, "No se pudo cancelar el conteo.");
  } finally {
    busy.value = false;
  }
}

// ---- Contar escaneando ----
const scanInput = ref(null);
const scanQtyInput = ref(null);
const scanText = ref("");
const scanMsg = ref(null);
const scanLine = ref(null);
const scanQty = ref("");
const scanErr = ref("");
const scanBusy = ref(false);
const cameraOpen = ref(false);
let viaCamera = false;

// Un mismo código puede venir con ceros al inicio (UPC-A contra EAN-13) o en mayúsculas
const canon = (c) => {
  const t = String(c || "").trim();
  return /^\d+$/.test(t) ? t.replace(/^0+/, "") || "0" : t.toLowerCase();
};
function findLine(code) {
  const key = canon(code);
  if (!key) return null;
  return (current.value?.lines || []).find((l) => canon(l.code) === key || (l.altCodes || []).some((a) => canon(a) === key)) || null;
}
function focusScan() {
  nextTick(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) scanInput.value?.focus();
  });
}
function handleCode(raw) {
  const code = String(raw || "").trim();
  if (!code || !isOpen.value) return;
  const line = findLine(code);
  if (!line) {
    scanMsg.value = { tone: "warn", text: `El código ${code} no está en este conteo. Puede ser de otra categoría o no tener ese código registrado.` };
    if (viaCamera) cameraOpen.value = true;
    else focusScan();
    return;
  }
  scanMsg.value = null;
  scanErr.value = "";
  scanLine.value = line;
  scanQty.value = line.counted == null ? "" : String(line.counted);
  nextTick(() => scanQtyInput.value?.focus());
}
function submitScan() {
  const code = scanText.value;
  scanText.value = "";
  viaCamera = false;
  handleCode(code);
}
function startCamera() {
  viaCamera = true;
  scanMsg.value = null;
  cameraOpen.value = true;
}
function onCameraDetect(code) {
  cameraOpen.value = false;
  handleCode(code);
}
function stopCamera() {
  cameraOpen.value = false;
  viaCamera = false;
}
function afterScan() {
  scanLine.value = null;
  if (viaCamera) cameraOpen.value = true; // sigue con el siguiente producto
  else focusScan();
}
function cancelScan() {
  afterScan();
}
async function saveScan() {
  const line = scanLine.value;
  if (!line || scanBusy.value) return;
  const text = String(scanQty.value).trim();
  const n = text === "" ? null : Number(text);
  if (n != null && (!Number.isFinite(n) || n < 0)) {
    scanErr.value = "Escribe una cantidad válida (0 o más).";
    return;
  }
  scanBusy.value = true;
  draft[line.foodId] = n == null ? "" : String(n);
  const ok = await saveNow();
  scanBusy.value = false;
  if (!ok) {
    scanErr.value = error.value || "No se pudo guardar.";
    return;
  }
  scanMsg.value = { tone: "ok", text: n == null ? `${line.name}: sin contar` : `${line.name}: ${qty(n)} ${unitLabel(line.unit)}` };
  afterScan();
}

onMounted(loadList);
onBeforeUnmount(() => {
  clearTimeout(saveTimer);
  saveNow();
});
</script>

<style scoped>
.st > * + * { margin-top: 0.75rem; }
.st-new-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; margin-top: 0.75rem; }
.st-new-form .adm-field { flex: 1 1 14rem; }
.st-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.st-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 3.4rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.st-item:hover { background: var(--timber-panel-elevated); }
.st-item-main { display: grid; min-width: 0; }
.st-item-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-item-main small, .st-title small { color: var(--timber-muted); font-weight: 600; }
.st-top { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.st-title { display: grid; min-width: 0; }
.st-title strong { overflow-wrap: anywhere; }
.st-progress { display: grid; gap: 0.3rem; }
.st-progress small { color: var(--timber-muted); font-weight: 700; }
.st-bar { height: 0.5rem; border-radius: 999px; background: var(--timber-panel-elevated); overflow: hidden; }
.st-bar span { display: block; height: 100%; background: var(--timber-primary); transition: width 0.25s ease; }
.st-filter { width: auto; min-width: 9rem; flex: 0 1 12rem; }
.st-lines { list-style: none; margin: 0; padding: 0; border: 1px solid var(--timber-line); border-radius: 1rem; background: var(--timber-panel); overflow: hidden; }
.st-line { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.6rem 0.8rem; }
.st-line + .st-line { border-top: 1px solid var(--timber-line); }
.st-line.done { background: color-mix(in srgb, var(--timber-primary) 6%, transparent); }
.st-name { display: grid; min-width: 0; flex: 1 1 auto; }
.st-name strong { overflow-wrap: anywhere; }
.st-name small { color: var(--timber-muted); font-weight: 600; overflow-wrap: anywhere; }
.st-qty { display: flex; align-items: center; gap: 0.4rem; flex: 0 0 auto; }
.st-qty .adm-inp { width: 6.2rem; text-align: right; }
.st-qty em { font-style: normal; font-size: 0.78rem; font-weight: 700; color: var(--timber-muted); min-width: 2rem; }
.st-diff { font-size: 1.05rem; flex: 0 0 auto; }
.st-diff.bad { color: var(--timber-danger); }
.st-diff.ok { color: #1f9d57; }
.st-none { padding: 1rem; text-align: center; }
.st-kpis { grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
.st-foot { display: grid; gap: 0.5rem; padding-bottom: env(safe-area-inset-bottom, 0px); }
.st-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
.st-scan { display: flex; gap: 0.5rem; align-items: center; }
.st-scan-field { flex: 1 1 auto; max-width: none; }
.st-cam { flex: 0 0 auto; min-height: 2.75rem; }
.st-scan-msg { margin: 0; padding: 0.5rem 0.75rem; border-radius: 0.7rem; font-size: 0.88rem; font-weight: 700; background: var(--timber-surface); }
.st-scan-msg.ok { color: #1f9d57; }
.st-scan-msg.warn { background: var(--timber-warning-soft); color: var(--timber-ink); }
.st-cat { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; padding: 0.45rem 0.8rem; background: var(--timber-surface); border-top: 1px solid var(--timber-line); }
.st-cat:first-child { border-top: none; }
.st-cat small { color: var(--timber-muted); font-weight: 700; }
.st-dlg-bg { z-index: 400; }
.st-dlg { display: grid; gap: 0.75rem; }
.st-big { font-size: 1.6rem; font-weight: 800; text-align: center; min-height: 3.4rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 520px) {
  .st-cam span { display: none; }
}
@media (max-width: 420px) {
  .st-qty .adm-inp { width: 5rem; }
  .st-acts .adm-btn { flex: 1 1 100%; }
}
</style>
