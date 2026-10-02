<template>
  <Teleport to="body">
    <div class="mg-bg">
      <div class="mg" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <header class="mg-head">
          <span class="mg-badge" aria-hidden="true"><PosIcon name="spark" :size="22" /></span>
          <div class="mg-title">
            <h2 id="mg-title">Inventario Mágico</h2>
            <p>{{ stepLead }}</p>
          </div>
          <div
            v-if="quota && quota.limit != null"
            class="mg-quota"
            :class="{ low: Number(quota.remaining) <= Math.max(1, Math.round(quota.limit * 0.1)) }"
            :title="`Te quedan ${quota.remaining} de ${quota.limit} lecturas este mes`"
          >
            <span><strong>{{ quota.remaining }}</strong> de {{ quota.limit }}</span>
            <small>lecturas este mes</small>
            <i aria-hidden="true"><b :style="{ width: `${quotaPct}%` }"></b></i>
          </div>
          <button type="button" class="mg-x" aria-label="Cerrar" :disabled="busy" @click="close">
            <PosIcon name="x" :size="20" />
          </button>
        </header>

        <ol class="mg-steps" aria-label="Pasos">
          <li v-for="(s, i) in STEPS" :key="s" :class="{ on: step === i + 1, done: step > i + 1 }">
            <span>
              <PosIcon v-if="step > i + 1" name="check" :size="15" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            {{ s }}
          </li>
        </ol>

        <div ref="bodyEl" class="mg-body" :class="{ reading: busy && step === 1 }">
          <p v-if="restored && step === 2" class="mg-msg ok" role="status">
            <PosIcon name="history" :size="17" />
            <span>Recuperamos tu última lectura sin guardar; no se volvió a cobrar el intento.</span>
          </p>
          <p v-if="error" class="mg-msg err" role="alert"><PosIcon name="alert" :size="17" /> <span>{{ error }}</span></p>
          <p v-if="notice && step !== 3" class="mg-msg ok" role="status"><PosIcon name="check" :size="17" /> <span>{{ notice }}</span></p>

          <!-- ========== Paso 1: la nota ========== -->
          <template v-if="step === 1">
            <div class="mg-inputs">
              <label
                class="mg-photo"
                :class="{ has: photoUrl && !photoBusy, busy: photoBusy, drag: dragging }"
                @dragover.prevent="dragging = true"
                @dragleave="dragging = false"
                @drop.prevent="onDrop"
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  capture="environment"
                  class="sr-only"
                  :disabled="busy || photoBusy"
                  @change="onPhoto"
                />
                <template v-if="photoUrl && !photoBusy">
                  <img :src="photoUrl" alt="Foto de la nota" />
                  <span class="mg-chip">Cambiar foto</span>
                </template>
                <template v-else>
                  <span class="mg-photo-ico"><PosIcon :name="photoBusy ? 'clock' : 'image'" :size="30" /></span>
                  <strong>{{ photoBusy ? 'Preparando la foto…' : 'Toma foto a la nota' }}</strong>
                  <small>
                    {{ photoBusy ? 'La hacemos más ligera para leerla rápido.' : 'O arrastra la imagen aquí. Que se lean bien los renglones.' }}
                  </small>
                </template>
              </label>
              <div class="mg-or" aria-hidden="true"><span>o</span></div>
              <label class="mg-text">
                <span>Pega o escribe la lista, como la tengas</span>
                <textarea
                  v-model="text"
                  rows="7"
                  :disabled="busy"
                  placeholder="24 cocas de 600 a 14&#10;8 sabritas 45 g&#10;1 caja de jabón zote (25 pzas) 420"
                />
              </label>
            </div>
            <button v-if="photoUrl && !photoBusy" type="button" class="mg-link" @click="clearPhoto">Quitar foto</button>

            <ul class="mg-how">
              <li>
                <span class="mg-how-ico"><PosIcon name="truck" :size="18" /></span>
                <span><b>Registra la compra</b> con proveedor, lote y caducidad; si la nota no trae caducidad, usa la fecha.</span>
              </li>
              <li>
                <span class="mg-how-ico"><PosIcon name="tag" :size="18" /></span>
                <span><b>Revisa tus precios:</b> avisa si subió el costo y te sugiere el precio al público.</span>
              </li>
              <li>
                <span class="mg-how-ico"><PosIcon name="check" :size="18" /></span>
                <span><b>Tú decides:</b> nada se guarda hasta que lo confirmes. Cada lectura usa 1 intento; si no encuentra nada, no cuenta.</span>
              </li>
            </ul>
            <p v-if="blocked" class="mg-msg err">
              <PosIcon name="alert" :size="17" />
              <span>Ya usaste las {{ quota.limit }} lecturas de este mes. Se reinician el día 1; mientras, agrégalo a mano.</span>
            </p>

            <div v-if="busy" class="mg-reading" role="status" aria-live="polite">
              <span class="mg-sparks" aria-hidden="true"><i></i><i></i><i></i></span>
              <strong>Leyendo la nota…</strong>
              <small>Con fotos puede tardar hasta un minuto. No cierres esta ventana.</small>
            </div>
          </template>

          <!-- ========== Paso 2: revisar ========== -->
          <template v-else-if="step === 2">
            <div class="mg-summary">
              <img v-if="photoUrl" :src="photoUrl" alt="" class="mg-mini" />
              <div class="mg-sum-chips">
                <span class="mg-pill">{{ picks.length }} {{ picks.length === 1 ? 'ya lo tienes' : 'ya los tienes' }}</span>
                <span class="mg-pill info">{{ news.length }} {{ news.length === 1 ? 'nuevo' : 'nuevos' }}</span>
                <span v-if="costAlerts.length" class="mg-pill warn">
                  {{ costAlerts.length }} {{ costAlerts.length === 1 ? 'subió de costo' : 'subieron de costo' }}
                </span>
              </div>
              <div v-if="purchaseTotal > 0" class="mg-sum-total">
                <small>Compra</small>
                <strong>{{ money(purchaseTotal) }}</strong>
              </div>
            </div>

            <section class="mg-card">
              <div class="mg-card-head">
                <h3><PosIcon name="truck" :size="18" /> La compra</h3>
                <p>Si la nota no trae caducidad, usamos la de aquí. Bórrala si no manejas lotes.</p>
              </div>
              <div class="mg-grid">
                <label class="mg-field wide">
                  <span>Proveedor</span>
                  <select v-model="purchase.supplierId" class="mg-inp" @change="onSupplierPick">
                    <option value="">De la nota / nuevo</option>
                    <option v-for="s in supplierOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </label>
                <label class="mg-field wide">
                  <span>Nombre del proveedor</span>
                  <input v-model="purchase.name" class="mg-inp" list="magic-suppliers" placeholder="Como viene en la nota" maxlength="80" />
                  <datalist id="magic-suppliers">
                    <option v-for="s in supplierOptions" :key="s.id" :value="s.name" />
                  </datalist>
                </label>
                <label class="mg-field">
                  <span>Fecha de la nota</span>
                  <input v-model="purchase.date" class="mg-inp" type="date" />
                </label>
                <label class="mg-field">
                  <span>Caducidad</span>
                  <input v-model="purchase.expiresAt" class="mg-inp" type="date" />
                </label>
                <label class="mg-field wide">
                  <span>Lote <em>(si no viene en el renglón)</em></span>
                  <input v-model="purchase.lot" class="mg-inp" maxlength="60" placeholder="Se arma solo si falta" />
                </label>
              </div>
              <details class="mg-more">
                <summary>Contacto del proveedor</summary>
                <div class="mg-grid">
                  <label class="mg-field">
                    <span>Contacto</span>
                    <input v-model="purchase.contact" class="mg-inp" maxlength="80" />
                  </label>
                  <label class="mg-field">
                    <span>WhatsApp</span>
                    <input v-model="purchase.whatsapp" class="mg-inp" inputmode="tel" maxlength="15" />
                  </label>
                </div>
              </details>
            </section>

            <p v-if="costAlerts.length" class="mg-msg warn">
              <PosIcon name="alert" :size="17" />
              <span>
                {{ costAlerts.length === 1 ? 'Un producto subió de costo' : `${costAlerts.length} productos subieron de costo` }}.
                Revisa el margen y el precio sugerido antes de guardar.
              </span>
            </p>
            <p v-if="!picks.length && !news.length" class="mg-hint">Esos precios ya estaban igual en tu catálogo.</p>

            <section v-if="picks.length" class="mg-card">
              <div class="mg-card-head row">
                <div>
                  <h3><PosIcon name="box" :size="18" /> Ya los tienes <em>{{ picksChecked }} de {{ picks.length }}</em></h3>
                  <p>Marca lo que sí quieres guardar. En packs, «Entran» son las piezas que suman al inventario.</p>
                </div>
                <button type="button" class="mg-link" @click="togglePicks(picksChecked < picks.length)">
                  {{ picksChecked < picks.length ? 'Marcar todos' : 'Ninguno' }}
                </button>
              </div>
              <ul class="mg-rows">
                <li v-for="(row, i) in picks" :key="row.key" :class="{ off: !row.checked, alert: row.costUp }">
                  <div class="mg-row-top">
                    <label class="mg-check">
                      <input v-model="row.checked" type="checkbox" />
                      <span class="mg-row-name">
                        <strong>{{ row.name }}</strong>
                        <small v-if="row.from">Leí «{{ row.from }}»</small>
                      </span>
                    </label>
                    <span class="mg-tags">
                      <span v-if="row.isPack || row.packSize > 1" class="mg-pill">Pack · {{ row.packs || 1 }} × {{ row.packSize || '?' }} pzas</span>
                      <span v-if="row.costUp" class="mg-pill warn">Costo +{{ row.costChangePct || '?' }}%</span>
                    </span>
                  </div>
                  <label v-if="row.options" class="mg-field mg-choose">
                    <span>¿Cuál de tus productos es?</span>
                    <select v-model="row.id" class="mg-inp" @change="onChoose(i)">
                      <option v-for="opt in row.options" :key="opt.id" :value="opt.id">{{ opt.name }} (hoy {{ money(opt.oldPrice) }})</option>
                    </select>
                  </label>
                  <div class="mg-fields">
                    <label class="mg-field"><span>Costo/pza</span><input v-model.number="row.cost" class="mg-inp num" type="number" min="0" step="0.01" inputmode="decimal" /></label>
                    <label class="mg-field"><span>Venta</span><input v-model.number="row.price" class="mg-inp num" type="number" min="0" step="0.01" inputmode="decimal" /></label>
                    <label class="mg-field"><span>Entran</span><input v-model.number="row.stockIn" class="mg-inp num" type="number" min="0" step="1" inputmode="numeric" /></label>
                    <label class="mg-field"><span>Lote</span><input v-model="row.lot" class="mg-inp" maxlength="60" /></label>
                    <label class="mg-field"><span>Caduca</span><input v-model="row.expiresAt" class="mg-inp" type="date" /></label>
                  </div>
                  <p v-if="row.oldPrice != null" class="mg-was">
                    Antes: venta {{ money(row.oldPrice) }}<template v-if="row.oldCost"> · costo {{ money(row.oldCost) }}</template><template v-if="row.oldStock != null"> · hay {{ row.oldStock }}</template>
                  </p>
                  <p v-if="row.checked && !(Number(row.price) > 0)" class="mg-warn">Falta el precio de venta.</p>
                  <p v-else-if="row.checked && Number(row.cost) > 0 && Number(row.price) < Number(row.cost)" class="mg-warn">Lo vendes por debajo del costo.</p>
                  <p v-if="row.costUp" class="mg-suggest">
                    <span>
                      El costo subió{{ row.costChangePct ? ` ${row.costChangePct}%` : '' }}.
                      <template v-if="row.newMargin != null"> Tu margen bajó a {{ row.newMargin }}%.</template>
                    </span>
                    <button
                      v-if="row.suggestedPrice && Number(row.price) !== row.suggestedPrice"
                      type="button"
                      class="mg-use"
                      @click.stop="row.price = row.suggestedPrice"
                    >
                      Usar {{ money(row.suggestedPrice) }}
                    </button>
                    <span v-else-if="row.suggestedPrice" class="mg-ok"><PosIcon name="check" :size="15" /> Precio sugerido</span>
                  </p>
                </li>
              </ul>
            </section>

            <section class="mg-card">
              <div class="mg-card-head row">
                <div>
                  <h3><PosIcon name="plus" :size="18" /> Nuevos <em v-if="news.length">{{ newsReady }} listos</em></h3>
                  <p>Se dan de alta en tu catálogo. Si la lectura no vio algo, agrégalo aquí.</p>
                </div>
              </div>
              <ul v-if="news.length" class="mg-rows">
                <li v-for="row in news" :key="row.key" :class="{ off: !row.checked }">
                  <div class="mg-row-top">
                    <label class="mg-check">
                      <input v-model="row.checked" type="checkbox" />
                      <span class="mg-row-name"><small>{{ row.manual ? 'Lo escribes tú' : 'Leído de la nota' }}</small></span>
                    </label>
                    <span v-if="row.price > 0 && row.cost > 0" class="mg-pill" :class="row.price < row.cost ? 'bad' : 'good'">
                      Ganas {{ money(row.price - row.cost) }} ({{ Math.round(((row.price - row.cost) / row.price) * 100) }}%)
                    </span>
                  </div>
                  <label class="mg-field">
                    <span>Nombre</span>
                    <input v-model="row.name" class="mg-inp" placeholder="Coca-Cola 600 ml" />
                  </label>
                  <p v-if="row.isPack || row.packSize > 1" class="mg-pack">
                    Pack · {{ row.packs || 1 }} ×
                    <input v-model.number="row.packSize" class="mg-inp num tiny" type="number" min="0" step="1" aria-label="Piezas por pack" @input="onPackSize(row)" />
                    <span>pzas = <strong>{{ row.stockIn || 0 }}</strong> al inventario</span>
                  </p>
                  <div class="mg-fields">
                    <label class="mg-field"><span>Costo/pza</span><input v-model.number="row.cost" class="mg-inp num" type="number" min="0" step="0.01" inputmode="decimal" /></label>
                    <label class="mg-field"><span>Venta</span><input v-model.number="row.price" class="mg-inp num" type="number" min="0" step="0.01" inputmode="decimal" /></label>
                    <label class="mg-field"><span>Entran</span><input v-model.number="row.stockIn" class="mg-inp num" type="number" min="0" step="1" inputmode="numeric" /></label>
                    <label class="mg-field"><span>Lote</span><input v-model="row.lot" class="mg-inp" maxlength="60" /></label>
                    <label class="mg-field"><span>Caduca</span><input v-model="row.expiresAt" class="mg-inp" type="date" /></label>
                    <label class="mg-field">
                      <span>Categoría</span>
                      <select v-model="row.menuId" class="mg-inp">
                        <option v-for="m in catalogMenus" :key="m.id" :value="m.id">{{ m.name }}</option>
                      </select>
                    </label>
                  </div>
                  <p v-if="row.isPack && !(row.packSize > 0)" class="mg-warn">Es un pack: escribe cuántas piezas trae para sumar el inventario.</p>
                  <p v-else-if="row.checked && String(row.name || '').trim() && !(Number(row.price) > 0)" class="mg-warn">Escribe a cuánto lo vas a vender.</p>
                  <p v-else-if="row.price > 0 && row.cost > 0 && row.price < row.cost" class="mg-warn">Lo vendes por debajo del costo.</p>
                </li>
              </ul>
              <button type="button" class="mg-add" @click="addExtra">
                <PosIcon name="add" :size="18" /> Agregar uno que no leyó
              </button>
            </section>
          </template>

          <!-- ========== Paso 3: listo ========== -->
          <div v-else class="mg-done" role="status">
            <span class="mg-done-ico"><PosIcon name="check" :size="40" /></span>
            <h3>¡Listo!</h3>
            <p>{{ done }}</p>
            <p class="mg-hint">Precios y existencias ya están en tu catálogo. Si entraron piezas, la compra quedó en Inventario → Compras.</p>
          </div>
        </div>

        <footer class="mg-foot">
          <template v-if="step === 1">
            <button type="button" class="mg-btn" :disabled="busy" @click="emit('manual')">
              <PosIcon name="edit" :size="18" /> <span class="mg-long">Agregar a mano</span><span class="mg-short">A mano</span>
            </button>
            <div class="mg-foot-main">
              <small v-if="!canReview && !busy && !photoBusy">Toma una foto o pega la lista</small>
              <button type="button" class="mg-btn primary" :disabled="busy || photoBusy || !canReview || blocked" @click="review">
                <PosIcon name="spark" :size="18" /> {{ busy ? 'Leyendo…' : 'Leer la nota' }}
              </button>
            </div>
          </template>
          <template v-else-if="step === 2">
            <button type="button" class="mg-btn" :disabled="busy" @click="resetReview">
              <PosIcon name="undo" :size="18" /> <span class="mg-long">Leer otra nota</span><span class="mg-short">Otra</span>
            </button>
            <div class="mg-foot-main">
              <small v-if="saveCount && purchaseTotal > 0">Compra por {{ money(purchaseTotal) }}</small>
              <small v-else-if="!saveCount">Marca al menos un producto</small>
              <button type="button" class="mg-btn primary" :disabled="busy || !saveCount" @click="save">
                <PosIcon name="check" :size="18" /> {{ busy ? 'Guardando…' : saveLabel }}
              </button>
            </div>
          </template>
          <template v-else>
            <button type="button" class="mg-btn" @click="startOver">
              <PosIcon name="spark" :size="18" /> Leer otra nota
            </button>
            <button type="button" class="mg-btn primary" @click="close">Cerrar</button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { apiService } from "../apiService";
