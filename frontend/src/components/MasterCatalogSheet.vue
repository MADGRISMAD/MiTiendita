<template>
  <Teleport to="body">
    <div class="cm-bg" @click.self="close">
      <div class="cm" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <header class="cm-head">
          <span class="cm-badge" aria-hidden="true"><PosIcon name="box" :size="22" /></span>
          <div class="cm-title">
            <h2 id="cm-title">Catálogo maestro</h2>
            <p v-if="!result">Elige lo que vendes y ponle tu precio. El resto ya viene capturado.</p>
            <p v-else>Listo, ya están en tu catálogo.</p>
          </div>
          <button type="button" class="cm-x" aria-label="Cerrar" :disabled="busy" @click="close">
            <PosIcon name="x" :size="20" />
          </button>
        </header>

        <!-- Resultado -->
        <div v-if="result" class="cm-done" role="status">
          <PosIcon name="check" :size="30" />
          <h3>{{ result.created }} {{ result.created === 1 ? "producto agregado" : "productos agregados" }}</h3>
          <p v-if="result.skipped">{{ result.skipped }} ya {{ result.skipped === 1 ? "lo tenías" : "los tenías" }} y no se tocaron.</p>
          <p v-if="result.menusCreated">Se crearon {{ result.menusCreated }} {{ result.menusCreated === 1 ? "categoría" : "categorías" }} nuevas.</p>
          <p class="cm-done-tip">
            Para que el lector de código de barras los reconozca, abre cada producto en Productos y escanea su empaque real: los códigos de este
            catálogo son de referencia.
          </p>
          <button type="button" class="cm-btn primary" @click="close">Listo</button>
        </div>

        <template v-else>
          <div class="cm-tools">
            <label class="cm-search">
              <PosIcon name="search" :size="17" />
              <input ref="searchEl" v-model="q" type="search" placeholder="Buscar: nombre, marca o código" autocomplete="off" />
            </label>
            <label class="cm-field">
              <span class="sr-only">Mostrar solo</span>
              <select v-model="sectionFilter">
                <option value="">Todos los proveedores</option>
                <option v-for="s in sections" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label class="cm-field">
              <span class="sr-only">Categoría donde se agregan</span>
              <select v-model="menuId">
                <option value="">Categoría: según el proveedor</option>
                <option v-for="m in menus" :key="m.id" :value="m.id">Todo en «{{ m.name }}»</option>
              </select>
            </label>
          </div>

          <p class="cm-note">
            <PosIcon name="barcode" :size="16" />
            <span>
              Los códigos de barras de este catálogo son de referencia y casi ninguno es el del empaque real. Cuando agregues un producto, escanea el
              real para que la caja lo reconozca. Los precios los pones tú.
            </span>
          </p>

          <div class="cm-body">
            <p v-if="loading" class="cm-state" role="status">Cargando catálogo…</p>
            <p v-else-if="error" class="cm-state err" role="alert"><PosIcon name="alert" :size="17" /> {{ error }}</p>
            <p v-else-if="!visibleSections.length" class="cm-state">Nada coincide con tu búsqueda.</p>

            <section v-for="sec in visibleSections" :key="sec.name" class="cm-sec">
              <header class="cm-sec-head">
                <h3>{{ sec.name }}</h3>
                <span>{{ sec.items.length }}</span>
                <button type="button" class="cm-link" @click="toggleSection(sec)">
                  {{ sectionAllOn(sec) ? "Quitar todos" : "Elegir todos" }}
                </button>
              </header>
              <ul class="cm-list">
                <li
                  v-for="item in sec.items"
                  :key="item.id"
                  class="cm-row"
                  :class="{ on: isPicked(item.id), added: item.added, bad: tried && isPicked(item.id) && !priceOk(item.id) }"
                >
                  <label class="cm-pick">
                    <input type="checkbox" :checked="isPicked(item.id)" :disabled="item.added || busy" @change="toggle(item.id)" />
                    <span class="cm-name">
                      <strong>{{ item.name }}</strong>
                      <small>{{ item.presentation }}</small>
                    </span>
                  </label>
                  <span class="cm-meta">
                    {{ item.line }} · {{ item.plu ? `PLU ${item.code}` : item.code }}
                    <em v-if="!item.verified" title="Código de referencia: escanea el empaque real para confirmarlo">por confirmar</em>
                  </span>
                  <span v-if="item.added" class="cm-added">Ya lo tienes</span>
                  <label v-else-if="isPicked(item.id)" class="cm-price">
                    <span class="sr-only">Precio de {{ item.name }}</span>
                    <span aria-hidden="true">$</span>
                    <input
                      v-model="picked[item.id]"
                      type="number"
                      inputmode="decimal"
                      min="0.01"
                      step="0.01"
                      placeholder="Precio"
                      :disabled="busy"
                    />
                    <small v-if="item.unit === 'kg'">/kg</small>
                  </label>
                </li>
              </ul>
            </section>
          </div>

          <footer class="cm-foot">
            <p class="cm-count" :class="{ warn: tried && missing }" role="status">
              <template v-if="!count">Marca los productos que vendes.</template>
              <template v-else-if="tried && missing">Falta el precio de {{ missing }} {{ missing === 1 ? "producto" : "productos" }}.</template>
              <template v-else>{{ count }} {{ count === 1 ? "elegido" : "elegidos" }}</template>
            </p>
            <p v-if="submitError" class="cm-submit-err" role="alert">{{ submitError }}</p>
            <button type="button" class="cm-btn primary" :disabled="!count || busy || loading" @click="submit">
              {{ submitLabel }}
            </button>
          </footer>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { apiService } from "../apiService";
