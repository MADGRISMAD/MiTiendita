<template>
  <PlatformFrame title="Catálogos" :subtitle="subtitle">
    <template #actions>
      <template v-if="mode === 'catalog'">
        <button type="button" class="adm-btn" :disabled="!items.length" @click="exportCatalog">Exportar</button>
        <button type="button" class="adm-btn" @click="showImport = !showImport">Importar archivo</button>
        <button type="button" class="adm-btn" :aria-pressed="showCodes" @click="showCodes = !showCodes">Verificar códigos</button>
        <button type="button" class="adm-btn danger-ghost" :disabled="busy || !items.length" @click="clearCatalog">Eliminar catálogo</button>
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

      <section v-if="showCodes" class="adm-card pf-card-stack">
        <div class="adm-card-head">
          <div>
            <h2>Verificar códigos de barras</h2>
            <p>
              Primero revisa lo que se puede saber sin internet (dígito verificador, longitud, repetidos y sin código). Después compara el nombre de cada producto con
              bases públicas (Open Food Facts y hermanas, UPCitemdb). Es una guía: nada se cambia solo.
            </p>
          </div>
        </div>
        <div class="acts">
          <button type="button" class="adm-btn primary" :disabled="codesBusy || onlineRunning || suggestRunning" @click="runAll">
            {{ allRunning ? "Revisando…" : "Revisar y proponer cambios" }}
          </button>
          <button type="button" class="adm-btn" :disabled="codesBusy || onlineRunning || suggestRunning" title="Solo lo que se puede saber sin internet" @click="runCodes">Solo revisión rápida</button>
          <button v-if="allRunning" type="button" class="adm-btn" @click="stopAll">Detener</button>
          <label class="cat-checks"><span><input v-model="onlyUnverified" type="checkbox" :disabled="onlineRunning" /> Solo los que no están verificados</span></label>
        </div>
        <p v-if="codesError" class="pf-err" role="alert">{{ codesError }}</p>
        <template v-if="codes">
          <p class="adm-hint">
            {{ codes.counts.total }} productos: <strong>{{ codes.counts.ok }}</strong> con código válido ·
            <strong>{{ codes.counts.digit }}</strong> con dígito verificador mal · <strong>{{ codes.counts.length }}</strong> con longitud rara ·
            <strong>{{ codes.counts.missing }}</strong> sin código · <strong>{{ codes.counts.duplicate }}</strong> con código repetido ·
            <strong>{{ codes.counts.sameName }}</strong> con el mismo nombre y otro código ·
            {{ codes.counts.internal }} con clave propia o PLU (no se revisan).
          </p>
          <p v-if="!codes.problems.length" class="pf-ok" role="status">Sin problemas en lo que se puede revisar sin internet.</p>
          <ul v-else class="pf-list">
            <li v-for="p in codes.problems" :key="p.key" class="cat-row">
              <span class="body">
                <strong>{{ p.name }}<template v-if="p.presentation"> · {{ p.presentation }}</template></strong>
                <small>{{ p.code || "sin código" }} · {{ p.section }}<template v-if="p.sharedWith.length"> · mismo código que: {{ p.sharedWith.join(", ") }}</template><template v-if="p.sameNameAs?.length"> · mismo nombre que: {{ p.sameNameAs.join(", ") }}</template></small>
              </span>
              <span class="adm-pill bad" v-for="i in p.issues" :key="i">{{ ISSUE_LABEL[i] }}</span>
              <span class="acts">
                <button type="button" class="adm-btn sm" :disabled="suggestRunning" @click="runSuggest([p.key])">Buscar código</button>
                <button type="button" class="adm-btn sm" @click="editByKey(p.key)">Editar</button>
              </span>
            </li>
          </ul>

          <div v-if="fixKeys.length || proposalKeys.length" class="pf-fix">
            <div class="acts">
              <button v-if="!suggestRunning" type="button" class="adm-btn" :disabled="onlineRunning || !fixKeys.length" @click="runSuggest(fixKeys)">
                Buscar el código correcto de los {{ fixKeys.length }} con problema
              </button>
              <button v-else type="button" class="adm-btn" @click="stopSuggest = true">Detener</button>
              <span v-if="suggestTotal" class="pf-muted cat-progress">{{ suggestDone }} de {{ suggestTotal }} buscados</span>
            </div>
            <p v-if="suggestNote" class="adm-hint">{{ suggestNote }}</p>
            <template v-if="proposalKeys.length">
              <p class="adm-hint">
                Propuestas para <strong>{{ proposalKeys.length }}</strong> productos. Nada se cambia hasta que tú lo autorices: «Confirmado» es un código que existe en las bases y trae el
                mismo nombre; «Sin confirmar» solo tiene el dígito corregido; «Por nombre» salió de buscar el nombre y puede ser de otro país.
              </p>
              <div v-if="confirmedKeys.length" class="acts">
                <button type="button" class="adm-btn primary" :disabled="busy" @click="applyConfirmed">{{ confirmedKeys.length === 1 ? "Aplicar la corrección confirmada" : `Aplicar las ${confirmedKeys.length} correcciones confirmadas` }}</button>
              </div>
              <ul class="pf-list">
                <li v-for="k in proposalKeys" :key="k" class="cat-row cat-fix">
                  <span class="body">
                    <strong>{{ nameOf(k) }}</strong>
                    <small>Código actual: {{ codeOf(k) || "sin código" }}</small>
                    <small v-if="reasonOf(k)" class="cat-reason">{{ reasonOf(k) }}</small>
                    <span v-for="c in suggestions[k]" :key="c.code" class="cat-cand">
                      <span class="body">
                        <strong>{{ c.code }}</strong>
                        <small v-if="c.name">{{ [c.name, c.quantity].filter(Boolean).join(" · ") }} · {{ c.source }}<template v-if="c.mexico"> · México</template></small>
                        <small v-else>Dígito verificador corregido; no aparece en las bases.</small>
                      </span>
                      <span class="adm-pill" :class="CONFIDENCE[c.confidence].tone">{{ CONFIDENCE[c.confidence].label }}</span>
                      <button type="button" class="adm-btn sm" :disabled="busy" @click="useCode(k, c)">Usar este código</button>
                    </span>
                  </span>
                </li>
              </ul>
            </template>
          </div>

          <div class="acts">
            <button v-if="!onlineRunning" type="button" class="adm-btn primary" :disabled="!codes.onlineKeys.length" @click="runOnline">
              Comparar {{ codes.onlineKeys.length }} con internet
            </button>
            <button v-else type="button" class="adm-btn" @click="stopOnline = true">Detener</button>
            <span v-if="onlineTotal" class="pf-muted cat-progress">{{ onlineDone }} de {{ onlineTotal }} revisados</span>
          </div>
          <p v-if="onlineNote" class="adm-hint">{{ onlineNote }}</p>
          <template v-if="onlineDone">
            <p class="adm-hint">
              <strong>{{ onlineCount.same }}</strong> coinciden · <strong>{{ onlineCount.different }}</strong> con otro nombre ·
              <strong>{{ onlineCount.notfound }}</strong> no aparecen en las bases<template v-if="onlineCount.unavailable"> · {{ onlineCount.unavailable }} sin respuesta</template>.
            </p>
            <div v-if="onlineCount.sure" class="acts">
              <button type="button" class="adm-btn" :disabled="busy" @click="verifyMatching">Marcar como verificados los {{ onlineCount.sure }} que coinciden</button>
            </div>
            <ul v-if="onlineReview.length" class="pf-list">
              <li v-for="r in onlineReview" :key="r.key" class="cat-row">
                <span class="body">
                  <strong>{{ nameOf(r.key) }}</strong>
                  <small>{{ items.find((i) => i.key === r.key)?.code }}</small>
                  <small v-if="r.online">En internet ({{ r.online.source }}): {{ [r.online.name, r.online.quantity].filter(Boolean).join(" · ") }}</small>
                  <small v-else>No aparece en las bases públicas: eso no significa que esté mal.</small>
                </span>
                <span v-if="r.status === 'different'" class="adm-pill bad">Otro nombre</span>
                <span v-else-if="r.status === 'same'" class="adm-pill warn">Tamaño distinto</span>
                <span v-else class="adm-pill">No encontrado</span>
                <span class="acts">
                  <button v-if="r.status === 'different'" type="button" class="adm-btn sm" :disabled="suggestRunning" @click="runSuggest([r.key])">Buscar código</button>
                  <button type="button" class="adm-btn sm" @click="editByKey(r.key)">Editar</button>
                  <button type="button" class="adm-btn sm" :disabled="busy" @click="verifyOne(r.key)">Está bien</button>
                </span>
              </li>
            </ul>
          </template>
        </template>
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
        <div class="pf-recode">
          <div class="adm-card-head">
            <div>
              <h3>Usar los códigos de esta tienda en el maestro</h3>
              <p>
                Para comprobar los códigos del catálogo «{{ catalogLabel(catalog) }}» contra los de esta tienda (los de esta tienda se dan por buenos). Primero ves qué cambiaría; no se aplica nada hasta que
                lo confirmes.
              </p>
            </div>
            <button type="button" class="adm-btn" :disabled="recodeBusy" @click="previewRecode">{{ recodeBusy ? "Calculando…" : "Ver qué cambiaría" }}</button>
          </div>
          <p v-if="recodeError" class="pf-err" role="alert">{{ recodeError }}</p>
          <template v-if="recodePrev">
            <label class="cat-checks"><span><input v-model="recodeClear" type="checkbox" :disabled="recodeBusy" @change="previewRecode" /> Quitar el código a los productos del maestro que no están en esta tienda</span></label>
            <p class="adm-hint">
              La tienda tiene {{ recodePrev.counts.storeProducts }} productos con código. Del maestro:
              <strong>{{ recodePrev.counts.recode }}</strong> recibirían el código de la tienda ·
              <strong>{{ recodePrev.counts.same }}</strong> ya lo tienen igual ·
              <strong>{{ recodePrev.counts.clear }}</strong> quedarían sin código ·
              {{ recodePrev.counts.ambiguous + recodePrev.counts.conflict }} se omiten por duda (repetidos o código ya usado) ·
              {{ recodePrev.counts.kept }} con clave propia o PLU no se tocan.
            </p>
            <ul v-if="recodePrev.recode.length" class="pf-list">
              <li v-for="c in recodePrev.recode" :key="c.key" class="cat-row">
                <span class="body">
                  <strong>{{ c.name }}<template v-if="c.presentation"> · {{ c.presentation }}</template></strong>
                  <small>{{ c.from || "sin código" }} → <strong>{{ c.to }}</strong> · en la tienda: {{ c.storeName }}</small>
                </span>
              </li>
            </ul>
            <p v-if="recodePrev.counts.recode > recodePrev.recode.length" class="pf-muted">…y {{ recodePrev.counts.recode - recodePrev.recode.length }} más.</p>
            <details v-if="recodePrev.clear.length" class="cat-section">
              <summary><strong>Quedarían sin código</strong><span class="pf-chip">{{ recodePrev.counts.clear }}</span></summary>
              <ul class="pf-list">
                <li v-for="c in recodePrev.clear" :key="c.key" class="cat-row">
                  <span class="body"><strong>{{ c.name }}<template v-if="c.presentation"> · {{ c.presentation }}</template></strong><small>{{ c.from }}</small></span>
                </li>
              </ul>
              <p v-if="recodePrev.counts.clear > recodePrev.clear.length" class="pf-muted">Se muestran {{ recodePrev.clear.length }} de {{ recodePrev.counts.clear }}.</p>
            </details>
            <div class="acts">
              <button type="button" class="adm-btn primary" :disabled="recodeBusy || !(recodePrev.counts.recode + recodePrev.counts.clear)" @click="applyRecode">
                Aplicar estos cambios
              </button>
              <button type="button" class="adm-btn ghost" :disabled="recodeBusy" @click="recodePrev = null">Cancelar</button>
            </div>
          </template>
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
  codes.value = null;
  suggestions.value = {};
  registered.value = {};
  onlineResults.value = {};
  onlineDone.value = 0;
  onlineTotal.value = 0;
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