import { authStore } from "../authStore";
import PosIcon from "./PosIcon.js";

const props = defineProps({
  menus: { type: Array, default: () => [] },
  defaultMenuId: { type: String, default: "" },
  suppliers: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "applied", "manual"]);

const text = ref("");
const photoName = ref("");
const photoUrl = ref("");
const photoBusy = ref(false);
const imageBase64 = ref("");
const mimeType = ref("");
const photoObjectUrl = ref("");
const quota = ref(null);
const error = ref("");
const notice = ref("");
const busy = ref(false);
const result = ref(null);
const picks = ref([]);
const news = ref([]);
const supplierOptions = ref([]);
const menuOptions = ref([]);
const purchase = ref(emptyPurchase());
const restored = ref(false);
/** Mensaje del guardado: con él se muestra el paso «Listo» */
const done = ref("");
const dragging = ref(false);
const bodyEl = ref(null);

const STEPS = ["Nota", "Revisar", "Listo"];
const step = computed(() => (done.value ? 3 : result.value ? 2 : 1));
const stepLead = computed(
  () =>
    [
      "Toma foto a la nota del proveedor o pega la lista. Registramos la compra y revisamos tus precios.",
      "Revisa lo que leímos. Nada se guarda hasta que lo confirmes.",
      "La compra y los precios ya quedaron en tu catálogo.",
    ][step.value - 1]
);
watch(step, () => nextTick(() => bodyEl.value?.scrollTo?.({ top: 0 })));

