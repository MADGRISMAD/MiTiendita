<template>
  <AppShell>
    <div class="adm rcp">
      <header class="adm-head">
        <div>
          <h1>Recetas e insumos</h1>
          <p>{{ headline }}</p>
        </div>
        <div class="adm-acts">
          <button v-if="tab === 'drinks'" type="button" class="adm-btn primary" :disabled="!ingredients.length" @click="openDrink()">
            <PosIcon name="add" :size="18" /> <span>Bebida</span>
          </button>
          <button v-else type="button" class="adm-btn primary" @click="openIngredient()">
            <PosIcon name="add" :size="18" /> <span>Insumo</span>
          </button>
        </div>
      </header>

      <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
        <button type="button" class="adm-x" aria-label="Cerrar aviso" @click="error = ''"><PosIcon name="x" :size="16" /></button>
      </p>
      <p v-if="lowIngredients.length" class="adm-banner warn" role="status">
        <PosIcon name="alert" :size="18" />
        <span>Se está acabando: {{ lowIngredients.map((i) => i.name).join(', ') }}.</span>
      </p>

      <nav class="adm-tabs main" role="tablist" aria-label="Secciones">
        <button type="button" role="tab" :aria-selected="tab === 'drinks'" :class="{ on: tab === 'drinks' }" @click="setTab('drinks')">
          Bebidas<em v-if="drinks.length">{{ drinks.length }}</em>
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'ingredients'" :class="{ on: tab === 'ingredients' }" @click="setTab('ingredients')">
          Insumos<em v-if="ingredients.length" :class="{ alert: lowIngredients.length }">{{ ingredients.length }}</em>
        </button>
      </nav>

      <!-- Primer uso: menú de ejemplo -->
      <div v-if="!loading && !ingredients.length && !drinks.length" class="adm-card adm-empty">
        <PosIcon name="cup" :size="34" />
        <h3>Arma tu cafetería en un minuto</h3>
        <p>
          Cargamos insumos (café, leches, jarabes, vasos) y bebidas con receta: espresso, americano, latte, capuchino, mocha y chocolate,
          con tamaños y extras. Después ajustas cantidades y precios.
        </p>
        <button type="button" class="adm-btn primary" :disabled="seeding" @click="seedCafe">
          {{ seeding ? `Creando… ${seedDone}/${seedTotal}` : 'Cargar menú de ejemplo' }}
        </button>
        <button type="button" class="adm-link" @click="setTab('ingredients'); openIngredient()">O empieza desde cero</button>
      </div>

      <!-- Bebidas -->
      <section v-else-if="tab === 'drinks'" class="grid" :class="{ 'adm-loading': loading }">
        <div v-if="!drinks.length" class="adm-card adm-empty">
          <PosIcon name="cup" :size="30" />
          <h3>Aún no hay bebidas</h3>
          <p>Crea una bebida y dile cuánto lleva de cada insumo.</p>
          <button type="button" class="adm-btn primary" :disabled="!ingredients.length" @click="openDrink()">Nueva bebida</button>
        </div>
        <button v-for="d in drinkRows" :key="d.id" type="button" class="adm-card drink" @click="openDrink(d.food)">
          <div class="drink-top">
            <strong>{{ d.food.name }}</strong>
            <span class="adm-pill" :class="d.margin < 50 ? 'warn' : 'good'">{{ d.margin }}% ganancia</span>
          </div>
          <p class="sizes">
            <template v-if="d.food.sizes?.length">
              <span v-for="s in d.food.sizes" :key="s.id">{{ s.name }} {{ money(s.price) }}</span>
            </template>
            <span v-else>{{ money(d.food.price) }}</span>
          </p>
          <ul class="recipe">
            <li v-for="r in d.food.recipe" :key="r.ingredientId">
              {{ fmt(r.qty) }} {{ unitOf(r.ingredientId) }} <span>{{ ingName(r.ingredientId) }}</span>
            </li>
          </ul>
          <p class="foot">
            <span>Costo {{ money(d.cost) }}</span>
            <span v-if="d.cups != null" :class="{ bad: d.cups < 10 }">Alcanza para {{ d.cups }} {{ d.cups === 1 ? 'taza' : 'tazas' }}</span>
          </p>
        </button>
      </section>

      <!-- Insumos -->
      <section v-else class="adm-card ing-list" :class="{ 'adm-loading': loading }">
        <div v-if="!ingredients.length" class="adm-empty">
          <PosIcon name="box" :size="30" />
          <h3>Sin insumos</h3>
          <p>Da de alta lo que usas para preparar: café, leche, jarabes, vasos.</p>
        </div>
        <div v-for="i in ingredientRows" :key="i.food.id" class="ing" :class="{ low: i.low }">
          <button type="button" class="ing-main" @click="openIngredient(i.food)">
            <strong>{{ i.food.name }}</strong>
            <small>{{ money4(i.food.cost) }} por {{ unitOf(i.food.id) }} · en {{ i.usedIn }} {{ i.usedIn === 1 ? 'bebida' : 'bebidas' }}</small>
          </button>
          <div class="ing-stock">
            <strong :class="{ bad: i.food.stock <= 0, warn: i.low && i.food.stock > 0 }">{{ fmt(i.food.stock || 0) }} {{ unitOf(i.food.id) }}</strong>
            <div class="bar" aria-hidden="true"><i :style="{ width: `${i.pct}%` }"></i></div>
          </div>
          <button type="button" class="adm-btn sm" @click="restockFor = i.food">Surtir</button>
        </div>
      </section>

      <DrinkEditor
        v-if="drinkEdit"
        :drink="drinkEdit.food"
        :ingredients="ingredients"
        :menus="drinkMenus"
        :default-menu-id="defaultDrinkMenu"
        :saving="saving"
        :money="money"
        @close="drinkEdit = null"
        @save="saveDrink"
        @delete="deleteFood(drinkEdit.food)"
      />
      <IngredientDialog
        v-if="ingredientEdit"
        :ingredient="ingredientEdit.food"
        :saving="saving"
        @close="ingredientEdit = null"
        @save="saveIngredient"
        @delete="deleteFood(ingredientEdit.food)"
      />
      <RestockDialog v-if="restockFor" :ingredient="restockFor" :saving="saving" @close="restockFor = null" @save="restock" />
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import "../admin.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import DrinkEditor from "../components/cafe/DrinkEditor.vue";
import IngredientDialog from "../components/cafe/IngredientDialog.vue";
import RestockDialog from "../components/cafe/RestockDialog.vue";
import { apiService } from "../apiService";
import { cupsLeft, isIngredient, isRecipe, recipeCost, unitShort } from "../cafe.js";
import { STARTER_DRINKS, STARTER_INGREDIENTS, starterDrinkPayload } from "../cafeStarter.js";

