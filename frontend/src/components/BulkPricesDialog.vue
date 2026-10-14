<template>
  <Teleport to="body">
    <div class="bp-bg" @click.self="close">
      <form class="bp" role="dialog" aria-modal="true" aria-labelledby="bp-title" @submit.prevent="save">
        <header class="bp-head">
          <div>
            <h2 id="bp-title">Poner precios</h2>
            <p>
              <b>{{ priced }}</b> de {{ total }} productos ya tienen precio. Escribe el precio y presiona Enter para pasar al siguiente.
              Lo que dejes vacío se queda pendiente.
            </p>
          </div>
          <button type="button" class="bp-x" aria-label="Cerrar" :disabled="busy" @click="close">×</button>
        </header>

        <div class="bp-tools">
          <input v-model="q" class="bp-inp" type="search" placeholder="Buscar producto o código" aria-label="Buscar producto" />
          <button type="button" class="bp-btn" @click="$refs.file.click()">Importar CSV</button>
          <input ref="file" type="file" accept=".csv,text/csv" hidden @change="importCsv" />
          <span class="bp-count">{{ filled }} con precio capturado</span>
        </div>
        <p v-if="importNote" class="bp-note" role="status">{{ importNote }}</p>

        <div class="bp-list">
          <div v-for="row in visible" :key="row.id" class="bp-row">
            <div class="bp-name">
              <strong>{{ row.name }}</strong>
              <small>{{ row.menuName }}<template v-if="row.code"> · {{ row.code }}</template></small>
            </div>
            <label class="bp-fld">
              <span>Precio</span>
              <input
                :ref="(el) => setRef(row.id, el)"
                v-model="draft[row.id].price"
                class="bp-inp"
                inputmode="decimal"
                placeholder="$"
                autocomplete="off"
                @keydown.enter.prevent="focusNext(row.id)"
              />
            </label>
            <label class="bp-fld">
              <span>Costo</span>
              <input v-model="draft[row.id].cost" class="bp-inp" inputmode="decimal" placeholder="Opcional" autocomplete="off" />
            </label>
          </div>
          <p v-if="!visible.length" class="bp-empty">No hay productos que coincidan.</p>
        </div>

        <p v-if="error" class="bp-err" role="alert">{{ error }}</p>
        <footer class="bp-acts">
          <button type="button" class="bp-btn" :disabled="busy" @click="close">Cerrar</button>
          <button type="submit" class="bp-btn primary" :disabled="busy || !filled">
            {{ busy ? "Guardando…" : `Guardar ${filled} precio${filled === 1 ? "" : "s"}` }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { apiService } from "../apiService";
import { matchPriceRows, parseCsv } from "../priceImport";

const props = defineProps({
  foods: { type: Array, required: true }, // productos sin precio
  menus: { type: Array, default: () => [] },
  total: { type: Number, required: true }, // productos del catálogo
});
const emit = defineEmits(["close", "saved"]);

const q = ref("");
const busy = ref(false);
const error = ref("");
const refs = new Map();
const setRef = (id, el) => (el ? refs.set(id, el) : refs.delete(id));

const menuName = (id) => props.menus.find((m) => String(m.id) === String(id))?.name || "Sin categoría";
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const rows = computed(() =>
  props.foods
    .map((f) => ({ id: String(f.id), name: f.name, code: f.barcode || f.sku || "", menuName: menuName(f.menuId) }))
    .sort((a, b) => a.menuName.localeCompare(b.menuName, "es") || a.name.localeCompare(b.name, "es"))
);
const draft = reactive({});
for (const r of rows.value) draft[r.id] = { price: "", cost: "" };

const visible = computed(() => {
  const tokens = fold(q.value).split(/\s+/).filter(Boolean);
  return tokens.length ? rows.value.filter((r) => tokens.every((t) => fold(`${r.name} ${r.code}`).includes(t))) : rows.value;
});
const num = (v) => Number(String(v).replace(/[$,\s]/g, ""));
const valid = (id) => num(draft[id].price) > 0;
const filled = computed(() => rows.value.filter((r) => valid(r.id)).length);
const priced = computed(() => props.total - rows.value.length);

const importNote = ref("");
/** Llena la tabla con los precios de un CSV (código y/o nombre, precio, costo). No guarda: el dueño revisa y guarda. */
async function importCsv(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  error.value = "";
  importNote.value = "";
  if (file.size > 2_000_000) {
    error.value = "El archivo es muy grande (máximo 2 MB).";
    return;
  }
  const res = matchPriceRows(parseCsv(await file.text()), props.foods);
  if (res.error) {
    error.value = res.error;
    return;
  }
  for (const m of res.matches) {
    if (!draft[m.id]) continue;
    draft[m.id].price = String(m.price);
    if (m.cost !== undefined) draft[m.id].cost = String(m.cost);
  }
  const bits = [`${res.matches.length} precio${res.matches.length === 1 ? "" : "s"} cargado${res.matches.length === 1 ? "" : "s"}`];
  if (res.unmatched.length) bits.push(`${res.unmatched.length} no están en tus productos sin precio (${res.unmatched.slice(0, 3).join(", ")}${res.unmatched.length > 3 ? "…" : ""})`);
  if (res.invalid.length) bits.push(`${res.invalid.length} con precio inválido`);
  importNote.value = bits.join(" · ") + ". Revisa y presiona Guardar.";
}

function focusNext(id) {
  const i = visible.value.findIndex((r) => r.id === id);
  const next = visible.value[i + 1];
  if (next) refs.get(next.id)?.focus();
}

async function save() {
  error.value = "";
  const items = rows.value
    .filter((r) => valid(r.id))
    .map((r) => ({ id: r.id, price: num(draft[r.id].price), cost: draft[r.id].cost === "" ? undefined : num(draft[r.id].cost) }));
  if (!items.length) return;
  busy.value = true;
  try {
    let saved = 0;
    for (let i = 0; i < items.length; i += 300) {
      const res = await apiService.saveBulkPrices(items.slice(i, i + 300));
      saved += Number(res?.updated || 0);
    }
    emit("saved", saved);
  } catch (e) {
    error.value = e?.response?.data?.message || (typeof e?.response?.data === "string" ? e.response.data : "") || "No se pudieron guardar los precios.";
  } finally {
    busy.value = false;
  }
}
function close() {
  if (!busy.value) emit("close");
}
</script>

<style scoped>
.bp-bg { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 0.75rem; background: rgba(8, 16, 30, 0.55); }
.bp { display: flex; flex-direction: column; width: min(760px, 100%); max-height: 92vh; border-radius: 16px; background: var(--timber-panel, #fff); color: var(--timber-text, #14213d); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3); }
.bp-head { display: flex; gap: 1rem; justify-content: space-between; padding: 1.1rem 1.25rem 0.5rem; }
.bp-head h2 { margin: 0 0 0.25rem; font-size: 1.2rem; }
.bp-head p { margin: 0; font-size: 0.88rem; opacity: 0.75; }
.bp-x { border: 0; background: none; font-size: 1.6rem; line-height: 1; cursor: pointer; color: inherit; }
.bp-tools { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1.25rem; }
.bp-tools .bp-inp { flex: 1; }
.bp-count { font-size: 0.82rem; font-weight: 700; white-space: nowrap; }
.bp-list { overflow-y: auto; padding: 0 1.25rem; display: grid; gap: 0.4rem; }
.bp-row { display: grid; grid-template-columns: 1fr 110px 110px; gap: 0.6rem; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
.bp-name { display: grid; min-width: 0; }
.bp-name strong { font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; }
.bp-name small { opacity: 0.6; }
.bp-fld { display: grid; gap: 0.15rem; font-size: 0.7rem; font-weight: 700; opacity: 0.9; }
.bp-inp { width: 100%; min-height: 40px; padding: 0 0.6rem; border-radius: 10px; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); background: transparent; color: inherit; font: inherit; }
.bp-empty { padding: 1rem 0; text-align: center; opacity: 0.6; }
.bp-note { margin: 0 1.25rem 0.4rem; font-size: 0.84rem; font-weight: 600; }
.bp-err { margin: 0.5rem 1.25rem 0; color: #c0392b; font-weight: 600; }
.bp-acts { display: flex; justify-content: flex-end; gap: 0.6rem; padding: 0.9rem 1.25rem 1.1rem; }
.bp-btn { min-height: 42px; padding: 0 1.1rem; border-radius: 10px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; font-weight: 700; cursor: pointer; }
.bp-btn.primary { border-color: transparent; background: var(--timber-primary, #1e5aa8); color: var(--timber-on-primary, #fff); }
.bp-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 560px) {
  .bp-row { grid-template-columns: 1fr 1fr; }
  .bp-name { grid-column: 1 / -1; }
}
</style>