// Borrador: la lectura ya gastó un uso; si se cierra o se recarga la página no se pierde
const DRAFT_KEY = `timber_magic_draft_${authStore.tenantId || "local"}`;
function saveDraft() {
  if (!result.value) return;
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ at: Date.now(), result: result.value, picks: picks.value, news: news.value, purchase: purchase.value })
    );
  } catch {
    /* sin espacio: seguimos sin borrador */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    // Solo borradores de los últimos 3 días
    if (!d || !d.result || Date.now() - Number(d.at || 0) > 3 * 864e5) return false;
    result.value = d.result;
    picks.value = Array.isArray(d.picks) ? d.picks : [];
    news.value = Array.isArray(d.news) ? d.news : [];
    purchase.value = { ...emptyPurchase(), ...(d.purchase || {}) };
    return true;
  } catch {
    return false;
  }
}
watch([picks, news, purchase], saveDraft, { deep: true });

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyPurchase() {
  const today = todayYmd();
  return {
    supplierId: "",
    name: "",
    contact: "",
    whatsapp: "",
    date: today,
    expiresAt: today,
    lot: "",
    notes: "",
  };
}

const catalogMenus = computed(() =>
  props.menus?.length ? props.menus : menuOptions.value
);

const blocked = computed(() => {
  if (!quota.value || result.value || quota.value.limit == null) return false;
  return Number(quota.value.remaining) <= 0;
});

