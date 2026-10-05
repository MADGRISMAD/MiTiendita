<template>
  <AppShell>
    <div class="adm rcp">
      <header class="adm-head">
        <div>
          <h1>Recetas</h1>
          <p>{{ headline }}</p>
        </div>
        <div class="adm-acts">
          <button type="button" class="adm-btn primary" :disabled="!ingredients.length" @click="openDrink()">
            <PosIcon name="add" :size="18" /> <span>Bebida</span>
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
        <span>
          Se está acabando: {{ lowIngredients.map((i) => i.name).join(', ') }}.
          <router-link to="/inventory?tab=insumos">Surtir en Inventario</router-link>
        </span>
      </p>

      <!-- Primer uso: menú de ejemplo -->
      <div v-if="!loading && !ingredients.length && !drinks.length" class="adm-card adm-empty">
        <PosIcon name="cup" :size="34" />
        <h3>Arma tu cafetería en un minuto</h3>
        <p>
          Cargamos insumos (café, leches, jarabes, vasos) en Inventario y bebidas con receta: espresso, americano, latte, capuchino,
          mocha y chocolate, con tamaños y extras. Después ajustas cantidades y precios.
        </p>
        <button type="button" class="adm-btn primary" :disabled="seeding" @click="seedCafe">
          {{ seeding ? `Creando… ${seedDone}/${seedTotal}` : 'Cargar menú de ejemplo' }}
        </button>
        <router-link class="adm-link" to="/inventory?tab=insumos">O da de alta tus insumos desde cero</router-link>
      </div>

      <template v-else>
        <div class="adm-card supplies-link">
          <PosIcon name="box" :size="20" />
          <span>
            <strong>{{ ingredients.length }} {{ ingredients.length === 1 ? 'insumo' : 'insumos' }}</strong>
            · la materia prima vive en Inventario
          </span>
          <router-link to="/inventory?tab=insumos" class="adm-btn sm">Ver insumos</router-link>
        </div>

        <section class="grid" :class="{ 'adm-loading': loading }">
          <div v-if="!drinks.length" class="adm-card adm-empty">
            <PosIcon name="cup" :size="30" />
            <h3>Aún no hay bebidas</h3>
            <p>Crea una bebida y dile cuánto lleva de cada insumo; al venderla se descuenta sola.</p>
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
      </template>

      <DrinkEditor
        v-if="drinkEdit"
        :drink="drinkEdit.food"
        :ingredients="ingredients"
        :menus="drinkMenus"
        :default-menu-id="defaultDrinkMenu"
        :saving="saving"
        :money="money"
        @close="closeEditor"
        @save="saveDrink"
        @delete="deleteDrink(drinkEdit.food)"
      />
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
import { apiService } from "../apiService";
import { cupsLeft, isIngredient, isRecipe, recipeCost, unitShort } from "../cafe.js";
import { STARTER_DRINKS, STARTER_INGREDIENTS, starterDrinkPayload } from "../cafeStarter.js";
import { isSupplyMenu, supplyMenuId } from "../supplies.js";

const DRINK_MENU = "Bebidas";

const route = useRoute();
const router = useRouter();

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
const fmt = (n) => (Number(n) || 0).toLocaleString("es-MX", { maximumFractionDigits: 3 });

const ingredients = computed(() => foods.value.filter(isIngredient).sort((a, b) => a.name.localeCompare(b.name, "es")));
const drinks = computed(() => foods.value.filter(isRecipe).sort((a, b) => a.name.localeCompare(b.name, "es")));
const byId = computed(() => new Map(ingredients.value.map((i) => [String(i.id), i])));
const unitOf = (id) => unitShort(byId.value.get(String(id))?.stockUnit);
const ingName = (id) => byId.value.get(String(id))?.name || "Insumo borrado";
const lowIngredients = computed(() =>
  ingredients.value.filter((f) => (Number(f.stock) || 0) <= (Number(f.lowStockThreshold) || 0))
);

