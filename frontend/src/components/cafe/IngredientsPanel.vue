<template>
  <section class="sec ing-panel" :class="{ 'adm-loading': loading }">
    <div class="adm-tools">
      <p class="adm-hint grow">
        Materia prima para preparar: no sale en la caja y se descuenta sola al vender una bebida según su
        <router-link to="/recetas">receta</router-link>.
      </p>
      <button v-if="isAdmin" type="button" class="adm-btn primary" @click="edit = { food: null }">
        <PosIcon name="add" :size="18" /> Nuevo insumo
      </button>
    </div>

    <div v-if="!ingredients.length" class="adm-card adm-empty">
      <PosIcon name="box" :size="30" />
      <h3>Sin insumos</h3>
      <p>Da de alta lo que usas para preparar: café, leche, jarabes, vasos. También puedes crear una categoría de tipo «Insumos» en Productos.</p>
      <button v-if="isAdmin" type="button" class="adm-btn primary" @click="edit = { food: null }">Nuevo insumo</button>
    </div>

    <div v-else class="adm-card list">
      <div v-for="i in rows" :key="i.food.id" class="ing" :class="{ low: i.low }">
        <button type="button" class="ing-main" :disabled="!isAdmin" @click="edit = { food: i.food }">
          <strong>{{ i.food.name }}</strong>
          <small>{{ money4(i.food.cost) }} por {{ unit(i.food) }} · en {{ i.usedIn }} {{ i.usedIn === 1 ? 'bebida' : 'bebidas' }}</small>
        </button>
        <div class="ing-stock">
          <strong :class="{ bad: (i.food.stock || 0) <= 0, warn: i.low && i.food.stock > 0 }">{{ fmt(i.food.stock || 0) }} {{ unit(i.food) }}</strong>
          <div class="bar" aria-hidden="true"><i :style="{ width: `${i.pct}%` }"></i></div>
        </div>
        <button v-if="isAdmin" type="button" class="adm-btn sm" @click="restockFor = i.food">Surtir</button>
      </div>
    </div>

    <IngredientDialog
      v-if="edit"
      :ingredient="edit.food"
      :saving="saving"
      @close="edit = null"
      @save="save"
      @delete="remove(edit.food)"
    />
    <RestockDialog v-if="restockFor" :ingredient="restockFor" :saving="saving" @close="restockFor = null" @save="restock" />
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import "../../admin.css";
import PosIcon from "../PosIcon.js";
import IngredientDialog from "./IngredientDialog.vue";
import RestockDialog from "./RestockDialog.vue";
import { apiService } from "../../apiService";
import { hasRole } from "../../authStore";
import { isIngredient, isRecipe, unitShort, usesIngredient } from "../../cafe.js";
import { supplyMenuId } from "../../supplies.js";

const props = defineProps({
  foods: { type: Array, required: true },
  loading: { type: Boolean, default: false },
});
// saved(food): alta o cambio · removed(id) · error(texto) · flash(texto)
const emit = defineEmits(["saved", "removed", "error", "flash"]);

const isAdmin = computed(() => hasRole("admin"));
const ingredients = computed(() => props.foods.filter(isIngredient).sort((a, b) => a.name.localeCompare(b.name, "es")));
const drinks = computed(() => props.foods.filter(isRecipe));
const isLow = (f) => (Number(f.stock) || 0) <= (Number(f.lowStockThreshold) || 0);
const rows = computed(() =>
  ingredients.value.map((food) => {
    const ref = Math.max(Number(food.lowStockThreshold) * 4 || 0, Number(food.stock) || 0, 1);
    return {
      food,
      usedIn: drinks.value.filter((d) => usesIngredient(d, food.id)).length,
      low: isLow(food),
      pct: Math.min(100, Math.round(((Number(food.stock) || 0) / ref) * 100)),
    };
  })
);

const unit = (f) => unitShort(f.stockUnit);
const fmt = (n) => (Number(n) || 0).toLocaleString("es-MX", { maximumFractionDigits: 3 });
const money4 = (n) =>
  `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: Number(n) < 1 ? 4 : 2 })}`;
function errText(e, fallback) {
  const d = e?.response?.data;
  return (typeof d === "string" && d) || d?.message || fallback;
}

const edit = ref(null);
const restockFor = ref(null);
const saving = ref(false);

async function save(data) {
  saving.value = true;
  try {
    const food = edit.value.food;
    let saved;
    if (food) {
      saved = await apiService.editFood(food.id, data);
    } else {
      const menus = (await apiService.getAllMenus()) || [];
      saved = await apiService.createFood({ ...data, price: 0, priceIncludesTax: true, isIngredient: true, menuId: await supplyMenuId(menus) });
    }
    emit("saved", saved);
    emit("flash", food ? "Insumo actualizado." : `${saved.name} agregado a tus insumos.`);
    edit.value = null;
  } catch (e) {
    emit("error", errText(e, "No se pudo guardar el insumo."));
  } finally {
    saving.value = false;
  }
}

async function restock(newStock) {
  saving.value = true;
  const food = restockFor.value;
  try {
    await apiService.adjustStock({ foodId: food.id, stock: newStock, reason: "count", note: "Surtido de insumo" });
    emit("saved", { ...food, stock: newStock });
    emit("flash", `${food.name}: ahora tienes ${fmt(newStock)} ${unit(food)}.`);
    restockFor.value = null;
  } catch (e) {
    emit("error", errText(e, "No se pudo surtir."));
  } finally {
    saving.value = false;
  }
}

async function remove(food) {
  // Un insumo en uso dejaría recetas incompletas
  const used = drinks.value.filter((d) => usesIngredient(d, food.id));
  if (used.length) {
    emit("error", `${food.name} se usa en ${used.map((d) => d.name).join(", ")}. Quítalo de esas recetas y extras primero.`);
    edit.value = null;
    return;
  }
  saving.value = true;
  try {
    await apiService.deleteFood(food.id);
    emit("removed", food.id);
    emit("flash", `${food.name} borrado.`);
    edit.value = null;
  } catch (e) {
    emit("error", errText(e, "No se pudo borrar."));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.grow { flex: 1 1 16rem; }
.grow a { color: var(--timber-primary); font-weight: 700; }
.list { display: grid; gap: 0; padding: 0.25rem 0.9rem; }
.ing {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(6rem, 9rem) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--timber-line);
}
.ing:last-child { border-bottom: none; }
.ing-main { display: grid; gap: 0.1rem; padding: 0; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; min-width: 0; }
.ing-main:disabled { cursor: default; }
.ing-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ing-main small { font-size: 0.78rem; color: var(--timber-muted); }
.ing-stock { display: grid; gap: 0.25rem; justify-items: end; font-variant-numeric: tabular-nums; }
.ing-stock strong { font-size: 0.92rem; }
.ing-stock .bad { color: var(--timber-danger); }
.ing-stock .warn { color: var(--timber-warning); }
.bar { width: 100%; height: 0.35rem; border-radius: 999px; background: var(--timber-surface); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: inherit; background: var(--timber-success); }
.ing.low .bar i { background: var(--timber-warning); }
@media (max-width: 420px) {
  .ing { grid-template-columns: minmax(0, 1fr) auto; }
  .ing-stock { grid-column: 1 / -1; grid-row: 2; justify-items: stretch; }
}
</style>