const canReview = computed(() =>
  Boolean(text.value.trim() || imageBase64.value)
);

function readyNew(row) {
  return row.checked && row.menuId && String(row.name || "").trim() && Number(row.price) > 0;
}

const saveCount = computed(() => {
  const u = picks.value.filter((row) => row.checked && row.id).length;
  const c = news.value.filter(readyNew).length;
  return u + c;
});

const costAlerts = computed(() => picks.value.filter((row) => row.costUp));
const picksChecked = computed(() => picks.value.filter((row) => row.checked).length);
const newsReady = computed(() => news.value.filter(readyNew).length);
const quotaPct = computed(() => {
  const q = quota.value;
  if (!q || !q.limit) return 0;
  return Math.max(0, Math.min(100, (Number(q.remaining) / Number(q.limit)) * 100));
});
// Lo que se va a registrar como compra: costo × piezas que entran
const purchaseTotal = computed(() => {
  const line = (row) => (Number(row.cost) || 0) * Math.max(0, Math.floor(Number(row.stockIn) || 0));
  return (
    picks.value.filter((row) => row.checked && row.id).reduce((t, row) => t + line(row), 0) +
    news.value.filter(readyNew).reduce((t, row) => t + line(row), 0)
  );
});

const saveLabel = computed(() => {
  const u = picks.value.filter((row) => row.checked && row.id).length;
  const c = news.value.filter(readyNew).length;
  const parts = [];
  if (u) parts.push(`${u} ${u === 1 ? 'cambio' : 'cambios'}`);
  if (c) parts.push(`${c} ${c === 1 ? 'nuevo' : 'nuevos'}`);
  if (!parts.length) return 'Guardar';
  return `Guardar ${parts.join(' y ')}`;
});

function money(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
}

function errText(e, fallback) {
  const data = e?.response?.data;
  if (typeof data === "string" && data) return data;
  if (data?.message) return data.message;
  return fallback;
}

function defaultMenu() {
  return props.defaultMenuId || catalogMenus.value[0]?.id || "";
}

async function ensureMenus() {
  if (catalogMenus.value.length) return catalogMenus.value;
  try {
    const list = await apiService.getAllMenus();
    menuOptions.value = Array.isArray(list) ? list : [];
  } catch {
    menuOptions.value = [];
  }
  return catalogMenus.value;
}

async function loadQuota() {
  try {
    quota.value = await apiService.aiQuota();
  } catch (e) {
    error.value = errText(e, "No pude ver cuántos usos te quedan.");
  }
}

function releasePhotoUrl() {
  if (photoObjectUrl.value) {
    URL.revokeObjectURL(photoObjectUrl.value);
    photoObjectUrl.value = "";
  }
}

function clearPhoto() {
  releasePhotoUrl();
  photoName.value = "";
  photoUrl.value = "";
  imageBase64.value = "";
  mimeType.value = "";
  photoBusy.value = false;
}

function yieldUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No pude leer esa foto."));
    reader.onload = () => {
      const url = String(reader.result || "");
      resolve(url.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.readAsDataURL(blob);
  });
}

/** Achica la foto en el celular sin congelar la pantalla. */
async function compressPhoto(file) {
  const maxSide = 960;
  const quality = 0.62;

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      await yieldUi();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("No pude preparar la foto.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      await yieldUi();
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("No pude preparar la foto."))),
          "image/jpeg",
          quality
        );
      });
      const previewUrl = URL.createObjectURL(blob);
      const base64 = await blobToBase64(blob);
      return { url: previewUrl, base64, mimeType: "image/jpeg", objectUrl: previewUrl };
    } finally {
      bitmap.close();
    }
  }

  // Fallback viejo
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No pude leer esa foto."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  await yieldUi();
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Esa foto no se pudo abrir."));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No pude preparar la foto.");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No pude preparar la foto."))),
      "image/jpeg",
      quality
    );
  });
  const previewUrl = URL.createObjectURL(blob);
  const base64 = await blobToBase64(blob);
  return { url: previewUrl, base64, mimeType: "image/jpeg", objectUrl: previewUrl };
}

async function onPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  await takePhoto(file);
}

function onDrop(event) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file && /^image\//.test(file.type)) takePhoto(file);
  else if (file) error.value = "Eso no es una imagen. Arrastra la foto de la nota.";
}

async function takePhoto(file) {
  if (!file || busy.value) return;
  if (file.size > 12_000_000) {
    error.value = "La foto es muy pesada. Toma otra más sencilla.";
    return;
  }
  error.value = "";
  notice.value = "";
  photoBusy.value = true;
  releasePhotoUrl();
  photoUrl.value = "";
  imageBase64.value = "";
  mimeType.value = "";
  photoName.value = file.name || "Foto";
  try {
    await yieldUi();
    const packed = await compressPhoto(file);
    photoObjectUrl.value = packed.objectUrl || "";
    photoUrl.value = packed.url;
    mimeType.value = packed.mimeType;
    imageBase64.value = packed.base64;
    notice.value = "Foto lista. Ya puedes revisar la lista.";
  } catch (e) {
    clearPhoto();
    error.value = e?.message || "No pude usar esa foto.";
  } finally {
    photoBusy.value = false;
  }
}