const drinkRows = computed(() =>
  drinks.value.map((food) => {
    const sizeId = food.sizes?.[0]?.id;
    const cost = recipeCost(food, byId.value, { sizeId });
    const price = food.sizes?.length ? Number(food.sizes[0].price) : Number(food.price) || 0;
    return { id: food.id, food, cost, cups: cupsLeft(food, byId.value), margin: price > 0 ? Math.round(((price - cost) / price) * 100) : 0 };
  })
);

const headline = computed(() => {
  if (loading.value) return "Cargando…";
  return `${drinks.value.length} ${drinks.value.length === 1 ? "bebida" : "bebidas"} · qué lleva cada una y cuánto te cuesta`;
});

// Las bebidas van en categorías de venta (las de insumos no salen en la caja)
const drinkMenus = computed(() => menus.value.filter((m) => !isSupplyMenu(m)));
const defaultDrinkMenu = computed(() => String(drinkMenus.value.find((m) => m.name === DRINK_MENU)?.id || drinkMenus.value[0]?.id || ""));

async function load() {
  try {
    const [f, m] = await Promise.all([apiService.getAllFoods(), apiService.getAllMenus()]);
    foods.value = Array.isArray(f) ? f : [];
    menus.value = Array.isArray(m) ? m : [];
    // Desde Productos: /recetas?edit=<id> abre esa bebida
    const editId = String(route.query.edit || "");
    const target = editId && foods.value.find((x) => String(x.id) === editId);
    if (target && isRecipe(target)) openDrink(target);
  } catch (e) {
    error.value = errText(e, "No pude cargar las recetas.");
  } finally {
    loading.value = false;
  }
}

async function drinkMenuId() {
  const found = drinkMenus.value.find((m) => m.name === DRINK_MENU) || drinkMenus.value[0];
  if (found) return String(found.id);
  const created = await apiService.createMenu({ name: DRINK_MENU, description: "", kind: "sale" });
  menus.value.push(created);
  return String(created.id);
}

function upsert(food) {
  const i = foods.value.findIndex((f) => String(f.id) === String(food.id));
  if (i >= 0) foods.value.splice(i, 1, food);
  else foods.value.push(food);
}

const drinkEdit = ref(null);
async function openDrink(food = null) {
  if (!food && !drinkMenus.value.length) {
    try {
      await drinkMenuId();
    } catch (e) {
      error.value = errText(e, "No pude crear la categoría de bebidas.");
      return;
    }
  }
  drinkEdit.value = { food };
}
function closeEditor() {
  drinkEdit.value = null;
  if (route.query.edit) router.replace({ query: {} }).catch(() => {});
}
async function saveDrink(data) {
  saving.value = true;
  try {
    const food = drinkEdit.value.food;
    const saved = food ? await apiService.editFood(food.id, data) : await apiService.createFood(data);
    upsert(saved);
    closeEditor();
    say(food ? "Receta guardada." : `${saved.name} lista para vender.`);
  } catch (e) {
    error.value = errText(e, "No se pudo guardar la bebida.");
  } finally {
    saving.value = false;
  }
}
async function deleteDrink(food) {
  if (!food) return;
  saving.value = true;
  try {
    await apiService.deleteFood(food.id);
    foods.value = foods.value.filter((f) => String(f.id) !== String(food.id));
    closeEditor();
    say(`${food.name} borrada.`);
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
    const ingMenu = await supplyMenuId(menus.value);
    const drinkMenu = await drinkMenuId();
    const idOf = {};
    for (const ing of STARTER_INGREDIENTS) {
      const { key, ...data } = ing;
      const existing = ingredients.value.find((i) => i.name === data.name);
      const saved =
        existing || (await apiService.createFood({ ...data, price: 0, priceIncludesTax: true, isIngredient: true, menuId: ingMenu }));
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
    say("Listo: tu menú ya se puede vender en la caja y los insumos están en Inventario.");
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
.supplies-link { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem; font-size: 0.9rem; }
.supplies-link svg { flex-shrink: 0; color: var(--timber-primary); }
.supplies-link span { flex: 1; min-width: 0; color: var(--timber-muted); }
.supplies-link strong { color: var(--timber-ink); }
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
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); }
}
</style>