const INGREDIENT_MENU = "Insumos";
const DRINK_MENU = "Bebidas";

const route = useRoute();
const router = useRouter();
const tab = ref(route.query.tab === "ingredients" ? "ingredients" : "drinks");
function setTab(id) {
  tab.value = id;
  router.replace({ query: { ...route.query, tab: id } }).catch(() => {});
}

const foods = ref([]);
const menus = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const flash = ref("");
let flashTimer = null;
function say(msg) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ""), 4000);
}
function errText(e, fallback) {
  const d = e?.response?.data;
  if (typeof d === "string" && d) return d;
  return d?.message || fallback;
}

const money = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money4 = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: Number(n) < 1 ? 4 : 2 })}`;
const fmt = (n) => (Number(n) || 0).toLocaleString("es-MX", { maximumFractionDigits: 3 });

const ingredients = computed(() => foods.value.filter(isIngredient).sort((a, b) => a.name.localeCompare(b.name, "es")));
const drinks = computed(() => foods.value.filter(isRecipe).sort((a, b) => a.name.localeCompare(b.name, "es")));
const byId = computed(() => new Map(ingredients.value.map((i) => [String(i.id), i])));
const unitOf = (id) => unitShort(byId.value.get(String(id))?.stockUnit);
const ingName = (id) => byId.value.get(String(id))?.name || "Insumo borrado";

/** ¿La bebida usa el insumo, en su receta o en algún extra? */
function usesIngredient(drink, id) {
  const key = String(id);
  if ((drink.recipe || []).some((r) => String(r.ingredientId) === key)) return true;
  return (drink.modifierGroups || []).some((g) =>
    (g.options || []).some((o) => String(o.replaceTo) === key || (o.add || []).some((a) => String(a.ingredientId) === key))
  );
}
const isLow = (f) => (Number(f.stock) || 0) <= (Number(f.lowStockThreshold) || 0);
const lowIngredients = computed(() => ingredients.value.filter(isLow));

const drinkRows = computed(() =>
  drinks.value.map((food) => {
    const sizeId = food.sizes?.[0]?.id;
    const cost = recipeCost(food, byId.value, { sizeId });
    const price = food.sizes?.length ? Number(food.sizes[0].price) : Number(food.price) || 0;
    return { id: food.id, food, cost, cups: cupsLeft(food, byId.value), margin: price > 0 ? Math.round(((price - cost) / price) * 100) : 0 };
  })
);
const ingredientRows = computed(() =>
  ingredients.value.map((food) => {
    const id = String(food.id);
    const usedIn = drinks.value.filter((d) => usesIngredient(d, id)).length;
    const ref = Math.max(Number(food.lowStockThreshold) * 4 || 0, Number(food.stock) || 0, 1);
    return { food, usedIn, low: isLow(food), pct: Math.min(100, Math.round(((Number(food.stock) || 0) / ref) * 100)) };
  })
);

const headline = computed(() => {
  if (loading.value) return "Cargando…";
  return `${drinks.value.length} ${drinks.value.length === 1 ? "bebida" : "bebidas"} · ${ingredients.value.length} insumos`;
});

const drinkMenus = computed(() => menus.value.filter((m) => m.name !== INGREDIENT_MENU));
const defaultDrinkMenu = computed(() => String(drinkMenus.value.find((m) => m.name === DRINK_MENU)?.id || drinkMenus.value[0]?.id || ""));

async function load() {
  try {
    const [f, m] = await Promise.all([apiService.getAllFoods(), apiService.getAllMenus()]);
    foods.value = Array.isArray(f) ? f : [];
    menus.value = Array.isArray(m) ? m : [];
  } catch (e) {
    error.value = errText(e, "No pude cargar las recetas.");
  } finally {
    loading.value = false;
  }
}

/** Busca la categoría por nombre o la crea (insumos y bebidas viven en la suya). */
async function menuIdFor(name) {
  const found = menus.value.find((m) => m.name === name);
  if (found) return String(found.id);
  const created = await apiService.createMenu({ name });
  menus.value.push(created);
  return String(created.id);
}

function upsert(food) {
  const i = foods.value.findIndex((f) => String(f.id) === String(food.id));
  if (i >= 0) foods.value.splice(i, 1, food);
  else foods.value.push(food);
}

// ---------- Insumos ----------
const ingredientEdit = ref(null);
const restockFor = ref(null);
function openIngredient(food = null) {
  ingredientEdit.value = { food };
}
async function saveIngredient(data) {
  saving.value = true;
  try {
    const food = ingredientEdit.value.food;
    const saved = food
      ? await apiService.editFood(food.id, { ...data, isIngredient: true })
      : await apiService.createFood({ ...data, price: 0, isIngredient: true, menuId: await menuIdFor(INGREDIENT_MENU) });
    upsert(saved);
    ingredientEdit.value = null;
    say(food ? "Insumo actualizado." : `${saved.name} agregado.`);
  } catch (e) {
    error.value = errText(e, "No se pudo guardar el insumo.");
  } finally {
    saving.value = false;
  }
}
async function restock(newStock) {
  saving.value = true;
  const food = restockFor.value;
  try {
    await apiService.adjustStock({ foodId: food.id, stock: newStock, reason: "count", note: "Surtido de insumo" });
    upsert({ ...food, stock: newStock });
    restockFor.value = null;
    say(`${food.name}: ahora tienes ${fmt(newStock)} ${unitOf(food.id)}.`);
  } catch (e) {
    error.value = errText(e, "No se pudo surtir.");
  } finally {
    saving.value = false;
  }
}

// ---------- Bebidas ----------
const drinkEdit = ref(null);
async function openDrink(food = null) {
  if (!food && !drinkMenus.value.length) {
    try {
      await menuIdFor(DRINK_MENU);
    } catch (e) {
      error.value = errText(e, "No pude crear la categoría de bebidas.");
      return;
    }
  }
  drinkEdit.value = { food };
}
async function saveDrink(data) {
  saving.value = true;
  try {
    const food = drinkEdit.value.food;
    const saved = food ? await apiService.editFood(food.id, data) : await apiService.createFood(data);
    upsert(saved);
    drinkEdit.value = null;
    say(food ? "Receta guardada." : `${saved.name} lista para vender.`);
  } catch (e) {
    error.value = errText(e, "No se pudo guardar la bebida.");
  } finally {
    saving.value = false;
  }
}

async function deleteFood(food) {
  if (!food) return;
  // Un insumo en uso dejaría recetas incompletas
  if (isIngredient(food)) {
    const used = drinks.value.filter((d) => usesIngredient(d, food.id));
    if (used.length) {
      error.value = `${food.name} se usa en ${used.map((d) => d.name).join(", ")}. Quítalo de esas recetas y extras primero.`;
      ingredientEdit.value = null;
      return;
    }
  }
  saving.value = true;
  try {
    await apiService.deleteFood(food.id);
    foods.value = foods.value.filter((f) => String(f.id) !== String(food.id));
    drinkEdit.value = null;
    ingredientEdit.value = null;
    say(`${food.name} borrado.`);
  } catch (e) {
    error.value = errText(e, "No se pudo borrar.");
  } finally {
    saving.value = false;
  }
}

// ---------- Menú de ejemplo ----------
const seeding = ref(false);
const seedDone = ref(0);
const seedTotal = STARTER_INGREDIENTS.length + STARTER_DRINKS.length;
async function seedCafe() {
  seeding.value = true;
  seedDone.value = 0;
  error.value = "";
  try {
    const ingMenu = await menuIdFor(INGREDIENT_MENU);
    const drinkMenu = await menuIdFor(DRINK_MENU);
    const idOf = {};
    for (const ing of STARTER_INGREDIENTS) {
      const { key, ...data } = ing;
      const existing = ingredients.value.find((i) => i.name === data.name);
      const saved = existing || (await apiService.createFood({ ...data, price: 0, isIngredient: true, menuId: ingMenu }));
      if (!existing) upsert(saved);
      idOf[key] = String(saved.id);
      seedDone.value += 1;
    }
    for (const drink of STARTER_DRINKS) {
      if (!drinks.value.some((d) => d.name === drink.name)) {
        upsert(await apiService.createFood(starterDrinkPayload(drink, idOf, drinkMenu)));
      }
      seedDone.value += 1;
    }
    setTab("drinks");
    say("Listo: tu menú de cafetería ya se puede vender en la caja.");
  } catch (e) {
    error.value = errText(e, "No se pudo cargar el menú de ejemplo.");
  } finally {
    seeding.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.grid { display: grid; gap: 0.6rem; }
.drink {
  display: grid;
  gap: 0.45rem;
  width: 100%;
  margin: 0;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.drink:hover { border-color: color-mix(in srgb, var(--timber-primary) 45%, var(--timber-line)); }
.drink-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.drink-top strong { font-size: 1.05rem; }
.sizes { margin: 0; display: flex; flex-wrap: wrap; gap: 0.35rem 0.8rem; font-size: 0.88rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.recipe { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 0.3rem; }
.recipe li {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: var(--timber-surface);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.recipe li span { font-weight: 500; color: var(--timber-muted); }
.foot { margin: 0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 0.75rem; white-space: nowrap; font-size: 0.8rem; font-weight: 600; color: var(--timber-muted); }
.foot .bad { color: var(--timber-danger); }
.ing-list { display: grid; gap: 0; padding: 0.25rem 0.9rem; }
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
.ing-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ing-main small { font-size: 0.78rem; color: var(--timber-muted); }
.ing-stock { display: grid; gap: 0.25rem; justify-items: end; font-variant-numeric: tabular-nums; }
.ing-stock strong { font-size: 0.92rem; }
.ing-stock .bad { color: var(--timber-danger); }
.ing-stock .warn { color: var(--timber-warning); }
.bar { width: 100%; height: 0.35rem; border-radius: 999px; background: var(--timber-surface); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: inherit; background: var(--timber-success); }
.ing.low .bar i { background: var(--timber-warning); }
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); }
}
@media (max-width: 420px) {
  .ing { grid-template-columns: minmax(0, 1fr) auto; }
  .ing-stock { grid-column: 1 / -1; grid-row: 2; justify-items: stretch; }
}
</style>
