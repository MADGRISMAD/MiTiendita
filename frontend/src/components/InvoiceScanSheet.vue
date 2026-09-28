<template>
  <Teleport to="body">
    <div class="sheet-bg" @click.self="close">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="head">
          <div>
            <p class="kicker">📄 Lector Mágico</p>
            <h3>Escanear factura</h3>
          </div>
          <button type="button" class="x" aria-label="Cerrar" @click="close">×</button>
        </header>

        <p class="intro">
          Toma foto de la <strong>nota de remisión</strong> o factura del proveedor.
          El sistema extrae los costos, detecta subidas y te sugiere ajustar precios.
        </p>

        <p v-if="error" class="msg err">{{ error }}</p>
        <p v-if="notice" class="msg ok">{{ notice }}</p>

        <!-- ═══ PASO 1: Subir foto ═══ -->
        <template v-if="!results">
          <div class="photo-area">
            <label class="photo-btn big" :class="{ busy: photoBusy }">
              <span class="photo-icon">📸</span>
              <strong>{{ photoBusy ? 'Preparando foto…' : photoName ? 'Cambiar foto' : 'Foto de la nota' }}</strong>
              <small>Nota de remisión, factura o ticket del proveedor</small>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                capture="environment"
                :disabled="busy || photoBusy"
                @change="onPhoto"
              />
            </label>
          </div>
          <img v-if="photoUrl && !photoBusy" :src="photoUrl" alt="Foto de la nota" class="thumb" />

          <label class="field" v-if="!imageBase64">
            <span>O pega la lista como texto</span>
            <textarea
              v-model="text"
              rows="3"
              placeholder="Coca 600ml costo $14.50&#10;Sabritas $8.00"
              :disabled="busy"
            />
          </label>

          <button
            type="button"
            class="act primary"
            :disabled="busy || photoBusy || (!imageBase64 && !text.trim())"
            @click="scan"
          >
            {{ busy ? 'Leyendo factura…' : 'Leer factura' }}
          </button>
        </template>

        <!-- ═══ PASO 2: Resultados ═══ -->
        <template v-else>
          <img v-if="photoUrl" :src="photoUrl" alt="" class="thumb mini" />

          <!-- Alertas de costos que subieron -->
          <section v-if="alerts.length" class="alerts">
            <h4>⚠️ Costos que subieron</h4>
            <div v-for="a in alerts" :key="a.foodId" class="alert-card">
              <div class="alert-top">
                <strong>{{ a.name }}</strong>
                <span class="alert-badge up">+{{ a.costChangePct }}%</span>
              </div>
              <p class="alert-detail">
                Costo pasó de <strong>{{ money(a.currentCost) }}</strong>
                a <strong>{{ money(a.newCost) }}</strong>.
                <template v-if="a.newMargin != null">
                  Tu margen bajó a <strong>{{ a.newMargin }}%</strong>.
                </template>
              </p>
              <div class="alert-actions">
                <label class="inline-field">
                  <span>Nuevo precio al público</span>
                  <input
                    v-model.number="a.newPrice"
                    type="number"
                    min="0"
                    step="0.5"
                    class="price-in"
                  />
                </label>
                <p v-if="a.suggestedPrice" class="suggest">
                  Sugerido: <strong>{{ money(a.suggestedPrice) }}</strong>
                  <button type="button" class="link" @click="a.newPrice = a.suggestedPrice">(usar)</button>
                </p>
              </div>
              <label class="check-row">
                <input v-model="a.accept" type="checkbox" />
                <span>Actualizar costo y precio</span>
              </label>
            </div>
          </section>

          <!-- Costos sin cambios -->
          <section v-if="unchanged.length" class="block">
            <div class="block-head">
              <h4>✅ Sin cambios de costo ({{ unchanged.length }})</h4>
              <button type="button" class="link" @click="showUnchanged = !showUnchanged">
                {{ showUnchanged ? 'Ocultar' : 'Ver' }}
              </button>
            </div>
            <ul v-if="showUnchanged" class="list compact">
              <li v-for="u in unchanged" :key="u.foodId">
                <span>{{ u.name }}</span>
                <span class="muted">{{ money(u.newCost) }}</span>
              </li>
            </ul>
          </section>

          <!-- Costos que bajaron -->
          <section v-if="drops.length" class="block">
            <h4>📉 Costos que bajaron</h4>
            <div v-for="d in drops" :key="d.foodId" class="drop-row">
              <label class="check-row">
                <input v-model="d.accept" type="checkbox" />
                <span>
                  <strong>{{ d.name }}</strong>
                  — {{ money(d.currentCost) }} → {{ money(d.newCost) }}
                  <em>({{ d.costChangePct }}%)</em>
                </span>
              </label>
            </div>
          </section>

          <!-- Productos no encontrados -->
          <section v-if="newProducts.length" class="block">
            <h4>❓ No encontrados en tu catálogo ({{ newProducts.length }})</h4>
            <ul class="list compact">
              <li v-for="n in newProducts" :key="n.extractedName" class="muted">
                {{ n.extractedName }} — costo {{ money(n.newCost) }}
              </li>
            </ul>
            <p class="hint">Usa Inventario Mágico para agregarlos al catálogo.</p>
          </section>

          <!-- Inventario -->
          <section v-if="stockEntries.length" class="block">
            <div class="block-head">
              <h4>📦 Sumar al inventario</h4>
              <label class="check-row sm">
                <input v-model="addStock" type="checkbox" />
                <span>Agregar piezas</span>
              </label>
            </div>
            <ul v-if="addStock" class="list compact">
              <li v-for="s in stockEntries" :key="s.foodId || s.extractedName">
                <span>{{ s.name || s.extractedName }}</span>
                <span><strong>+{{ s.stockIn }}</strong> pzas</span>
              </li>
            </ul>
          </section>

          <button
            type="button"
            class="act primary"
            :disabled="busy || !acceptCount"
            @click="apply"
          >
            {{ busy ? 'Guardando…' : `Aplicar ${acceptCount} cambio(s)` }}
          </button>
          <button type="button" class="act" @click="resetScan">Escanear otra factura</button>
        </template>

        <button type="button" class="act" @click="close">Cerrar</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from "vue";