// ---------- Verificar códigos ----------
const ISSUE_LABEL = { digit: "Dígito verificador mal", length: "Longitud rara", missing: "Sin código", duplicate: "Código repetido", sameName: "Mismo producto, otro código" };
const showCodes = ref(false);
const onlyUnverified = ref(true);
const codes = ref(null);
const codesBusy = ref(false);
const codesError = ref("");
const onlineResults = ref({}); // key → resultado de la comparación
const onlineRunning = ref(false);
const stopOnline = ref(false);
const onlineDone = ref(0);
const onlineTotal = ref(0);
const onlineNote = ref("");

const nameOf = (key) => items.value.find((i) => i.key === key)?.name || key;
function editByKey(key) {
  const item = items.value.find((i) => i.key === key);
  if (item) openEdit(item);
}
const onlineList = computed(() => Object.entries(onlineResults.value).map(([key, r]) => ({ key, ...r })));
const onlineCount = computed(() => {
  const count = { same: 0, different: 0, notfound: 0, unavailable: 0, sure: 0 };
  for (const r of onlineList.value) {
    if (r.status in count) count[r.status] += 1;
    if (r.status === "same" && !r.sizeDiffers) count.sure += 1;
  }
  return count;
});
// Lo que conviene mirar: otro nombre, tamaño distinto o no encontrado (lo que coincide y está bien no estorba)
const onlineReview = computed(() => onlineList.value.filter((r) => r.status === "different" || r.status === "notfound" || (r.status === "same" && r.sizeDiffers)));

