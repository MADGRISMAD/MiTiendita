<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="ing-title" @submit.prevent="save">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico"><PosIcon name="box" :size="22" /></span>
          <div>
            <h3 id="ing-title">{{ ingredient ? 'Editar insumo' : 'Nuevo insumo' }}</h3>
            <p>Materia prima de tus bebidas: café, leche, jarabes, vasos…</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        </div>

        <label class="adm-field">
          Nombre
          <input v-model.trim="form.name" class="adm-inp" type="text" maxlength="60" required placeholder="Ej. Leche entera" />
        </label>

        <div class="adm-field">
          Se mide en
          <div class="units" role="radiogroup" aria-label="Unidad">
            <label v-for="u in STOCK_UNITS" :key="u.id" class="unit" :class="{ on: form.stockUnit === u.id }">
              <input v-model="form.stockUnit" type="radio" name="ing-unit" :value="u.id" />
              {{ u.label }}
            </label>
          </div>
        </div>

        <div class="adm-row2">
          <label class="adm-field">
            Lo compras en paquetes de
            <span class="with-unit">
              <input v-model.number="form.packSize" class="adm-inp num" type="number" min="0.001" step="any" inputmode="decimal" required />
              <b>{{ unit }}</b>
            </span>
          </label>
          <label class="adm-field">
            Y te cuesta
            <span class="with-unit">
              <b>$</b>
              <input v-model.number="form.packPrice" class="adm-inp num" type="number" min="0" step="0.5" inputmode="decimal" required />
            </span>
          </label>
        </div>
        <p class="adm-hint">Costo: <strong>{{ money4(unitCost) }} por {{ unit }}</strong>. Con esto calculamos cuánto te cuesta cada bebida.</p>

        <div class="adm-row2">
          <label v-if="!ingredient" class="adm-field">
            Tienes ahora
            <span class="with-unit">
              <input v-model.number="form.stock" class="adm-inp num" type="number" min="0" step="any" inputmode="decimal" />
              <b>{{ unit }}</b>
            </span>
          </label>
          <label class="adm-field">
            Avísame cuando queden
            <span class="with-unit">
              <input v-model.number="form.lowStockThreshold" class="adm-inp num" type="number" min="0" step="any" inputmode="decimal" />
              <b>{{ unit }}</b>
            </span>
          </label>
        </div>

        <p v-if="err" class="adm-err">{{ err }}</p>

        <div class="adm-dlg-acts" :class="{ three: ingredient }">
          <button v-if="ingredient" type="button" class="adm-btn danger-ghost" :disabled="saving" @click="remove">
            {{ confirmDelete ? '¿Seguro?' : 'Borrar' }}
          </button>
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import "../../admin.css";
import PosIcon from "../PosIcon.js";
import { STOCK_UNITS, unitShort } from "../../cafe.js";

const props = defineProps({
  ingredient: { type: Object, default: null },
  saving: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "save", "delete"]);

const DEFAULT_PACK = { ml: 1000, g: 1000, pz: 50 };
const startUnit = props.ingredient?.stockUnit || "ml";
const startPack = DEFAULT_PACK[startUnit];
const form = reactive({
  name: props.ingredient?.name || "",
  stockUnit: startUnit,
  packSize: startPack,
  packPrice: props.ingredient ? round2((Number(props.ingredient.cost) || 0) * startPack) : 0,
  stock: 0,
  lowStockThreshold: props.ingredient?.lowStockThreshold ?? startPack,
});
// Al cambiar de unidad, sugiere un paquete típico
watch(
  () => form.stockUnit,
  (u) => {
    form.packSize = DEFAULT_PACK[u];
    form.lowStockThreshold = DEFAULT_PACK[u];
  }
);

const unit = computed(() => unitShort(form.stockUnit));
const unitCost = computed(() => (Number(form.packSize) > 0 ? (Number(form.packPrice) || 0) / Number(form.packSize) : 0));

function round2(n) {
  return Math.round(n * 100) / 100;
}
function money4(n) {
  // Costos por ml o g son centavos: se muestran con más decimales
  return `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
}

const err = ref("");
function save() {
  if (!(Number(form.packSize) > 0)) {
    err.value = "¿De cuánto es el paquete?";
    return;
  }
  err.value = "";
  const out = {
    name: form.name,
    stockUnit: form.stockUnit,
    cost: Math.round(unitCost.value * 10000) / 10000,
    lowStockThreshold: Math.max(0, Number(form.lowStockThreshold) || 0),
  };
  if (!props.ingredient) out.stock = Math.max(0, Number(form.stock) || 0);
  emit("save", out);
}

const confirmDelete = ref(false);
function remove() {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    setTimeout(() => (confirmDelete.value = false), 4000);
    return;
  }
  emit("delete");
}
</script>

<style scoped>
.units { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.unit {
  display: inline-flex;
  align-items: center;
  min-height: 2.6rem;
  padding: 0 0.85rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 700;
  cursor: pointer;
}
.unit input { position: absolute; opacity: 0; pointer-events: none; }
.unit.on { border-color: var(--timber-primary); background: var(--timber-primary-soft); color: var(--timber-primary); }
.unit:has(input:focus-visible) { outline: 3px solid color-mix(in srgb, var(--timber-primary) 45%, transparent); }
.with-unit { display: flex; align-items: center; gap: 0.4rem; }
.with-unit b { color: var(--timber-ink); min-width: 1rem; }
</style>