function fillPurchase(data) {
  const s = data?.supplier || {};
  const date = String(s.date || "").slice(0, 10) || todayYmd();
  const name = String(s.name || "").trim();
  const listed = supplierOptions.value.length ? supplierOptions.value : Array.isArray(props.suppliers) ? props.suppliers : [];
  const match =
    (s.id && listed.find((item) => item.id === s.id)) ||
    listed.find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
  purchase.value = {
    supplierId: match?.id || s.id || "",
    name: name || match?.name || "",
    contact: String(s.contact || match?.contact || "").trim(),
    whatsapp: String(s.whatsapp || match?.whatsapp || "").replace(/\D/g, "").slice(0, 15),
    date,
    expiresAt: String(s.expiresAt || "").slice(0, 10) || date,
    lot: String(s.lot || "").trim(),
    notes: "",
  };
}

function onSupplierPick() {
  const found = supplierOptions.value.find((item) => item.id === purchase.value.supplierId);
  if (!found) return;
  purchase.value.name = found.name || purchase.value.name;
  if (!purchase.value.contact) purchase.value.contact = found.contact || "";
  if (!purchase.value.whatsapp) purchase.value.whatsapp = found.whatsapp || "";
}

function fillPicks(data) {
  const rows = [];
  for (const row of data.matches || []) {
    rows.push({
      key: `m-${row.id}`,
      id: row.id,
      name: row.name,
      oldPrice: row.oldPrice,
      oldCost: row.oldCost,
      oldStock: row.oldStock,
      price: row.price,
      cost: row.cost ?? 0,
      stockIn: Number(row.stockIn) || 0,
      packSize: Number(row.packSize) || 0,
      packs: Number(row.packs) || 1,
      isPack: Boolean(row.isPack),
      lot: String(row.lot || "").trim(),
      expiresAt: String(row.expiresAt || "").slice(0, 10),
      from: row.from,
      checked: true,
      options: null,
      costUp: Boolean(row.costChanged && row.costDelta > 0),
      costChangePct: Number(row.costChangePct) || 0,
      newMargin: row.newMargin,
      suggestedPrice: Number(row.suggestedPrice) || 0,
    });
  }
  for (const row of data.choose || []) {
    const first = row.options?.[0];
    if (!first) continue;
    rows.push({
      key: `c-${row.from}-${first.id}`,
      id: first.id,
      name: first.name,
      oldPrice: first.oldPrice,
      oldCost: first.oldCost,
      oldStock: first.oldStock,
      price: row.price,
      cost: row.cost ?? 0,
      stockIn: Number(row.stockIn) || 0,
      packSize: Number(row.packSize) || 0,
      packs: Number(row.packs) || 1,
      isPack: Boolean(row.isPack),
      lot: String(row.lot || "").trim(),
      expiresAt: String(row.expiresAt || "").slice(0, 10),
      from: row.from,
      checked: false,
      options: row.options,
      costUp: Boolean(row.costChanged && row.costDelta > 0),
      costChangePct: Number(row.costChangePct) || 0,
      newMargin: row.newMargin,
      suggestedPrice: Number(row.suggestedPrice) || 0,
    });
  }
  picks.value = rows;

  news.value = (data.unknown || []).map((row, i) => {
    if (typeof row === "string") {
      return {
        key: `n-${i}-${row}`,
        name: row,
        cost: 0,
        price: 0,
        barcode: "",
        stockIn: 0,
        packSize: 0,
        packs: 1,
        isPack: /pack|paq|caja/i.test(row),
        lot: "",
        expiresAt: "",
        menuId: defaultMenu(),
        checked: true,
      };
    }
    return {
      key: `n-${i}-${row.name}`,
      name: row.name,
      cost: Number(row.cost) || 0,
      price: Number(row.price) || 0,
      barcode: row.barcode || "",
      stockIn: Number(row.stockIn) || 0,
      packSize: Number(row.packSize) || 0,
      packs: Number(row.packs) || 1,
      isPack: Boolean(row.isPack),
      lot: String(row.lot || "").trim(),
      expiresAt: String(row.expiresAt || "").slice(0, 10),
      menuId: defaultMenu(),
      checked: true,
    };
  });
}

function addExtra() {
  news.value.push({
    key: `extra-${Date.now()}`,
    name: "",
    cost: 0,
    price: 0,
    barcode: "",
    stockIn: 0,
    packSize: 0,
    packs: 1,
    isPack: false,
    lot: "",
    expiresAt: "",
    manual: true,
    menuId: defaultMenu(),
    checked: true,
  });
}

function onPackSize(row) {
  const packs = Math.max(1, Math.floor(Number(row.packs) || 1));
  const size = Math.max(0, Math.floor(Number(row.packSize) || 0));
  row.stockIn = size > 0 ? packs * size : 0;
}

function onChoose(index) {
  const row = picks.value[index];
  const opt = row.options?.find((item) => item.id === row.id);
  if (!opt) return;
  row.name = opt.name;
  row.oldPrice = opt.oldPrice;
  row.oldCost = opt.oldCost;
  row.oldStock = opt.oldStock;
}

function togglePicks(on) {
  picks.value.forEach((row) => {
    row.checked = on;
  });
}

function toggleNews(on) {
  news.value.forEach((row) => {
    row.checked = on;
  });
}

function resetReview() {
  if (result.value && saveCount.value && !window.confirm("¿Descartar esta lectura? Ya se usó 1 intento.")) return;
  clearDraft();
  restored.value = false;
  result.value = null;
  picks.value = [];
  news.value = [];
  purchase.value = emptyPurchase();
  notice.value = "";
  error.value = "";
}

async function review() {
  error.value = "";
  notice.value = "";
  if (!canReview.value) {
    error.value = "Pega la lista o sube una foto.";
    return;
  }
  if (blocked.value) {
    error.value = `Ya usaste las ${quota.value.limit} actualizaciones de este mes. Se reinician el día 1.`;
    return;
  }
  if (!catalogMenus.value.length) {
    await ensureMenus();
  }
  if (!catalogMenus.value.length) {
    error.value = "Primero crea una categoría en el catálogo.";
    return;
  }
  busy.value = true;
  try {
    const data = await apiService.aiPreview({
      text: text.value,
      imageBase64: imageBase64.value || undefined,
      mimeType: mimeType.value || undefined,
    });
    if (data.quota) quota.value = data.quota;
    if (data.message) notice.value = data.message;
    if (data.charged) {
      result.value = data;
      // La lectura ya se cobró: si algo falla al acomodarla, se queda lo que sí se pudo
      try {
        fillPurchase(data);
      } catch {
        purchase.value = emptyPurchase();
      }
      try {
        fillPicks(data);
      } catch {
        notice.value = "Leí la nota pero no pude acomodar todo; revisa y agrega lo que falte.";
      }
      saveDraft();
    }
  } catch (e) {
    if (e?.response?.data?.quota) quota.value = e.response.data.quota;
    if (e?.code === "ECONNABORTED" || /timeout/i.test(String(e?.message || ""))) {
      error.value = "Tardó demasiado. Toma la foto más cerca o pega la lista como texto.";
    } else {
      error.value = errText(e, "No pude leer la lista.");
    }
  } finally {
    busy.value = false;
  }
}