async function runCodes() {
  codesBusy.value = true;
  codesError.value = "";
  onlineResults.value = {};
  suggestions.value = {};
  registered.value = {};
  suggestNote.value = "";
  onlineDone.value = 0;
  onlineTotal.value = 0;
  onlineNote.value = "";
  try {
    codes.value = await apiService.platformCatalogCodes(catalog.value, onlyUnverified.value);
  } catch (e) {
    codesError.value = errText(e, "No pude revisar los códigos.");
  } finally {
    codesBusy.value = false;
  }
}
async function runOnline() {
  const keys = [...codes.value.onlineKeys];
  const size = codes.value.batch || 8;
  onlineRunning.value = true;
  stopOnline.value = false;
  onlineResults.value = {};
  onlineDone.value = 0;
  onlineTotal.value = keys.length;
  onlineNote.value = "";
  let silent = 0;
  try {
    for (let i = 0; i < keys.length && !stopOnline.value; i += size) {
      const { results } = await apiService.platformCatalogCodesOnline(catalog.value, keys.slice(i, i + size));
      const next = { ...onlineResults.value };
      for (const r of results) if (r.status !== "skipped") next[r.key] = r;
      onlineResults.value = next;
      onlineDone.value = Math.min(i + size, keys.length);
      silent = results.every((r) => r.status === "unavailable") ? silent + 1 : 0;
      if (silent >= 3) {
        onlineNote.value = "Las bases públicas no están respondiendo; se detuvo. Intenta de nuevo en un rato.";
        break;
      }
    }
    if (stopOnline.value) onlineNote.value = "Se detuvo; lo revisado hasta ahora se conserva.";
  } catch (e) {
    onlineNote.value = errText(e, "Se cortó la comparación con internet.");
  } finally {
    onlineRunning.value = false;
  }
}
// Propuestas de código correcto: el servidor las busca, la persona autoriza cada cambio
const CONFIDENCE = {
  confirmed: { label: "Confirmado", tone: "good" },
  ai_confirmed: { label: "IA + base pública", tone: "good" },
  ai_page: { label: "IA con página", tone: "warn" },
  check_digit: { label: "Sin confirmar", tone: "warn" },
  search: { label: "Por nombre", tone: "warn" },
};
const suggestions = ref({}); // key → candidatos
const suggestRunning = ref(false);
const stopSuggest = ref(false);
const suggestDone = ref(0);
const suggestTotal = ref(0);
const suggestNote = ref("");

