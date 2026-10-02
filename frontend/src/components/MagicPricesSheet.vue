<template>
  <Teleport to="body">
    <div class="sheet-bg">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="head">
          <div>
            <p class="kicker">Inventario Mágico · Precio Mágico</p>
            <h3>Registrar compra y precios</h3>
          </div>
          <button type="button" class="x" aria-label="Cerrar" @click="close">×</button>
        </header>

        <p v-if="quota" class="quota">
          Te quedan <strong>{{ quota.remaining }}</strong> de {{ quota.limit }} este mes.
        </p>
        <p v-else class="quota">Revisando cuántas veces puedes usarlo…</p>

        <p v-if="error" class="msg err">{{ error }}</p>
        <p v-if="notice" class="msg ok">{{ notice }}</p>

        <template v-if="!result">
          <label class="field">
            <span>Pega la lista o la nota, como la tengas</span>
            <textarea
              v-model="text"
              rows="5"
              placeholder="15 cocas de 600&#10;8 sabritas&#10;Coca 600 a 22"
              :disabled="busy"
            />
          </label>

          <div class="photo-row">
            <label class="photo-btn" :class="{ busy: photoBusy }">
              {{ photoBusy ? 'Preparando foto…' : photoName ? 'Cambiar foto' : 'O toma una foto' }}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                capture="environment"
                :disabled="busy || photoBusy"
                @change="onPhoto"
              />
            </label>
            <button
              v-if="photoName && !photoBusy"
              type="button"
              class="link"
              @click="clearPhoto"
            >
              Quitar foto
            </button>
          </div>
          <p v-if="photoBusy" class="hint">Está dejando la foto más ligera. Espera un momento…</p>
          <img v-if="photoUrl && !photoBusy" :src="photoUrl" alt="Foto de la lista" class="thumb" />

          <p class="hint">
            Inventario Mágico registra una compra: proveedor, lote y caducidad (si la nota no trae caducidad, usamos la fecha).
            Precio Mágico avisa si el costo subió y te sugiere el precio al público.
            Cada revisión usa 1 intento; si no encuentra nada, no se descuenta.
          </p>

          <p v-if="blocked" class="msg err">
            Ya usaste las {{ quota.limit }} actualizaciones de este mes.
            Se reinician el día 1.
          </p>

          <button
            type="button"
            class="act primary"
            :disabled="busy || photoBusy || !canReview"
            @click="review"
          >
            {{ busy ? 'Leyendo…' : 'Revisar' }}
          </button>
          <button type="button" class="act" @click="emit('manual')">
            Agregar a mano, sin foto
          </button>
          <p v-if="!canReview && !busy && !photoBusy" class="hint">Pega un texto o sube una foto, o agrégalo a mano.</p>
        </template>

        <template v-else>
          <img v-if="photoUrl" :src="photoUrl" alt="" class="thumb mini" />

          <section class="block">
            <h4>Datos de la compra</h4>
            <p class="hint">
              Si la nota no trae caducidad, usamos esta fecha. Bórrala si no quieres lotes.
            </p>
            <div class="new-grid">
              <label class="field wide">
                <span>Proveedor</span>
                <select v-model="purchase.supplierId" class="inp" @change="onSupplierPick">
                  <option value="">De la nota / nuevo</option>
                  <option v-for="s in supplierOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </label>
              <label class="field wide">
                <span>Nombre</span>
                <input
                  v-model="purchase.name"
                  class="inp"
                  list="magic-suppliers"
                  placeholder="Proveedor (nota)"
                  maxlength="80"
                />
                <datalist id="magic-suppliers">
                  <option v-for="s in supplierOptions" :key="s.id" :value="s.name" />
                </datalist>
              </label>
              <label class="field">
                <span>Contacto</span>
                <input v-model="purchase.contact" class="inp" maxlength="80" />
              </label>
              <label class="field">
                <span>WhatsApp</span>
                <input v-model="purchase.whatsapp" class="inp" inputmode="tel" maxlength="15" />
              </label>
              <label class="field">
                <span>Fecha de la nota</span>
                <input v-model="purchase.date" class="inp" type="date" />
              </label>
              <label class="field">
                <span>Caducidad</span>
                <input v-model="purchase.expiresAt" class="inp" type="date" />
              </label>
              <label class="field wide">
                <span>Lote (si no viene en el renglón)</span>
                <input v-model="purchase.lot" class="inp" maxlength="60" placeholder="Se arma solo si falta" />
              </label>
            </div>
          </section>

          <p v-if="costAlerts.length" class="cost-banner">
            ⚠️ {{ costAlerts.length === 1 ? 'Un producto subió de costo' : `${costAlerts.length} productos subieron de costo` }}.
            Revisa el margen y el precio sugerido antes de guardar.
          </p>

          <p v-if="!picks.length && !news.length" class="hint">
            Esos precios ya estaban igual en tu catálogo.
          </p>

          <section v-if="picks.length" class="block">
            <div class="block-head">
              <h4>Ya los tienes</h4>
              <button type="button" class="link" @click="togglePicks(true)">Marcar todos</button>
            </div>
            <p class="hint">Marca lo que sí quieres guardar. En packs, “Entrada” son las piezas que entran al inventario.</p>
            <ul class="list">
              <li v-for="(row, i) in picks" :key="row.key">
                <label class="pick">
                  <input v-model="row.checked" type="checkbox" />
                  <span class="pick-body">
                    <strong>{{ row.name }}</strong>
                    <span v-if="row.isPack || row.packSize > 1" class="pack-tag">
                      Pack · {{ row.packs || 1 }} × {{ row.packSize || '?' }} pzas
                    </span>
                    <span class="row-line">
                      <label>
                        Costo/pza
                        <input v-model.number="row.cost" class="price-in" type="number" min="0" step="0.01" />
                      </label>
                      <label>
                        Venta
                        <input v-model.number="row.price" class="price-in" type="number" min="0" step="0.01" />
                      </label>
                      <label>
                        Entrada
                        <input v-model.number="row.stockIn" class="price-in" type="number" min="0" step="1" />
                      </label>
                      <label>
                        Lote
                        <input v-model="row.lot" class="price-in lot-in" maxlength="60" />
                      </label>
                      <label>
                        Caduca
                        <input v-model="row.expiresAt" class="price-in lot-in" type="date" />
                      </label>
                    </span>
                    <small v-if="row.oldPrice != null">
                      Antes venta {{ money(row.oldPrice) }}
                      <template v-if="row.oldCost"> · costo {{ money(row.oldCost) }}</template>
                      <template v-if="row.oldStock != null"> · stock {{ row.oldStock }}</template>
                    </small>
                    <p v-if="row.costUp" class="cost-alert">
                      El costo subió{{ row.costChangePct ? ` ${row.costChangePct}%` : '' }}.
                      <template v-if="row.newMargin != null"> Tu margen bajó a {{ row.newMargin }}%.</template>
                      <template v-if="row.suggestedPrice">
                        ¿Actualizar el precio al público a {{ money(row.suggestedPrice) }}?
                        <button type="button" class="link" @click.stop="row.price = row.suggestedPrice">Usar</button>
                      </template>
                    </p>
                  </span>
                </label>
                <p v-if="row.options" class="from">
                  Leí “{{ row.from }}”.
                  <select v-model="row.id" @change="onChoose(i)">
                    <option v-for="opt in row.options" :key="opt.id" :value="opt.id">
                      {{ opt.name }} (hoy {{ money(opt.oldPrice) }})
                    </option>
                  </select>
                </p>
              </li>
            </ul>
          </section>

          <section class="block">
            <div class="block-head">
              <h4>Nuevos</h4>
              <button type="button" class="link" @click="addExtra">Agregar otro</button>
            </div>
            <p class="hint">
              Si la foto no leyó algo, agrégalo aquí. No dependes solo de la lectura.
            </p>
            <ul v-if="news.length" class="list">
              <li v-for="row in news" :key="row.key" class="new-card">
                <label class="pick top">
                  <input v-model="row.checked" type="checkbox" />
                  <span>{{ row.manual ? 'Lo escribes tú' : 'Leído de la lista' }}</span>
                </label>
                <label class="field">
                  <span>Nombre</span>
                  <input v-model="row.name" class="inp" placeholder="Coca 600 ml" />
                </label>
                <p v-if="row.isPack || row.packSize > 1" class="pack-tag">
                  Pack mayoreo · {{ row.packs || 1 }} pack(s) ×
                  <input
                    v-model.number="row.packSize"
                    class="price-in"
                    type="number"
                    min="0"
                    step="1"
                    @input="onPackSize(row)"
                  />
                  pzas =
                  <strong>{{ row.stockIn || 0 }}</strong>
                  al inventario
                </p>
                <div class="new-grid">
                  <label class="field">
                    <span>Costo por pieza</span>
                    <input v-model.number="row.cost" class="inp" type="number" min="0" step="0.01" />
                  </label>
                  <label class="field">
                    <span>¿A cuánto lo vendes?</span>
                    <input v-model.number="row.price" class="inp" type="number" min="0" step="0.01" />
                  </label>
                  <label class="field">
                    <span>Piezas al inventario</span>
                    <input v-model.number="row.stockIn" class="inp" type="number" min="0" step="1" />
                  </label>
                  <label class="field">
                    <span>Lote</span>
                    <input v-model="row.lot" class="inp" maxlength="60" />
                  </label>
                  <label class="field">
                    <span>Caducidad</span>
                    <input v-model="row.expiresAt" class="inp" type="date" />
                  </label>
                  <label class="field">
                    <span>Categoría</span>
                    <select v-model="row.menuId" class="inp">
                      <option v-for="m in catalogMenus" :key="m.id" :value="m.id">{{ m.name }}</option>
                    </select>
                  </label>
                </div>
                <p v-if="row.isPack && !(row.packSize > 0)" class="msg err">
                  Este es un pack: escribe cuántas piezas trae para sumar el inventario.
                </p>
                <p v-if="row.price > 0 && row.cost > 0" class="margin">
                  Ganancia aprox. {{ money(row.price - row.cost) }}
                  ({{ Math.round(((row.price - row.cost) / row.price) * 100) }}%)
                </p>
              </li>
            </ul>
            <button type="button" class="act" @click="addExtra">Agregar uno que no leyó</button>
          </section>

          <button type="button" class="act primary" :disabled="busy || !saveCount" @click="save">
            {{ busy ? 'Guardando…' : saveLabel }}
          </button>
          <button type="button" class="act" @click="resetReview">Revisar otra lista</button>
        </template>

        <button type="button" class="act" @click="close">Cerrar</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { apiService } from "../apiService";

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
    menuOptions.value = (await apiService.getAllMenus()) || [];
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
  if (!file) return;
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
  const listed = supplierOptions.value.length ? supplierOptions.value : props.suppliers || [];
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
      fillPurchase(data);
      fillPicks(data);
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
  const missingPack = news.value.some(
    (row) => activeNew(row) && row.isPack && !(Number(row.stockIn) > 0)
  );
  if (missingPack) {
    error.value = "En los packs, indica cuántas piezas trae cada uno para sumar el inventario.";
    return;
  }

  busy.value = true;
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
    notice.value = data.message || "Cambios guardados.";
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
  busy.value = false;
  emit("close");
}