function started(row) {
  return (
    String(row.name || "").trim() ||
    Number(row.cost) > 0 ||
    Number(row.price) > 0 ||
    Number(row.stockIn) > 0
  );
}

function activeNew(row) {
  if (!row.checked) return false;
  if (row.manual && !started(row)) return false;
  return true;
}

async function save() {
  error.value = "";
  const missingName = news.value.some(
    (row) => activeNew(row) && !String(row.name || "").trim()
  );
  if (missingName) {
    error.value = "Escribe el nombre de cada producto que vas a agregar.";
    return;
  }
  const missingSell = news.value.some(
    (row) => activeNew(row) && !(Number(row.price) > 0)
  );
  if (missingSell) {
    error.value = "En los productos nuevos, escribe a cuánto los vas a vender.";
    return;
  }
  const noPrice = picks.value.some((row) => row.checked && row.id && !(Number(row.price) > 0));
  if (noPrice) {
    error.value = "Hay productos marcados sin precio de venta. Escríbelo o desmárcalos.";
    return;
  }
  const missingPack = news.value.some(
    (row) => activeNew(row) && row.isPack && !(Number(row.stockIn) > 0)
  );
  if (missingPack) {
    error.value = "En los packs, indica cuántas piezas trae cada uno para sumar el inventario.";
    return;
  }

  busy.value = true;
  try {
    const lineLot = (row) => String(row.lot || purchase.value.lot || "").trim();
    const lineExpiry = (row) =>
      String(row.expiresAt || "").slice(0, 10) || String(purchase.value.expiresAt || "").slice(0, 10);
    const updates = picks.value
      .filter((row) => row.checked && row.id)
      .map((row) => ({
        id: row.id,
        price: Number(row.price),
        cost: Number(row.cost) || 0,
        stockIn: Math.max(0, Math.floor(Number(row.stockIn) || 0)),
        lot: lineLot(row),
        expiresAt: lineExpiry(row),
      }));
    const creates = news.value
      .filter(readyNew)
      .map((row) => ({
        name: String(row.name).trim(),
        price: Number(row.price),
        cost: Number(row.cost) || 0,
        barcode: row.barcode || "",
        menuId: row.menuId,
        stockIn: Math.max(0, Math.floor(Number(row.stockIn) || 0)),
        lot: lineLot(row),
        expiresAt: lineExpiry(row),
      }));
    const data = await apiService.aiApply(updates, creates, {
      supplierId: purchase.value.supplierId || undefined,
      name: String(purchase.value.name || "").trim(),
      contact: String(purchase.value.contact || "").trim(),
      whatsapp: String(purchase.value.whatsapp || "").replace(/\D/g, ""),
      date: purchase.value.date || todayYmd(),
      expiresAt: String(purchase.value.expiresAt || "").slice(0, 10),
      lot: String(purchase.value.lot || "").trim(),
      notes: "Inventario Mágico",
    });
    done.value = data.message || "Cambios guardados.";
    notice.value = "";
    clearDraft();
    restored.value = false;
    emit("applied");
    result.value = null;
    picks.value = [];
    news.value = [];
    purchase.value = emptyPurchase();
    text.value = "";
    clearPhoto();
  } catch (e) {
    error.value = errText(e, "No pude guardar los cambios.");
  } finally {
    busy.value = false;
  }
}

function close() {
  if (busy.value) return;
  emit("close");
}

/** Después de guardar: volver al paso 1 para leer otra nota. */
function startOver() {
  done.value = "";
  notice.value = "";
  error.value = "";
}

function onKey(e) {
  if (e.key === "Escape") close();
}
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

onMounted(async () => {
  window.addEventListener("keydown", onKey);
  busy.value = false;
  menuOptions.value = Array.isArray(props.menus) ? [...props.menus] : [];
  supplierOptions.value = Array.isArray(props.suppliers) ? [...props.suppliers] : [];
  if (!menuOptions.value.length) {
    try {
      const list = await apiService.getAllMenus();
      menuOptions.value = Array.isArray(list) ? list : [];
    } catch {
      menuOptions.value = [];
    }
  }
  if (!supplierOptions.value.length) {
    try {
      const list = await apiService.getSuppliers();
      supplierOptions.value = Array.isArray(list) ? list : [];
    } catch {
      supplierOptions.value = [];
    }
  }
  restored.value = loadDraft();
  await loadQuota();
});
</script>

<style scoped>
.mg-bg {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(10, 18, 32, 0.6);
  backdrop-filter: blur(4px);
}
.mg {
  width: min(58rem, 100%);
  max-height: 94dvh;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--timber-line);
  border-radius: 1.3rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
}