const codeOf = (key) => items.value.find((i) => i.key === key)?.code || "";
const registered = ref({}); // key → a qué producto dicen las bases que pertenece hoy su código
/** Por qué se propone cambiar el código de un producto. */
function reasonOf(key) {
  const r = registered.value[key];
  if (r && !r.same) return `Ese código aparece en ${r.source} como «${[r.name, r.quantity].filter(Boolean).join(" · ")}», no como este producto.`;
  const problem = codes.value?.problems.find((p) => p.key === key);
  if (problem?.issues.includes("digit")) return "El dígito verificador no cuadra: es probable que el código esté mal escrito o inventado.";
  if (problem?.issues.includes("length")) return "La longitud no es la de un código de barras.";
  if (problem?.issues.includes("missing")) return "No tiene código.";
  return "";
}
// Con problema de código, o con otro nombre en las bases públicas
const fixKeys = computed(() => [
  ...new Set([
    ...(codes.value?.problems || []).filter((p) => p.issues.some((i) => i !== "duplicate" && i !== "sameName")).map((p) => p.key),
    ...onlineList.value.filter((r) => r.status === "different").map((r) => r.key),
  ]),
]);
const proposalKeys = computed(() => Object.keys(suggestions.value).filter((k) => suggestions.value[k]?.length));
const confirmedKeys = computed(() => proposalKeys.value.filter((k) => suggestions.value[k][0].confidence === "confirmed"));

