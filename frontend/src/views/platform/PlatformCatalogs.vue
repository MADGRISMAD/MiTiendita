<template>
  <PlatformFrame title="Catálogos" :subtitle="subtitle">
    <template #actions>
      <template v-if="mode === 'catalog'">
        <button type="button" class="adm-btn" :disabled="!items.length" @click="exportCatalog">Exportar</button>
        <button type="button" class="adm-btn" @click="showImport = !showImport">Importar archivo</button>
        <button type="button" class="adm-btn primary" @click="openEdit(null)">Agregar producto</button>
      </template>
    </template>

    <p v-if="flash" class="adm-banner ok" role="status">{{ flash }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <nav class="adm-tabs main" aria-label="Catálogo por giro">
      <button v-for="c in catalogs" :key="c.key" type="button" :class="{ on: catalog === c.key }" :aria-pressed="catalog === c.key" @click="pickCatalog(c.key)">
        {{ c.label }}<em>{{ c.total }}</em>
      </button>
    </nav>
    <nav class="adm-tabs" aria-label="Qué ver">
      <button type="button" :class="{ on: mode === 'catalog' }" :aria-pressed="mode === 'catalog'" @click="mode = 'catalog'">El catálogo</button>
      <button type="button" :class="{ on: mode === 'store' }" :aria-pressed="mode === 'store'" @click="mode = 'store'">Ver el catálogo de una tienda</button>
    </nav>

    <p class="adm-hint">
      Lo que cambies aquí lo reciben las tiendas nuevas de este giro. A las que ya cargaron su catálogo no se les mueve nada solo: en Ajustes les aparece cuántos
      productos faltan y lo cargan cuando quieran.
    </p>

    <!-- ═══ EL CATÁLOGO ═══ -->
    <template v-if="mode === 'catalog'">
      <section v-if="showImport" class="adm-card pf-card-stack">
        <div class="adm-card-head">
          <div>
            <h2>Importar un archivo</h2>
            <p>
              Un CSV (en Excel: Guardar como CSV) con las columnas <strong>{{ columns.join(", ") }}</strong>. Lo que ya existe se actualiza por su código (o por nombre y
              presentación); lo nuevo se agrega. No se borra nada.
            </p>
          </div>
          <button type="button" class="adm-btn sm" @click="downloadTemplate">Descargar plantilla</button>
        </div>
        <input ref="fileInput" type="file" accept=".csv,text/csv,text/plain" class="adm-inp" @change="readFile" />
        <p v-if="importError" class="pf-err" role="alert">{{ importError }}</p>
        <template v-if="importRows.length">
          <p class="adm-hint">Se leyeron <strong>{{ importRows.length }}</strong> productos de «{{ importName }}».</p>
          <div class="acts">
            <button type="button" class="adm-btn primary" :disabled="busy" @click="runImport">{{ busy ? "Importando…" : `Importar ${importRows.length} productos` }}</button>
            <button type="button" class="adm-btn ghost" @click="clearImport">Cancelar</button>
          </div>
        </template>
        <div v-if="importResult" class="pf-ok" role="status">
          Listo: {{ importResult.created }} nuevos y {{ importResult.updated }} actualizados<template v-if="importResult.errors.length">, {{ importResult.errors.length }} con error</template>.
          <ul v-if="importResult.errors.length" class="pf-err-list">
            <li v-for="e in importResult.errors.slice(0, 15)" :key="e.row">Fila {{ e.row + 1 }}: {{ e.message }}</li>
            <li v-if="importResult.errors.length > 15">…y {{ importResult.errors.length - 15 }} más.</li>
          </ul>
        </div>
      </section>

      <section class="adm-card pf-card-stack" :class="{ 'adm-loading': loading }">
        <label class="adm-search">
          <span class="pf-sr">Buscar en el catálogo</span>
          <input v-model="query" class="adm-inp" type="search" placeholder="Buscar por nombre, código o categoría" />
        </label>
        <p v-if="!loading && !items.length" class="pf-muted">
          Este catálogo está vacío. Las tiendas de este giro no reciben nada hasta que agregues productos: a mano, importando un archivo o pasándolos desde una tienda.
        </p>
        <p v-else-if="!sections.length" class="pf-muted">Nada coincide con la búsqueda.</p>
        <details v-for="s in sections" :key="s.name" class="cat-section" :open="Boolean(query) || sections.length === 1">
          <summary>
            <strong>{{ s.name }}</strong>
            <span class="pf-chip">{{ s.items.length }}</span>
          </summary>
          <ul class="pf-list">
            <li v-for="i in s.items" :key="i.key" class="cat-row">
              <span class="body">
                <strong>{{ i.name }}<template v-if="i.presentation"> · {{ i.presentation }}</template></strong>
                <small>{{ i.code || "sin código" }} · {{ unitName(i.unit) }}<template v-if="i.plu"> · se pesa (PLU)</template></small>
              </span>
              <span v-if="i.verified" class="adm-pill good">Verificado</span>
              <span class="acts">
                <button type="button" class="adm-btn sm" @click="openEdit(i)">Editar</button>
                <button type="button" class="adm-btn sm danger-ghost" :disabled="busy" @click="removeItem(i)">Quitar</button>
              </span>
            </li>
          </ul>
        </details>
      </section>
    </template>

    <!-- ═══ EL CATÁLOGO DE UNA TIENDA ═══ -->
    <template v-else>
      <section class="adm-card pf-card-stack">
        <div class="adm-card-head">
          <div>
            <h2>Productos de una tienda</h2>
            <p>Revisa qué tiene la tienda que todavía no está en el catálogo y pásalo. Solo se ven nombre, código, categoría y unidad: nunca precios, costos ni existencias.</p>
          </div>
        </div>
        <div class="pf-inline">
          <label class="adm-field grow">
            <span>Buscar la tienda</span>
            <input v-model="storeQuery" class="adm-inp" type="search" placeholder="Nombre de la tienda" autocomplete="off" />
          </label>
          <label class="adm-field grow">
            <span>Tienda</span>
            <select v-model="storeId" class="adm-inp" @change="loadStore">
              <option value="">Elige una tienda…</option>
              <option v-for="t in storeMatches" :key="t.id" :value="t.id">{{ t.businessName }}</option>
            </select>
          </label>
        </div>
      </section>

      <section v-if="store" class="adm-card pf-card-stack" :class="{ 'adm-loading': storeLoading }">
        <div class="adm-card-head">
          <div>
            <h2>{{ store.businessName }}</h2>
            <p>
              {{ store.total }} productos · <strong>{{ store.notInCatalog }}</strong> no están en el catálogo «{{ catalogLabel(store.catalog) }}»
            </p>
          </div>
          <div class="acts">
            <button type="button" class="adm-btn sm" @click="exportStore">Exportar {{ onlyMissing ? "los que faltan" : "todos" }}</button>
          </div>
        </div>
        <div class="pf-inline">
          <label class="adm-field" style="grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem">
            <input v-model="onlyMissing" type="checkbox" />
            <span>Solo los que faltan en el catálogo</span>
          </label>
          <label class="adm-field">
            <span>Pasar al catálogo</span>
            <select v-model="target" class="adm-inp">
              <option v-for="c in catalogs" :key="c.key" :value="c.key">{{ c.label }}</option>
            </select>
          </label>
          <button type="button" class="adm-btn primary" :disabled="busy || !picked.size" @click="addPicked">
            {{ busy ? "Pasando…" : `Agregar ${picked.size} seleccionados` }}
          </button>
        </div>
        <p v-if="!storeSections.length" class="pf-muted">{{ onlyMissing ? "No falta nada: todo lo de esta tienda ya está en el catálogo." : "La tienda no tiene productos." }}</p>
        <details v-for="s in storeSections" :key="s.name" class="cat-section" open>
          <summary>
            <strong>{{ s.name }}</strong>
            <span class="pf-chip">{{ s.items.length }}</span>
            <button type="button" class="adm-btn sm" @click.prevent="toggleSection(s)">Marcar todos</button>
          </summary>
          <ul class="pf-list">
            <li v-for="p in s.items" :key="p.id" class="cat-row">
              <label class="cat-pick">
                <input type="checkbox" :checked="picked.has(p.id)" :disabled="p.inCatalog" @change="togglePick(p)" />
                <span class="body">
                  <strong>{{ p.name }}</strong>
                  <small>{{ p.code || "sin código" }} · {{ unitName(p.unit) }}</small>
                </span>
              </label>
              <span class="adm-pill" :class="p.inCatalog ? 'good' : 'warn'">{{ p.inCatalog ? "Ya está" : "Falta" }}</span>
            </li>
          </ul>
        </details>
      </section>
    </template>

    <!-- Agregar / editar un producto -->
    <Teleport to="body">
      <div v-if="editing" class="adm-dlg-bg" @click.self="editing = null">
        <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="ci-title" @submit.prevent="saveItem">
          <div class="adm-dlg-head">
            <span class="adm-dlg-ico">{{ editing.key ? "✎" : "+" }}</span>
            <div>
              <h3 id="ci-title">{{ editing.key ? "Editar producto" : "Agregar producto" }}</h3>
              <p>{{ catalogLabel(catalog) }}</p>
            </div>
            <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="editing = null">×</button>
          </div>
          <label class="adm-field">
            <span>Categoría</span>
            <input v-model="form.section" class="adm-inp" list="cat-sections" maxlength="80" placeholder="Ej. Analgésicos" autocomplete="off" />
            <datalist id="cat-sections"><option v-for="s in allSections" :key="s" :value="s" /></datalist>
          </label>
          <label class="adm-field"><span>Nombre</span><input v-model="form.name" class="adm-inp" required minlength="2" maxlength="120" autocomplete="off" /></label>
          <div class="adm-row2">
            <label class="adm-field"><span>Presentación <em>(opcional)</em></span><input v-model="form.presentation" class="adm-inp" maxlength="40" placeholder="500 mg c/20" autocomplete="off" /></label>
            <label class="adm-field"><span>Código de barras <em>(opcional)</em></span><input v-model="form.code" class="adm-inp" inputmode="numeric" maxlength="40" autocomplete="off" /></label>
          </div>
          <div class="adm-row2">
            <label class="adm-field">
              <span>Unidad de venta</span>
              <select v-model="form.unit" class="adm-inp">
                <option v-for="u in UNITS" :key="u.id" :value="u.id">{{ u.label }}</option>
              </select>
            </label>
            <div class="adm-field cat-checks">
              <label><input v-model="form.plu" type="checkbox" /> Se pesa (clave de báscula)</label>
              <label><input v-model="form.verified" type="checkbox" /> Código verificado</label>
            </div>
          </div>
          <p v-if="formError" class="pf-err" role="alert">{{ formError }}</p>
          <div class="adm-dlg-acts">
            <button type="button" class="adm-btn" @click="editing = null">Cancelar</button>
            <button type="submit" class="adm-btn primary" :disabled="busy">{{ busy ? "Guardando…" : "Guardar" }}</button>
          </div>
        </form>
      </div>
    </Teleport>
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import { apiService } from "../../apiService";
import { CATALOG_COLUMNS, catalogRowsFromCsv, catalogRowsToCsv } from "../../catalogImport";
import { downloadCsv } from "../../download";
import { fold } from "../../priceImport";

const UNITS = [
  { id: "pz", label: "Pieza" },
  { id: "kg", label: "Kilo" },
  { id: "g", label: "Gramo" },
  { id: "l", label: "Litro" },
];
const columns = CATALOG_COLUMNS;

const catalogs = ref([]);
const catalog = ref("abarrotes");
const mode = ref("catalog");
const items = ref([]);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const flash = ref("");
const query = ref("");

const errText = (e, fallback) => (typeof e.response?.data === "string" && e.response.data ? e.response.data : fallback);
function say(text) {
  flash.value = text;
  setTimeout(() => (flash.value = ""), 6000);
}
const unitName = (id) => UNITS.find((u) => u.id === id)?.label.toLowerCase() || id;
const catalogLabel = (key) => catalogs.value.find((c) => c.key === key)?.label || key;

const subtitle = computed(() => {
  const c = catalogs.value.find((x) => x.key === catalog.value);
  return c ? `${catalogLabel(c.key)} · ${c.total} productos en ${c.sections} categorías` : "Los productos que ya vienen cargados en las tiendas nuevas";
});

function group(list) {
  const map = new Map();
  for (const i of list) map.set(i.section, [...(map.get(i.section) || []), i]);
  return [...map.entries()].map(([name, rows]) => ({ name, items: rows })).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const sections = computed(() => {
  const q = fold(query.value);
  const list = q ? items.value.filter((i) => fold(`${i.name} ${i.presentation} ${i.code} ${i.section}`).includes(q)) : items.value;
  return group(list);
});
const allSections = computed(() => [...new Set(items.value.map((i) => i.section))].sort((a, b) => a.localeCompare(b, "es")));

async function loadCatalogs() {
  try {
    catalogs.value = await apiService.platformCatalogs();
  } catch (e) {
    error.value = errText(e, "No pude cargar los catálogos.");
  }
}
async function loadItems() {
  loading.value = true;
  error.value = "";
  try {
    items.value = await apiService.platformCatalogItems(catalog.value);
  } catch (e) {
    error.value = errText(e, "No pude cargar el catálogo.");
  } finally {
    loading.value = false;
  }
}
function pickCatalog(key) {
  catalog.value = key;
  target.value = key;
  query.value = "";
  clearImport();
  loadItems();
}

// ---------- Agregar y editar ----------
const editing = ref(null);
const formError = ref("");
const form = reactive({ section: "", name: "", presentation: "", code: "", unit: "pz", plu: false, verified: false });
function openEdit(item) {
  editing.value = item || {};
  formError.value = "";
  Object.assign(form, { section: item?.section || "", name: item?.name || "", presentation: item?.presentation || "", code: item?.code || "", unit: item?.unit || "pz", plu: Boolean(item?.plu), verified: Boolean(item?.verified) });
}
async function saveItem() {
  busy.value = true;
  formError.value = "";
  try {
    const saved = await apiService.platformCatalogSave(catalog.value, { ...form }, editing.value?.key);
    editing.value = null;
    say(`Guardado: ${saved.name}.`);
    await Promise.all([loadItems(), loadCatalogs()]);
  } catch (e) {
    formError.value = errText(e, "No pude guardar el producto.");
  } finally {
    busy.value = false;
  }
}
async function removeItem(item) {
  if (!window.confirm(`¿Quitar «${item.name}» del catálogo? Las tiendas que ya lo tienen no se ven afectadas.`)) return;
  busy.value = true;
  try {
    await apiService.platformCatalogDelete(catalog.value, item.key);
    say(`Se quitó ${item.name}.`);
    await Promise.all([loadItems(), loadCatalogs()]);
  } catch (e) {
    error.value = errText(e, "No pude quitar el producto.");
  } finally {
    busy.value = false;
  }
}

// ---------- Importar y exportar ----------
const showImport = ref(false);
const fileInput = ref(null);
const importRows = ref([]);
const importName = ref("");
const importError = ref("");
const importResult = ref(null);
function clearImport() {
  importRows.value = [];
  importName.value = "";
  importError.value = "";
  importResult.value = null;
  if (fileInput.value) fileInput.value.value = "";
}
async function readFile(event) {
  const file = event.target.files?.[0];
  importRows.value = [];
  importResult.value = null;
  importError.value = "";
  if (!file) return;
  const parsed = catalogRowsFromCsv(await file.text());
  importError.value = parsed.error;
  importRows.value = parsed.rows;
  importName.value = file.name;
}
async function runImport() {
  busy.value = true;
  try {
    importResult.value = await apiService.platformCatalogImport(catalog.value, importRows.value);
    importRows.value = [];
    await Promise.all([loadItems(), loadCatalogs()]);
  } catch (e) {
    importError.value = errText(e, "No pude importar el archivo.");
  } finally {
    busy.value = false;
  }
}
function downloadTemplate() {
  downloadCsv("plantilla-catalogo.csv", CATALOG_COLUMNS, [["Analgésicos", "Paracetamol", "500 mg c/20", "7502000000011", "pz", "", "", "", ""]]);
}
function exportCatalog() {
  downloadCsv(`catalogo-${catalog.value}.csv`, CATALOG_COLUMNS, catalogRowsToCsv(items.value));
}

// ---------- Catálogo de una tienda ----------
const stores = ref([]);
const storeQuery = ref("");
const storeId = ref("");
const store = ref(null);
const storeLoading = ref(false);
const onlyMissing = ref(true);
const target = ref("abarrotes");
const picked = ref(new Set());
const storeMatches = computed(() => {
  const q = fold(storeQuery.value);
  return (q ? stores.value.filter((t) => fold(t.businessName).includes(q)) : stores.value).slice(0, 200);
});
const storeSections = computed(() => group((store.value?.products || []).filter((p) => !onlyMissing.value || !p.inCatalog).map((p) => ({ ...p, section: p.section }))));
async function loadStore() {
  store.value = null;
  picked.value = new Set();
  if (!storeId.value) return;
  storeLoading.value = true;
  error.value = "";
  try {
    store.value = await apiService.platformTenantProducts(storeId.value);
    target.value = store.value.catalog;
  } catch (e) {
    error.value = errText(e, "No pude cargar los productos de la tienda.");
  } finally {
    storeLoading.value = false;
  }
}
function togglePick(p) {
  const next = new Set(picked.value);
  if (next.has(p.id)) next.delete(p.id);
  else next.add(p.id);
  picked.value = next;
}
function toggleSection(s) {
  const next = new Set(picked.value);
  const missing = s.items.filter((p) => !p.inCatalog);
  const allOn = missing.every((p) => next.has(p.id));
  for (const p of missing) allOn ? next.delete(p.id) : next.add(p.id);
  picked.value = next;
}
async function addPicked() {
  busy.value = true;
  error.value = "";
  try {
    const out = await apiService.platformCatalogFromTenant(target.value, storeId.value, [...picked.value]);
    say(`Se agregaron ${out.created} productos al catálogo «${catalogLabel(target.value)}»${out.skipped ? ` (${out.skipped} ya estaban)` : ""}.`);
    picked.value = new Set();
    await Promise.all([loadStore(), loadCatalogs(), catalog.value === target.value ? loadItems() : Promise.resolve()]);
  } catch (e) {
    error.value = errText(e, "No pude pasar los productos.");
  } finally {
    busy.value = false;
  }
}
function exportStore() {
  const rows = (store.value?.products || []).filter((p) => !onlyMissing.value || !p.inCatalog);
  downloadCsv(`tienda-${fold(store.value.businessName).replace(/[^a-z0-9]+/g, "-") || "productos"}.csv`, CATALOG_COLUMNS, catalogRowsToCsv(rows));
}

onMounted(async () => {
  await loadCatalogs();
  loadItems();
  try {
    stores.value = ((await apiService.platformListTenants()) || []).filter((t) => t.businessName);
  } catch {
    stores.value = [];
  }
});
</script>

<style scoped>
.cat-section { border: 1px solid var(--timber-line); border-radius: 0.9rem; padding: 0.4rem 0.8rem; background: var(--timber-surface); }
.cat-section > summary { display: flex; align-items: center; gap: 0.6rem; cursor: pointer; padding: 0.4rem 0; list-style-position: inside; }
.cat-section > summary strong { flex: 1 1 auto; }
.cat-row { display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem 0; border-top: 1px solid var(--timber-line); }
.cat-row .body { display: grid; gap: 0.1rem; min-width: 0; flex: 1 1 auto; }
.cat-row .body small { color: var(--timber-muted); }
.cat-row .acts { display: flex; gap: 0.4rem; }
.cat-pick { display: flex; align-items: center; gap: 0.6rem; flex: 1 1 auto; min-width: 0; cursor: pointer; }
.cat-checks { display: grid; gap: 0.4rem; align-content: end; }
.cat-checks label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
.pf-err-list { margin: 0.4rem 0 0; padding-left: 1.1rem; }
@media (max-width: 40rem) {
  .cat-row { flex-wrap: wrap; }
}
</style>