onMounted(async () => {
  busy.value = false;
  menuOptions.value = Array.isArray(props.menus) ? [...props.menus] : [];
  supplierOptions.value = Array.isArray(props.suppliers) ? [...props.suppliers] : [];
  if (!menuOptions.value.length) {
    try {
      menuOptions.value = (await apiService.getAllMenus()) || [];
    } catch {
      menuOptions.value = [];
    }
  }
  if (!supplierOptions.value.length) {
    try {
      supplierOptions.value = (await apiService.getSuppliers()) || [];
    } catch {
      supplierOptions.value = [];
    }
  }
  await loadQuota();
});
</script>

<style scoped>
.sheet-bg {
  position: fixed;
  inset: 0;
  z-index: 220;
  background: rgba(10, 18, 32, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: min(36rem, 100%);
  max-height: min(92dvh, 44rem);
  overflow: auto;
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 1.2rem 1.2rem 0 0;
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
  display: grid;
  gap: 0.65rem;
  border: 1px solid var(--timber-line);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.kicker {
  margin: 0 0 0.15rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-primary);
}
h3 { margin: 0; font-family: var(--font-display); font-size: 1.35rem; }
h4 { margin: 0; font-size: 0.98rem; }
.x {
  width: 2.2rem;
  height: 2.2rem;
  border: none;
  border-radius: 0.6rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-size: 1.35rem;
  cursor: pointer;
}
.quota {
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 0.7rem;
  background: color-mix(in srgb, var(--timber-primary) 8%, var(--timber-panel));
  font-size: 0.92rem;
}
.field { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.field.wide { grid-column: 1 / -1; }
textarea,
.inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-weight: 500;
  color: var(--timber-ink);
  background: var(--timber-panel-elevated);
}
textarea {
  min-height: 7.5rem;
  resize: vertical;
}
select.inp { min-height: 2.65rem; }
.photo-row { display: flex; align-items: center; gap: 0.75rem; }
.photo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.7rem;
  padding: 0 0.9rem;
  border: 1.5px dashed var(--timber-primary);
  border-radius: 0.75rem;
  color: var(--timber-primary);
  font-weight: 800;
  cursor: pointer;
}
.photo-btn.busy {
  opacity: 0.75;
  cursor: wait;
  border-style: solid;
  background: color-mix(in srgb, var(--timber-primary) 10%, var(--timber-panel));
}
.photo-btn input { display: none; }
.link {
  border: none;
  background: none;
  color: var(--timber-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.thumb {
  width: 100%;
  max-height: 8rem;
  object-fit: cover;
  border-radius: 0.75rem;
  border: 1px solid var(--timber-line);
}
.thumb.mini { max-height: 4.5rem; }
.hint { margin: 0; color: var(--timber-muted); font-size: 0.85rem; line-height: 1.35; }
.msg { margin: 0; font-weight: 700; font-size: 0.92rem; }
.msg.err { color: var(--timber-danger); }
.msg.ok { color: var(--timber-success); }
.block {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-surface);
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
.pick { display: flex; gap: 0.6rem; align-items: flex-start; cursor: pointer; }
.pick.top { align-items: center; }
.pick-body { display: grid; gap: 0.25rem; flex: 1; min-width: 0; }
.pick strong { display: block; }
.pick small { color: var(--timber-muted); font-weight: 600; }
.row-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.75rem;
  align-items: center;
}
.row-line label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.price-in {
  width: 5.5rem;
  min-height: 2.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.5rem;
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-weight: 800;
  color: var(--timber-ink);
  background: var(--timber-panel);
}
.price-in.lot-in { width: 8.2rem; }
.from { margin: 0.25rem 0 0 1.7rem; color: var(--timber-muted); font-size: 0.82rem; }
.from select {
  display: block;
  width: 100%;
  margin-top: 0.3rem;
  min-height: 2.4rem;
  border-radius: 0.55rem;
  border: 1px solid var(--timber-line);
  font: inherit;
  background: var(--timber-panel);
}
.new-card {
  padding: 0.55rem 0.6rem;
  border-radius: 0.7rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  display: grid;
  gap: 0.45rem;
}
.new-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}
.pack-tag {
  display: block;
  margin: 0.15rem 0 0.2rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--timber-primary);
}
.pack-tag .price-in {
  width: 3.6rem;
  margin: 0 0.2rem;
}
.margin {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--timber-success);
}
.cost-banner {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--timber-warning) 14%, var(--timber-panel));
  border: 1px solid color-mix(in srgb, var(--timber-warning) 40%, var(--timber-line));
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.35;
}
.cost-alert {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--timber-warning);
}
.act {
  min-height: 3.1rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font: inherit;
  font-weight: 800;
  font-size: 1.02rem;
  cursor: pointer;
}
.act.primary {
  border-color: transparent;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.act:disabled { opacity: 0.55; cursor: not-allowed; }
.upgrade { justify-self: center; font-weight: 800; color: var(--timber-primary); }
@media (min-width: 768px) {
  .sheet-bg { align-items: center; padding: 1rem; }
  .sheet {
    border-radius: 1.15rem;
    max-height: calc(100dvh - 2rem);
  }
}
</style>