import { apiService } from "../apiService";

const emit = defineEmits(["close", "applied"]);

const text = ref("");
const photoName = ref("");
const photoUrl = ref("");
const photoBusy = ref(false);
const imageBase64 = ref("");
const mimeType = ref("");
const error = ref("");
const notice = ref("");
const busy = ref(false);
const results = ref(null);
const showUnchanged = ref(false);
const addStock = ref(true);

const alerts = ref([]);
const drops = ref([]);
const unchanged = ref([]);
const newProducts = ref([]);
const stockEntries = ref([]);

const acceptCount = computed(() => {
  const a = alerts.value.filter((r) => r.accept).length;
  const d = drops.value.filter((r) => r.accept).length;
  return a + d;
});

function money(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
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

async function compressPhoto(file) {
  const maxSide = 1200;
  const quality = 0.72;
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
      return { url: previewUrl, base64, mimeType: "image/jpeg" };
    } finally {
      bitmap.close();
    }
  }
  const base64 = await blobToBase64(file);
  return { url: URL.createObjectURL(file), base64, mimeType: file.type || "image/jpeg" };
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
  photoName.value = file.name || "Foto";
  try {
    await yieldUi();
    const packed = await compressPhoto(file);
    photoUrl.value = packed.url;
    mimeType.value = packed.mimeType;
    imageBase64.value = packed.base64;
    notice.value = "Foto lista. Pulsa 'Leer factura'.";
  } catch (e) {
    photoName.value = "";
    photoUrl.value = "";
    imageBase64.value = "";
    error.value = e?.message || "No pude usar esa foto.";
  } finally {
    photoBusy.value = false;
  }
}

async function scan() {
  error.value = "";
  notice.value = "";
  busy.value = true;
  try {
    const data = await apiService.invoiceScan({
      text: text.value || undefined,
      imageBase64: imageBase64.value || undefined,
      mimeType: mimeType.value || undefined,
    });
    if (!data.results?.length) {
      error.value = data.message || "No se encontraron productos en la factura.";
      busy.value = false;
      return;
    }
    results.value = data.results;
    categorize(data.results);
  } catch (e) {
    const data = e?.response?.data;
    error.value = typeof data === "string" ? data : data?.message || "No pude leer la factura.";
  } finally {
    busy.value = false;
  }
}

function categorize(items) {
  const a = [];
  const d = [];
  const u = [];
  const n = [];
  const s = [];

  for (const item of items) {
    if (item.type === "new") {
      n.push(item);
      if (item.stockIn > 0) s.push(item);
      continue;
    }
    if (item.stockIn > 0) s.push(item);
    if (!item.costChanged) {
      u.push(item);
      continue;
    }
    if (item.costDelta > 0) {
      a.push({
        ...item,
        accept: true,
        newPrice: item.suggestedPrice || item.currentPrice,
      });
    } else {
      d.push({ ...item, accept: true });
    }
  }

  alerts.value = a;
  drops.value = d;
  unchanged.value = u;
  newProducts.value = n;
  stockEntries.value = s;
}