async function runSuggest(keys) {
  const list = [...keys];
  suggestRunning.value = true;
  stopSuggest.value = false;
  suggestDone.value = 0;
  suggestTotal.value = list.length;
  suggestNote.value = "";
  let empty = 0;
  try {
    for (let i = 0; i < list.length && !stopSuggest.value; i += 4) {
      const res = await apiService.platformCatalogCodesSuggest(catalog.value, list.slice(i, i + 4));
      suggestions.value = { ...suggestions.value, ...res.suggestions };
      registered.value = { ...registered.value, ...res.registered };
      suggestDone.value = Math.min(i + 4, list.length);
      empty = Object.values(res.suggestions).every((c) => !c.length) ? empty + 1 : 0;
    }
    if (stopSuggest.value) suggestNote.value = "Se detuvo; lo encontrado hasta ahora se conserva.";
    else if (list.length && !proposalKeys.value.length) suggestNote.value = "No encontré códigos para proponer. Si el producto lo tienes en la mano, lo más seguro es escanearlo con la cámara y editar el código.";
    else if (empty >= 3) suggestNote.value = "Varios productos quedaron sin propuesta: las bases públicas no los tienen o no respondieron.";
  } catch (e) {
    suggestNote.value = errText(e, "Se cortó la búsqueda de códigos.");
  } finally {
    suggestRunning.value = false;
  }
}
// Todo en uno: revisión rápida, comparar con internet y buscar el código correcto de los que no coinciden
const allRunning = ref(false);
function stopAll() {
  stopOnline.value = true;
  stopSuggest.value = true;
  allRunning.value = false;
}
async function runAll() {
  allRunning.value = true;
  await runCodes();
  if (!codes.value || !allRunning.value) return void (allRunning.value = false);
  if (codes.value.onlineKeys.length) await runOnline();
  if (allRunning.value && !stopOnline.value && fixKeys.value.length) await runSuggest(fixKeys.value);
  allRunning.value = false;
}
function dropFixed(key) {
  const { [key]: _gone, ...rest } = suggestions.value;
  suggestions.value = rest;
  if (codes.value) codes.value = { ...codes.value, problems: codes.value.problems.filter((p) => p.key !== key) };
  onlineResults.value = Object.fromEntries(Object.entries(onlineResults.value).filter(([k]) => k !== key));
}
async function useCode(key, cand) {
  const named = (cand.name ? `\nSegún ${cand.source}: ${[cand.name, cand.quantity].filter(Boolean).join(" · ")}` : "") + (reasonOf(key) ? `\n\nMotivo: ${reasonOf(key)}` : "");
  if (!window.confirm(`¿Cambiar el código de «${nameOf(key)}»?\n\nAntes: ${codeOf(key) || "sin código"}\nAhora: ${cand.code}${named}`)) return;
  busy.value = true;
  try {
    await apiService.platformCatalogSave(catalog.value, { code: cand.code }, key);
    dropFixed(key);
    say(`Código de «${nameOf(key)}» cambiado a ${cand.code}.`);
    await loadItems();
  } catch (e) {
    error.value = errText(e, "No pude cambiar el código.");
  } finally {
    busy.value = false;
  }
}
async function applyConfirmed() {
  const keys = [...confirmedKeys.value];
  if (!window.confirm(`Se cambiará el código de ${keys.length} productos. Todos están confirmados: el código existe en las bases públicas y el nombre coincide con el tuyo.\n\n¿Continuar?`)) return;
  busy.value = true;
  let done = 0;
  try {
    for (const key of keys) {
      await apiService.platformCatalogSave(catalog.value, { code: suggestions.value[key][0].code }, key);
      dropFixed(key);
      done += 1;
    }
    say(`${done} códigos corregidos.`);
  } catch (e) {
    error.value = `${errText(e, "No pude cambiar un código.")} Se alcanzaron a cambiar ${done} de ${keys.length}.`;
  } finally {
    busy.value = false;
    await loadItems();
  }
}