import PosIcon from "./PosIcon.js";

defineProps({
  menus: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "applied"]);

const loading = ref(true);
const error = ref("");
const items = ref([]);
const sections = ref([]);
const q = ref("");
const sectionFilter = ref("");
const menuId = ref("");
// id → precio escrito (texto). Estar en el objeto es estar elegido.
const picked = reactive({});
const busy = ref(false);
const tried = ref(false);
const submitError = ref("");
const result = ref(null);
const searchEl = ref(null);

const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isPicked = (id) => id in picked;
const priceOk = (id) => Number(picked[id]) > 0;

const count = computed(() => Object.keys(picked).length);
const missing = computed(() => Object.keys(picked).filter((id) => !priceOk(id)).length);
const submitLabel = computed(() => {
  if (busy.value) return "Agregando…";
  if (!count.value) return "Agregar productos";
  return `Agregar ${count.value} ${count.value === 1 ? "producto" : "productos"}`;
});

const visibleSections = computed(() => {
  const words = plain(q.value).split(/\s+/).filter(Boolean);
  const out = [];
  for (const name of sections.value) {
    if (sectionFilter.value && sectionFilter.value !== name) continue;
    const list = items.value.filter((i) => {
      if (i.section !== name) return false;
      const hay = plain(`${i.name} ${i.presentation} ${i.line} ${i.code}`);
      return words.every((w) => hay.includes(w));
    });
    if (list.length) out.push({ name, items: list });
  }
  return out;
});

const sectionPickable = (sec) => sec.items.filter((i) => !i.added);
function sectionAllOn(sec) {
  const list = sectionPickable(sec);
  return list.length > 0 && list.every((i) => isPicked(i.id));
}
function toggle(id) {
  if (isPicked(id)) delete picked[id];
  else picked[id] = "";
}
function toggleSection(sec) {
  const on = sectionAllOn(sec);
  for (const i of sectionPickable(sec)) {
    if (on) delete picked[i.id];
    else if (!isPicked(i.id)) picked[i.id] = "";
  }
}

function messageOf(err) {
  const d = err?.response?.data;
  if (typeof d === "string" && d) return d;
  if (d?.message) return d.message;
  return "No se pudo completar. Revisa tu conexión e intenta de nuevo.";
}

async function load() {
  try {
    const data = await apiService.getMasterCatalog();
    items.value = data.items || [];
    sections.value = data.sections || [];
  } catch (err) {
    error.value = messageOf(err);
  } finally {
    loading.value = false;
    await nextTick();
    searchEl.value?.focus();
  }
}

async function submit() {
  tried.value = true;
  submitError.value = "";
  if (missing.value) {
    submitError.value = "Ponle precio a los productos marcados en rojo, o quítalos de la lista.";
    return;
  }
  busy.value = true;
  try {
    const payload = { items: Object.keys(picked).map((id) => ({ id, price: Number(picked[id]) })) };
    if (menuId.value) payload.menuId = menuId.value;
    result.value = await apiService.addFromMasterCatalog(payload);
    emit("applied", result.value);
  } catch (err) {
    submitError.value = messageOf(err);
  } finally {
    busy.value = false;
  }
}

function close() {
  if (!busy.value) emit("close");
}
function onKey(e) {
  if (e.key === "Escape") close();
}
onMounted(() => {
  window.addEventListener("keydown", onKey);
  load();
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
.cm-bg {
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
.cm {
  width: min(56rem, 100%);
  max-height: 94dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--timber-line);
  border-radius: 1.3rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
}
.cm-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 1.1rem 0.85rem;
  border-bottom: 1px solid var(--timber-line);
  background: linear-gradient(135deg, color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel)), var(--timber-panel));
}
.cm-badge {
  width: 2.6rem;
  height: 2.6rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.9rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary, #fff);
}
.cm-title { flex: 1; min-width: 0; }
.cm-title h2 { margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.01em; }
.cm-title p { margin: 0.15rem 0 0; font-size: 0.86rem; color: var(--timber-muted); line-height: 1.4; }
.cm-x {
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
.cm-x:disabled { opacity: 0.4; cursor: not-allowed; }

.cm-tools {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.8rem 1.1rem 0;
}
.cm-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
}
.cm-search input { flex: 1; min-width: 0; padding: 0.65rem 0; border: none; outline: none; background: transparent; color: var(--timber-ink); font: inherit; }
.cm-field select {
  width: 100%;
  padding: 0.65rem 0.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font: inherit;
  font-size: 0.88rem;
}
.cm-note {
  display: flex;
  gap: 0.5rem;
  margin: 0.7rem 1.1rem 0;
  padding: 0.55rem 0.75rem;
  border-radius: 0.7rem;
  background: var(--timber-warning-soft);
  color: var(--timber-ink);
  font-size: 0.82rem;
  line-height: 1.4;
}
.cm-note svg { flex-shrink: 0; margin-top: 0.1rem; color: var(--timber-warning); }