/* Encabezado */
.mg-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 1.1rem 0.85rem;
  background:
    radial-gradient(120% 160% at 100% 0%, color-mix(in srgb, var(--timber-accent) 20%, transparent), transparent 60%),
    linear-gradient(135deg, color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel)), var(--timber-panel));
  border-bottom: 1px solid var(--timber-line);
}
.mg-badge {
  width: 2.8rem;
  height: 2.8rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.95rem;
  background: linear-gradient(135deg, var(--timber-primary), color-mix(in srgb, var(--timber-accent) 75%, var(--timber-primary)));
  color: #fff;
  box-shadow: 0 8px 18px color-mix(in srgb, var(--timber-primary) 30%, transparent);
}
.mg-title { flex: 1; min-width: 0; }
.mg-title h2 { margin: 0; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em; }
.mg-title p { margin: 0.15rem 0 0; font-size: 0.86rem; color: var(--timber-muted); line-height: 1.4; }
.mg-quota {
  display: grid;
  gap: 0.15rem;
  min-width: 8.5rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.8rem;
  background: var(--timber-panel);
  font-size: 0.82rem;
}
.mg-quota strong { font-size: 1.05rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.mg-quota small { font-size: 0.72rem; color: var(--timber-muted); }
.mg-quota i { display: block; height: 0.3rem; overflow: hidden; border-radius: 999px; background: var(--timber-surface); }
.mg-quota i b { display: block; height: 100%; border-radius: inherit; background: var(--timber-primary); }
.mg-quota.low { border-color: color-mix(in srgb, var(--timber-danger) 40%, var(--timber-line)); }
.mg-quota.low i b { background: var(--timber-danger); }
.mg-x {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 0.75rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  cursor: pointer;
}
.mg-x:disabled { opacity: 0.4; cursor: not-allowed; }

/* Pasos */
.mg-steps {
  display: flex;
  gap: 0.4rem;
  margin: 0;
  padding: 0.6rem 1.1rem;
  list-style: none;
  border-bottom: 1px solid var(--timber-line);
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.mg-steps li { display: flex; align-items: center; gap: 0.45rem; }
.mg-steps li + li::before {
  content: "";
  width: 1.6rem;
  height: 2px;
  margin-right: 0.15rem;
  border-radius: 1px;
  background: var(--timber-line);
}
.mg-steps span {
  width: 1.55rem;
  height: 1.55rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--timber-surface);
  font-size: 0.78rem;
}
.mg-steps li.on { color: var(--timber-ink); }
.mg-steps li.on span { background: var(--timber-primary); color: var(--timber-on-primary); }
.mg-steps li.done { color: var(--timber-success); }
.mg-steps li.done span { background: var(--timber-success-soft); color: var(--timber-success); }
.mg-steps li.done + li::before { background: var(--timber-success); }

/* Cuerpo */
.mg-body {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 0.85rem;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 1.1rem 1.2rem;
  overscroll-behavior: contain;
}
.mg-msg {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.8rem;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.4;
}
.mg-msg svg { flex-shrink: 0; margin-top: 0.1rem; }
.mg-msg.ok { background: var(--timber-success-soft); color: var(--timber-success); }
.mg-msg.err { background: var(--timber-danger-soft); color: var(--timber-danger); }
.mg-msg.warn { background: var(--timber-warning-soft); color: var(--timber-ink); }
.mg-msg.warn svg { color: var(--timber-warning); }
.mg-hint { margin: 0; font-size: 0.84rem; color: var(--timber-muted); line-height: 1.45; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Paso 1 */
.mg-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: stretch;
  gap: 0.75rem;
}
.mg-photo {
  position: relative;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.35rem;
  min-height: 14rem;
  padding: 1.2rem;
  overflow: hidden;
  border: 2px dashed color-mix(in srgb, var(--timber-primary) 40%, var(--timber-line));
  border-radius: 1.1rem;
  background: color-mix(in srgb, var(--timber-primary) 5%, var(--timber-panel));
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.mg-photo:hover,
.mg-photo.drag { border-color: var(--timber-primary); background: color-mix(in srgb, var(--timber-primary) 10%, var(--timber-panel)); }
.mg-photo:focus-within { outline: 3px solid color-mix(in srgb, var(--timber-primary) 40%, transparent); outline-offset: 2px; }
.mg-photo-ico {
  width: 3.6rem;
  height: 3.6rem;
  display: grid;
  place-items: center;
  border-radius: 1.1rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.mg-photo.busy .mg-photo-ico { background: var(--timber-warning); animation: mg-pulse 1s ease-in-out infinite alternate; }
.mg-photo strong { font-size: 1.02rem; font-weight: 800; }
.mg-photo small { max-width: 16rem; font-size: 0.82rem; color: var(--timber-muted); line-height: 1.4; }
.mg-photo.has { padding: 0; border-style: solid; }
.mg-photo.has img { width: 100%; height: 100%; max-height: 18rem; object-fit: cover; }
.mg-chip {
  position: absolute;
  bottom: 0.6rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: rgba(10, 18, 32, 0.72);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}
.mg-or { display: grid; place-items: center; }
.mg-or span {
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--timber-surface);
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--timber-muted);
}
.mg-text { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 0.35rem; font-size: 0.84rem; font-weight: 700; color: var(--timber-muted); }
.mg-text textarea {
  width: 100%;
  min-height: 12rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font: inherit;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}
.mg-text textarea:focus, .mg-inp:focus {
  outline: none;
  border-color: var(--timber-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--timber-primary) 15%, transparent);
}
.mg-how { display: grid; gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.mg-how li { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.88rem; line-height: 1.45; }
.mg-how-ico {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.6rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.mg-reading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.4rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--timber-panel) 84%, transparent);
  backdrop-filter: blur(3px);
  text-align: center;
}
.mg-reading strong { font-size: 1.15rem; font-weight: 800; }
.mg-reading small { color: var(--timber-muted); }
.mg-sparks { position: relative; width: 4rem; height: 4rem; margin-bottom: 0.4rem; }
.mg-sparks i {
  position: absolute;
  width: 1rem;
  height: 1rem;
  border-radius: 0.2rem;
  background: var(--timber-primary);
  transform: rotate(45deg);
  animation: mg-twinkle 1.2s ease-in-out infinite;
}
.mg-sparks i:nth-child(1) { left: 1.5rem; top: 0.2rem; }
.mg-sparks i:nth-child(2) { left: 0.2rem; top: 2.2rem; background: var(--timber-accent); animation-delay: 0.3s; }
.mg-sparks i:nth-child(3) { left: 2.8rem; top: 2.4rem; animation-delay: 0.6s; }
@keyframes mg-twinkle { 0%, 100% { opacity: 0.25; transform: rotate(45deg) scale(0.6); } 50% { opacity: 1; transform: rotate(45deg) scale(1.1); } }
@keyframes mg-pulse { to { opacity: 0.6; } }