async function markVerified(keys) {
  busy.value = true;
  try {
    for (const key of keys) await apiService.platformCatalogSave(catalog.value, { verified: true }, key);
    const gone = new Set(keys);
    onlineResults.value = Object.fromEntries(Object.entries(onlineResults.value).filter(([k]) => !gone.has(k)));
    say(`${keys.length} producto(s) marcados como verificados.`);
    await Promise.all([loadItems(), loadCatalogs()]);
  } catch (e) {
    error.value = errText(e, "No pude marcar los productos.");
  } finally {
    busy.value = false;
  }
}
const verifyOne = (key) => markVerified([key]);
const verifyMatching = () => markVerified(onlineList.value.filter((r) => r.status === "same" && !r.sizeDiffers).map((r) => r.key));

// ---------- Eliminar todo el catálogo ----------
async function clearCatalog() {
  const name = catalogLabel(catalog.value);
  const word = window.prompt(
    `Vas a ELIMINAR todo el catálogo «${name}» (${items.value.length} productos).\n\nAntes de borrar se descarga una copia en CSV. Las tiendas que ya lo cargaron no se ven afectadas y el servidor no lo vuelve a llenar solo.\n\nPara confirmar escribe ELIMINAR:`
  );
  if (word === null) return;
  if (String(word).trim().toUpperCase() !== "ELIMINAR") {
    error.value = "No se eliminó nada: no escribiste ELIMINAR.";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    exportCatalog(); // copia de respaldo antes de borrar
    const r = await apiService.platformCatalogClear(catalog.value, "ELIMINAR");
    say(`Se eliminó el catálogo «${name}» (${r.removed} productos). La copia se descargó como catalogo-${catalog.value}.csv.`);
    await Promise.all([loadItems(), loadCatalogs()]);
  } catch (e) {
    error.value = errText(e, "No pude eliminar el catálogo.");
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
// ---------- Usar los códigos de una tienda en el maestro ----------
const recodePrev = ref(null);
const recodeBusy = ref(false);
const recodeError = ref("");
const recodeClear = ref(true);
async function previewRecode() {
  recodeBusy.value = true;
  recodeError.value = "";
  try {
    recodePrev.value = await apiService.platformCatalogRecodePreview(catalog.value, storeId.value, recodeClear.value);
  } catch (e) {
    recodePrev.value = null;
    recodeError.value = errText(e, "No pude calcular el cambio.");
  } finally {
    recodeBusy.value = false;
  }
}
async function applyRecode() {
  const c = recodePrev.value.counts;
  const text = `Se cambiará el catálogo «${catalogLabel(catalog.value)}»:\n\n• ${c.recode} productos recibirán el código de ${store.value.businessName}\n• ${c.clear} productos quedarán SIN código de barras\n\nLas tiendas que ya cargaron el catálogo no se ven afectadas. ¿Continuar?`;
  if (!window.confirm(text)) return;
  recodeBusy.value = true;
  recodeError.value = "";
  try {
    const r = await apiService.platformCatalogRecodeApply(catalog.value, storeId.value, recodeClear.value);
    recodePrev.value = null;
    say(`Listo: ${r.recoded} códigos reemplazados y ${r.cleared} quitados${r.errors.length ? `, ${r.errors.length} con error` : ""}.`);
    await Promise.all([loadItems(), loadCatalogs()]);
  } catch (e) {
    recodeError.value = errText(e, "No pude aplicar el cambio.");
  } finally {
    recodeBusy.value = false;
  }
}

async function loadStore() {
  recodePrev.value = null;
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
.pf-fix { display: grid; gap: 0.6rem; padding: 0.8rem 0; border-top: 1px solid var(--timber-line); }
.cat-fix { align-items: flex-start; }
.cat-cand { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.6rem; margin-top: 0.3rem; border: 1px solid var(--timber-line); border-radius: 0.7rem; }
.cat-cand .body { flex: 1 1 auto; }
@media (max-width: 40rem) { .cat-cand { flex-wrap: wrap; } }
.pf-card-stack > .acts, .pf-fix > .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.pf-recode { display: grid; gap: 0.6rem; padding: 0.8rem 0; border-top: 1px solid var(--timber-line); }
.pf-recode > .acts { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.cat-reason { color: var(--timber-ink); }
.cat-progress { align-self: center; margin-left: 0.75rem; }
.pf-err-list { margin: 0.4rem 0 0; padding-left: 1.1rem; }
@media (max-width: 40rem) {
  .cat-row { flex-wrap: wrap; }
}
</style>