.cm-body { flex: 1; min-height: 12rem; overflow-y: auto; padding: 0.4rem 1.1rem 0.8rem; }
.cm-state { margin: 2rem 0; text-align: center; color: var(--timber-muted); }
.cm-state.err { color: var(--timber-danger); }
.cm-sec-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.7rem 0 0.4rem;
  background: var(--timber-panel);
}
.cm-sec-head h3 { margin: 0; font-size: 0.95rem; font-weight: 800; }
.cm-sec-head span { color: var(--timber-muted); font-size: 0.8rem; }
.cm-link { margin-left: auto; padding: 0.2rem 0.4rem; border: none; background: none; color: var(--timber-primary); font: inherit; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
.cm-list { list-style: none; margin: 0; padding: 0; }
.cm-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.15rem 0.8rem;
  padding: 0.55rem 0.6rem;
  border-radius: 0.7rem;
}
.cm-row + .cm-row { border-top: 1px solid var(--timber-line); }
.cm-row.on { background: var(--timber-primary-soft); }
.cm-row.added { opacity: 0.55; }
.cm-row.bad { background: var(--timber-danger-soft); }
.cm-pick { display: flex; align-items: center; gap: 0.6rem; min-width: 0; cursor: pointer; }
.cm-pick input { width: 1.15rem; height: 1.15rem; flex-shrink: 0; accent-color: var(--timber-primary); }
.cm-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.45rem; min-width: 0; }
.cm-name strong { font-weight: 700; }
.cm-name small { color: var(--timber-muted); }
.cm-meta { grid-column: 1; padding-left: 1.75rem; color: var(--timber-muted); font-size: 0.78rem; }
.cm-meta em { margin-left: 0.3rem; font-style: normal; text-decoration: underline dotted; cursor: help; }
.cm-added { grid-row: 1 / span 2; grid-column: 2; color: var(--timber-muted); font-size: 0.82rem; font-weight: 600; }
.cm-price {
  grid-row: 1 / span 2;
  grid-column: 2;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.7rem;
  background: var(--timber-panel);
}
.cm-row.bad .cm-price { border-color: var(--timber-danger); }
.cm-price input { width: 5.2rem; padding: 0.5rem 0; border: none; outline: none; background: transparent; color: var(--timber-ink); font: inherit; font-weight: 700; text-align: right; }
.cm-price small { color: var(--timber-muted); }

.cm-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
  padding: 0.8rem 1.1rem;
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated, var(--timber-panel));
}
.cm-count { margin: 0; font-weight: 700; }
.cm-count.warn { color: var(--timber-danger); }
.cm-submit-err { flex-basis: 100%; order: 3; margin: 0; color: var(--timber-danger); font-size: 0.86rem; }
.cm-btn {
  margin-left: auto;
  padding: 0.7rem 1.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.8rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.cm-btn.primary { border-color: transparent; background: var(--timber-primary); color: var(--timber-on-primary, #fff); }
.cm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cm-done { display: grid; justify-items: center; gap: 0.5rem; padding: 2.2rem 1.4rem; text-align: center; }
.cm-done svg { color: var(--timber-success); }
.cm-done h3 { margin: 0; font-size: 1.2rem; }
.cm-done p { margin: 0; color: var(--timber-muted); }
.cm-done-tip { max-width: 34rem; margin-top: 0.4rem !important; padding: 0.6rem 0.8rem; border-radius: 0.7rem; background: var(--timber-warning-soft); color: var(--timber-ink) !important; font-size: 0.86rem; }
.cm-done .cm-btn { margin: 1rem 0 0; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 720px) {
  .cm-bg { padding: 0; align-items: flex-end; }
  .cm { max-height: 96dvh; border-radius: 1.3rem 1.3rem 0 0; }
  .cm-tools { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .cm-search { grid-column: 1 / -1; }
  .cm-row { grid-template-columns: minmax(0, 1fr); }
  .cm-meta { padding-left: 1.75rem; }
  .cm-price, .cm-added { grid-row: auto; grid-column: 1; justify-self: end; margin-top: 0.3rem; }
  .cm-btn { flex: 1; margin-left: 0; }
}
</style>