async function apply() {
  error.value = "";
  busy.value = true;
  try {
    const updates = [];
    for (const a of alerts.value) {
      if (!a.accept) continue;
      updates.push({
        foodId: a.foodId,
        newCost: a.newCost,
        newPrice: a.newPrice || undefined,
        stockIn: addStock.value ? (a.stockIn || 0) : 0,
      });
    }
    for (const d of drops.value) {
      if (!d.accept) continue;
      updates.push({
        foodId: d.foodId,
        newCost: d.newCost,
        stockIn: addStock.value ? (d.stockIn || 0) : 0,
      });
    }
    if (!updates.length) {
      error.value = "Marca al menos un cambio para guardar.";
      busy.value = false;
      return;
    }
    const res = await apiService.invoiceApply(updates);
    notice.value = res.message || "Cambios guardados.";
    emit("applied");
    results.value = null;
    alerts.value = [];
    drops.value = [];
    unchanged.value = [];
    newProducts.value = [];
    stockEntries.value = [];
    text.value = "";
    photoUrl.value = "";
    imageBase64.value = "";
    photoName.value = "";
  } catch (e) {
    const data = e?.response?.data;
    error.value = typeof data === "string" ? data : data?.message || "No pude guardar.";
  } finally {
    busy.value = false;
  }
}

function resetScan() {
  results.value = null;
  alerts.value = [];
  drops.value = [];
  unchanged.value = [];
  newProducts.value = [];
  stockEntries.value = [];
  notice.value = "";
  error.value = "";
}

function close() {
  busy.value = false;
  emit("close");
}
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
  max-height: min(92dvh, 52rem);
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
h4 { margin: 0; font-size: 0.98rem; font-weight: 800; }
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
.intro { margin: 0; color: var(--timber-muted); font-size: 0.9rem; line-height: 1.4; }
.msg { margin: 0; font-weight: 700; font-size: 0.92rem; }
.msg.err { color: var(--timber-danger); }
.msg.ok { color: var(--timber-success); }
.hint { margin: 0; color: var(--timber-muted); font-size: 0.82rem; line-height: 1.35; }
.muted { color: var(--timber-muted); }

.photo-area { display: flex; justify-content: center; }
.photo-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  min-height: 5rem;
  padding: 1rem;
  border: 2px dashed var(--timber-primary);
  border-radius: 1rem;
  color: var(--timber-primary);
  cursor: pointer;
  text-align: center;
  background: color-mix(in srgb, var(--timber-primary) 6%, var(--timber-panel));
  transition: background 0.15s ease;
}
.photo-btn:hover { background: color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel)); }
.photo-btn.busy { opacity: 0.7; cursor: wait; }
.photo-btn input { display: none; }
.photo-icon { font-size: 1.8rem; line-height: 1; }
.photo-btn strong { font-size: 1.02rem; }
.photo-btn small { font-size: 0.82rem; color: var(--timber-muted); }
.thumb {
  width: 100%;
  max-height: 8rem;
  object-fit: cover;
  border-radius: 0.75rem;
  border: 1px solid var(--timber-line);
}
.thumb.mini { max-height: 4.5rem; }
.field { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-weight: 500;
  color: var(--timber-ink);
  background: var(--timber-panel-elevated);
  min-height: 4rem;
  resize: vertical;
}

/* ═══ Alertas ═══ */
.alerts { display: grid; gap: 0.65rem; }
.alert-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem 0.9rem;
  border-radius: 0.85rem;
  border: 1.5px solid color-mix(in srgb, var(--timber-warning) 50%, var(--timber-line));
  background: color-mix(in srgb, var(--timber-warning) 8%, var(--timber-panel));
}
.alert-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.alert-badge {
  display: inline-flex;
  align-items: center;
  height: 1.6rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
}
.alert-badge.up {
  background: color-mix(in srgb, var(--timber-danger) 20%, transparent);
  color: var(--timber-danger);
}
.alert-detail {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--timber-ink);
}
.alert-actions {
  display: grid;
  gap: 0.35rem;
}
.inline-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.price-in {
  width: 6rem;
  min-height: 2.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.5rem;
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-weight: 800;
  color: var(--timber-ink);
  background: var(--timber-panel);
  text-align: right;
}
.suggest {
  margin: 0;
  font-size: 0.82rem;
  color: var(--timber-success);
  font-weight: 700;
}

/* ═══ Bloques genéricos ═══ */
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
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.list.compact li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.88rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--timber-line);
}
.list.compact li:last-child { border-bottom: none; }
.check-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}
.check-row.sm { font-size: 0.82rem; }
.check-row input { width: 1.1rem; height: 1.1rem; accent-color: var(--timber-primary); }
.check-row em { font-style: normal; color: var(--timber-success); font-weight: 800; }
.drop-row { padding: 0.25rem 0; }
.link {
  border: none;
  background: none;
  color: var(--timber-primary);
  font: inherit;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

/* ═══ Botones ═══ */
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

@media (min-width: 768px) {
  .sheet-bg { align-items: center; padding: 1rem; }
  .sheet {
    border-radius: 1.15rem;
    max-height: calc(100dvh - 2rem);
  }
}
</style>