/* Paso 2 */
.mg-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.8rem;
  border-radius: 1rem;
  background: var(--timber-surface);
}
.mg-mini { width: 3.4rem; height: 3.4rem; flex-shrink: 0; border-radius: 0.7rem; object-fit: cover; }
.mg-sum-chips { flex: 1; display: flex; flex-wrap: wrap; gap: 0.35rem; }
.mg-sum-total { display: grid; justify-items: end; flex-shrink: 0; }
.mg-sum-total small { font-size: 0.74rem; font-weight: 700; color: var(--timber-muted); }
.mg-sum-total strong { font-size: 1.15rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.mg-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.76rem;
  font-weight: 800;
  white-space: nowrap;
}
.mg-pill.info { background: var(--timber-primary-soft); color: var(--timber-primary); }
.mg-pill.warn { background: var(--timber-warning-soft); color: var(--timber-ink); }
.mg-pill.good { background: var(--timber-success-soft); color: var(--timber-success); }
.mg-pill.bad { background: var(--timber-danger-soft); color: var(--timber-danger); }
.mg-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
}
.mg-card-head h3 { display: flex; align-items: center; gap: 0.45rem; margin: 0; font-size: 1rem; font-weight: 800; }
.mg-card-head h3 svg { color: var(--timber-primary); }
.mg-card-head h3 em { font-style: normal; font-size: 0.78rem; font-weight: 700; color: var(--timber-muted); }
.mg-card-head p { margin: 0.2rem 0 0; font-size: 0.82rem; color: var(--timber-muted); line-height: 1.4; }
.mg-card-head.row { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.mg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
.mg-grid .wide { grid-column: span 1; }
.mg-field { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.25rem; min-width: 0; font-size: 0.78rem; font-weight: 700; color: var(--timber-muted); }
.mg-field em { font-style: normal; font-weight: 500; }
.mg-inp {
  width: 100%;
  min-height: 2.6rem;
  padding: 0 0.7rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.7rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  box-sizing: border-box;
}
.mg-inp.num { text-align: right; font-variant-numeric: tabular-nums; }
.mg-inp.tiny { width: 4.5rem; min-height: 2.2rem; display: inline-block; }
.mg-more summary { cursor: pointer; font-size: 0.84rem; font-weight: 700; color: var(--timber-primary); }
.mg-more[open] summary { margin-bottom: 0.6rem; }
.mg-rows { display: grid; grid-template-columns: minmax(0, 1fr); margin: 0; padding: 0; list-style: none; }
.mg-rows li { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.5rem; padding: 0.75rem 0 0.75rem 0.6rem; border-left: 3px solid transparent; }
.mg-rows li + li { border-top: 1px solid var(--timber-line); }
.mg-rows li.alert { border-left-color: var(--timber-warning); }
.mg-rows li.off .mg-fields,
.mg-rows li.off .mg-was,
.mg-rows li.off > .mg-field,
.mg-rows li.off .mg-pack { opacity: 0.45; }
.mg-row-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; }
.mg-check { display: flex; align-items: flex-start; gap: 0.55rem; min-width: 0; cursor: pointer; }
.mg-check input { width: 1.2rem; height: 1.2rem; margin: 0.15rem 0 0; flex-shrink: 0; accent-color: var(--timber-primary); }
.mg-row-name { display: grid; min-width: 0; }
.mg-row-name strong { font-size: 0.98rem; font-weight: 800; overflow-wrap: anywhere; }
.mg-row-name small { font-size: 0.78rem; color: var(--timber-muted); }
.mg-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.3rem; flex-shrink: 0; }
.mg-tags .mg-pill { background: var(--timber-surface); }
.mg-tags .mg-pill.warn { background: var(--timber-warning-soft); }
.mg-choose { max-width: 26rem; }
.mg-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.4rem, 1fr)); gap: 0.45rem; }
.mg-was { margin: 0; font-size: 0.78rem; color: var(--timber-muted); }
.mg-warn { margin: 0; font-size: 0.8rem; font-weight: 700; color: var(--timber-danger); }
.mg-suggest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.75rem;
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 0.7rem;
  background: var(--timber-warning-soft);
  font-size: 0.84rem;
  font-weight: 600;
}
.mg-use {
  min-height: 2.1rem;
  padding: 0 0.75rem;
  border: none;
  border-radius: 0.6rem;
  background: var(--timber-ink);
  color: var(--timber-panel);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
}
.mg-ok { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--timber-success); font-weight: 800; }
.mg-pack { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; margin: 0; font-size: 0.86rem; }
.mg-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.7rem;
  border: 1.5px dashed color-mix(in srgb, var(--timber-primary) 45%, var(--timber-line));
  border-radius: 0.8rem;
  background: transparent;
  color: var(--timber-primary);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.mg-add:hover { background: var(--timber-primary-soft); }

/* Paso 3 */
.mg-done { display: grid; justify-items: center; gap: 0.5rem; padding: 2.5rem 1rem; text-align: center; }
.mg-done-ico {
  width: 5rem;
  height: 5rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--timber-success-soft);
  color: var(--timber-success);
}
.mg-done h3 { margin: 0.3rem 0 0; font-size: 1.4rem; font-weight: 800; }
.mg-done p { margin: 0; max-width: 30rem; font-size: 0.95rem; line-height: 1.45; }

/* Pie */
.mg-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1.1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel);
}
.mg-foot-main { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
.mg-foot-main small { font-size: 0.8rem; font-weight: 700; color: var(--timber-muted); text-align: right; }
.mg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.9rem;
  padding: 0 1.05rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.mg-btn:not(.primary):hover:not(:disabled) { background: var(--timber-panel-elevated); }
.mg-btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, var(--timber-primary), color-mix(in srgb, var(--timber-primary) 70%, var(--timber-accent)));
  color: var(--timber-on-primary);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--timber-primary) 25%, transparent);
}
.mg-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.mg-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
.mg-link {
  justify-self: start;
  padding: 0;
  border: none;
  background: none;
  color: var(--timber-primary);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.mg-link:hover { text-decoration: underline; }
.mg-short { display: none; }

/* Celular: pantalla completa */
@media (max-width: 767.98px) {
  .mg-bg { padding: 0; align-items: stretch; }
  .mg { width: 100%; max-height: none; height: 100dvh; border: none; border-radius: 0; }
  .mg-head { gap: 0.55rem; padding: calc(0.8rem + env(safe-area-inset-top, 0px)) 0.85rem 0.75rem; }
  .mg-badge { width: 2.3rem; height: 2.3rem; border-radius: 0.8rem; }
  .mg-title h2 { font-size: 1.08rem; line-height: 1.2; }
  .mg-title p { display: none; }
  .mg-quota { min-width: 0; padding: 0.3rem 0.5rem; font-size: 0.74rem; }
  .mg-quota strong { font-size: 0.95rem; }
  .mg-quota small { display: none; }
  .mg-steps { padding: 0.5rem 0.85rem; }
  .mg-steps li + li::before { width: 0.8rem; }
  .mg-body { padding: 0.85rem; }
  .mg-inputs { grid-template-columns: minmax(0, 1fr); }
  .mg-photo { min-height: 10rem; }
  .mg-or { height: 1rem; }
  .mg-or span { width: 1.9rem; height: 1.9rem; }
  .mg-text textarea { min-height: 8rem; }
  .mg-grid { grid-template-columns: minmax(0, 1fr); }
  .mg-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mg-summary { flex-wrap: wrap; }
  .mg-foot { padding-left: 0.85rem; padding-right: 0.85rem; }
  .mg-foot-main small { display: none; }
  .mg-foot-main { flex: 1; justify-content: flex-end; }
  .mg-foot-main .mg-btn { flex: 1; }
  .mg-long { display: none; }
  .mg-short { display: inline; }
}
@media (min-width: 1100px) {
  .mg-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .mg-grid .wide { grid-column: span 2; }
}
</style>
