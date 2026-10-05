<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg wide drink-ed" role="dialog" aria-modal="true" aria-labelledby="drink-ed-title" @submit.prevent="save">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico"><PosIcon name="cup" :size="22" /></span>
          <div>
            <h3 id="drink-ed-title">{{ drink ? 'Editar bebida' : 'Nueva bebida' }}</h3>
            <p>La receta dice cuánto insumo lleva una taza; al venderla se descuenta solo.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        </div>

        <div class="adm-row2">
          <label class="adm-field">
            Nombre
            <input v-model.trim="form.name" class="adm-inp" type="text" maxlength="60" required placeholder="Ej. Latte" />
          </label>
          <label class="adm-field">
            Categoría
            <select v-model="form.menuId" class="adm-inp" required>
              <option v-for="m in menus" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </label>
        </div>

        <!-- Receta -->
        <section class="blk">
          <div class="blk-head">
            <h4>Receta <em>para el tamaño base</em></h4>
            <button type="button" class="adm-link" :disabled="!ingredients.length" @click="addLine">+ Insumo</button>
          </div>
          <p v-if="!ingredients.length" class="adm-hint">Primero da de alta tus insumos (café, leche, vasos…) en la pestaña «Insumos».</p>
          <div v-for="(r, i) in form.recipe" :key="i" class="line">
            <select v-model="r.ingredientId" class="adm-inp" aria-label="Insumo">
              <option value="" disabled>Elige insumo</option>
              <option v-for="ing in ingredients" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
            </select>
            <div class="qty">
              <input v-model.number="r.qty" class="adm-inp num" type="number" min="0" step="any" inputmode="decimal" aria-label="Cantidad" />
              <span>{{ unitOf(r.ingredientId) }}</span>
            </div>
            <button type="button" class="adm-btn icon" aria-label="Quitar insumo" @click="form.recipe.splice(i, 1)"><PosIcon name="trash" :size="16" /></button>
          </div>
        </section>

        <!-- Tamaños -->
        <section class="blk">
          <div class="blk-head">
            <h4>Tamaños y precio</h4>
            <button type="button" class="adm-link" @click="addSize">+ Tamaño</button>
          </div>
          <label v-if="!form.sizes.length" class="adm-field">
            Precio de venta
            <input v-model.number="form.price" class="adm-inp num" type="number" min="0" step="0.5" inputmode="decimal" required />
          </label>
          <template v-else>
            <p class="adm-hint">«Receta ×» multiplica los insumos: un grande con 1.5 lleva la mitad más de todo.</p>
            <div v-for="(s, i) in form.sizes" :key="s.id" class="line size">
              <input v-model.trim="s.name" class="adm-inp" type="text" maxlength="30" placeholder="Chico" aria-label="Nombre del tamaño" required />
              <label class="mini">$<input v-model.number="s.price" class="adm-inp num" type="number" min="0" step="0.5" inputmode="decimal" aria-label="Precio" required /></label>
              <label class="mini">×<input v-model.number="s.factor" class="adm-inp num" type="number" min="0.1" max="10" step="0.05" inputmode="decimal" aria-label="Receta por" required /></label>
              <button type="button" class="adm-btn icon" aria-label="Quitar tamaño" @click="form.sizes.splice(i, 1)"><PosIcon name="trash" :size="16" /></button>
            </div>
          </template>
        </section>

        <!-- Extras -->
        <section class="blk">
          <div class="blk-head">
            <h4>Extras y cambios <em>leche, shots, jarabes</em></h4>
            <button type="button" class="adm-link" @click="addGroup">+ Grupo</button>
          </div>
          <div v-for="(g, gi) in form.groups" :key="g.id" class="group">
            <div class="line grp-line">
              <input v-model.trim="g.name" class="adm-inp" type="text" maxlength="40" placeholder="Ej. Leche" aria-label="Nombre del grupo" required />
              <label class="check"><input v-model="g.required" type="checkbox" /> Obligatorio</label>
              <label class="check"><input v-model="g.multi" type="checkbox" /> Varios</label>
              <button type="button" class="adm-btn icon" aria-label="Quitar grupo" @click="form.groups.splice(gi, 1)"><PosIcon name="trash" :size="16" /></button>
            </div>
            <div v-for="(o, oi) in g.options" :key="o.id" class="opt">
              <div class="line opt-line">
                <input v-model.trim="o.name" class="adm-inp" type="text" maxlength="40" placeholder="Ej. Almendra" aria-label="Opción" required />
                <label class="mini">+$<input v-model.number="o.priceDelta" class="adm-inp num" type="number" step="0.5" inputmode="decimal" aria-label="Precio extra" /></label>
                <select v-model="o.kind" class="adm-inp" aria-label="Qué hace con la receta">
                  <option value="none">No cambia la receta</option>
                  <option value="add">Agrega insumo</option>
                  <option value="replace">Cambia un insumo</option>
                </select>
                <button type="button" class="adm-btn icon" aria-label="Quitar opción" @click="g.options.splice(oi, 1)"><PosIcon name="x" :size="16" /></button>
              </div>
              <div v-if="o.kind === 'add'" class="line sub">
                <select v-model="o.addId" class="adm-inp" aria-label="Insumo que agrega">
                  <option value="" disabled>Insumo</option>
                  <option v-for="ing in ingredients" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
                </select>
                <div class="qty">
                  <input v-model.number="o.addQty" class="adm-inp num" type="number" min="0" step="any" inputmode="decimal" aria-label="Cantidad" />
                  <span>{{ unitOf(o.addId) }}</span>
                </div>
              </div>
              <div v-else-if="o.kind === 'replace'" class="line sub">
                <select v-model="o.replaceFrom" class="adm-inp" aria-label="Insumo que se quita">
                  <option value="" disabled>En lugar de…</option>
                  <option v-for="r in recipeIngredients" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
                <span class="arrow">→</span>
                <select v-model="o.replaceTo" class="adm-inp" aria-label="Insumo que se usa">
                  <option value="" disabled>usa…</option>
                  <option v-for="ing in ingredients" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
                </select>
              </div>
            </div>
            <button type="button" class="adm-link add-opt" @click="addOption(g)">+ Opción</button>
          </div>
        </section>

        <label class="check prep">
          <input v-model="form.prep" type="checkbox" />
          Se prepara en barra <em>(al cobrarla aparece en la pantalla Barra con número de pedido)</em>
        </label>

        <!-- Costo y ganancia -->
        <div v-if="costRows.length" class="cost">
          <div v-for="c in costRows" :key="c.label" class="cost-row">
            <span>{{ c.label }}</span>
            <span>Costo {{ money(c.cost) }}</span>
            <strong :class="c.margin < 50 ? 'warn' : 'good'">
              {{ c.price > 0 ? `${c.margin}% ganancia` : 'Sin precio' }}
            </strong>
          </div>
        </div>

        <p v-if="err" class="adm-err">{{ err }}</p>

        <div class="adm-dlg-acts" :class="{ three: drink }">
          <button v-if="drink" type="button" class="adm-btn danger-ghost" :disabled="saving" @click="remove">
            {{ confirmDelete ? '¿Seguro?' : 'Borrar' }}
          </button>
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar bebida' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import "../../admin.css";
import PosIcon from "../PosIcon.js";
import { recipeCost, unitShort } from "../../cafe.js";

const props = defineProps({
  drink: { type: Object, default: null },
  ingredients: { type: Array, required: true },
  menus: { type: Array, required: true },
  defaultMenuId: { type: String, default: "" },
  saving: { type: Boolean, default: false },
  money: { type: Function, required: true },
});
const emit = defineEmits(["close", "save", "delete"]);

const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const byId = computed(() => new Map(props.ingredients.map((i) => [String(i.id), i])));
function unitOf(id) {
  return unitShort(byId.value.get(String(id))?.stockUnit);
}

// El formulario guarda las opciones de forma cómoda de editar; al guardar se pasan al formato del servidor
function toForm(d) {
  return {
    name: d?.name || "",
    menuId: String(d?.menuId || props.defaultMenuId || props.menus[0]?.id || ""),
    price: Number(d?.price) || 0,
    prep: d ? d.prep !== false : true,
    recipe: (d?.recipe || []).map((r) => ({ ingredientId: r.ingredientId, qty: r.qty })),
    sizes: (d?.sizes || []).map((s) => ({ ...s })),
    groups: (d?.modifierGroups || []).map((g) => ({
      id: g.id,
      name: g.name,
      required: Boolean(g.required),
      multi: Boolean(g.multi),
      options: (g.options || []).map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: Number(o.priceDelta) || 0,
        kind: o.replaceFrom ? "replace" : o.add?.length ? "add" : "none",
        addId: o.add?.[0]?.ingredientId || "",
        addQty: o.add?.[0]?.qty || 0,
        replaceFrom: o.replaceFrom || "",
        replaceTo: o.replaceTo || "",
      })),
    })),
  };
}
const form = reactive(toForm(props.drink));
if (!props.drink) form.recipe.push({ ingredientId: "", qty: 0 });

const recipeIngredients = computed(() =>
  form.recipe.filter((r) => r.ingredientId).map((r) => ({ id: r.ingredientId, name: byId.value.get(String(r.ingredientId))?.name || "Insumo" }))
);

function addLine() {
  form.recipe.push({ ingredientId: "", qty: 0 });
}
function addSize() {
  if (!form.sizes.length) {
    // Al poner tamaños, el precio actual queda como el del primero
    form.sizes.push({ id: uid("s"), name: "Chico", price: form.price || 0, factor: 1 });
    form.sizes.push({ id: uid("s"), name: "Grande", price: (form.price || 0) + 10, factor: 1.5 });
    return;
  }
  const last = form.sizes[form.sizes.length - 1];
  form.sizes.push({ id: uid("s"), name: "", price: (Number(last.price) || 0) + 10, factor: Number(last.factor || 1) + 0.25 });
}
function addGroup() {
  form.groups.push({ id: uid("g"), name: "", required: false, multi: false, options: [] });
  addOption(form.groups[form.groups.length - 1]);
}
function addOption(g) {
  g.options.push({ id: uid("o"), name: "", priceDelta: 0, kind: "none", addId: "", addQty: 0, replaceFrom: "", replaceTo: "" });
}

function payload() {
  const sizes = form.sizes.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) || 0, factor: Number(s.factor) || 1 }));
  return {
    name: form.name,
    menuId: form.menuId,
    price: sizes.length ? sizes[0].price : Number(form.price) || 0,
    prep: form.prep,
    // En cafetería el precio de la carta ya trae IVA
    priceIncludesTax: props.drink ? Boolean(props.drink.priceIncludesTax) : true,
    recipe: form.recipe.filter((r) => r.ingredientId && Number(r.qty) > 0).map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty) })),
    sizes,
    modifierGroups: form.groups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      multi: g.multi,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: Number(o.priceDelta) || 0,
        add: o.kind === "add" && o.addId && Number(o.addQty) > 0 ? [{ ingredientId: o.addId, qty: Number(o.addQty) }] : [],
        replaceFrom: o.kind === "replace" ? o.replaceFrom || null : null,
        replaceTo: o.kind === "replace" ? o.replaceTo || null : null,
      })),
    })),
  };
}

const costRows = computed(() => {
  const p = payload();
  if (!p.recipe.length) return [];
  const sizes = p.sizes.length ? p.sizes : [{ id: null, name: "Precio", price: p.price }];
  return sizes.map((s) => {
    const cost = recipeCost(p, byId.value, { sizeId: s.id });
    const price = Number(s.price) || 0;
    return { label: s.name || "Tamaño", cost, price, margin: price > 0 ? Math.round(((price - cost) / price) * 100) : 0 };
  });
});

const err = ref("");
function save() {
  const p = payload();
  if (!p.recipe.length) {
    err.value = "Agrega al menos un insumo con su cantidad.";
    return;
  }
  const badReplace = form.groups.some((g) => g.options.some((o) => o.kind === "replace" && (!o.replaceFrom || !o.replaceTo)));
  if (badReplace) {
    err.value = "En «Cambia un insumo» elige qué se quita y qué se usa.";
    return;
  }
  err.value = "";
  emit("save", p);
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
.blk { display: grid; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--timber-line); }
.blk-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.blk-head h4 { margin: 0; font-size: 0.95rem; font-weight: 800; }
.blk-head h4 em { font-style: normal; font-weight: 500; font-size: 0.8rem; color: var(--timber-muted); }
.line { display: grid; grid-template-columns: minmax(0, 1fr) 8.5rem auto; gap: 0.45rem; align-items: center; }
.line.size { grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem auto; }
.line.grp-line { grid-template-columns: minmax(0, 1fr) auto auto auto; }
.line.opt-line { grid-template-columns: minmax(0, 1fr) 6.5rem minmax(10rem, 12.5rem) auto; }
.line.sub { grid-template-columns: minmax(0, 1fr) 8.5rem; padding-left: 0.9rem; }
.line.sub:has(.arrow) { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); }
.qty, .mini { display: flex; align-items: center; gap: 0.3rem; font-weight: 700; color: var(--timber-muted); }
.mini .adm-inp { padding: 0 0.5rem; }
.qty span { min-width: 1.4rem; font-size: 0.85rem; }
.arrow { font-weight: 800; color: var(--timber-muted); }
.group { display: grid; gap: 0.45rem; padding: 0.65rem; border: 1px solid var(--timber-line); border-radius: 0.9rem; background: var(--timber-panel-elevated); }
.opt { display: grid; gap: 0.35rem; }
.add-opt { justify-self: start; }
.check { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; font-weight: 700; white-space: nowrap; }
.check input { width: 1.1rem; height: 1.1rem; accent-color: var(--timber-primary); }
.check.prep { white-space: normal; align-items: flex-start; }
.check.prep em { font-style: normal; font-weight: 500; color: var(--timber-muted); }
.cost { display: grid; gap: 0.3rem; padding: 0.7rem 0.85rem; border-radius: 0.9rem; background: var(--timber-surface); }
.cost-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 0.75rem; font-size: 0.88rem; font-variant-numeric: tabular-nums; }
.cost-row strong.good { color: var(--timber-success); }
.cost-row strong.warn { color: var(--timber-warning); }
@media (max-width: 560px) {
  .line.size { grid-template-columns: minmax(0, 1fr) 5.6rem 4.6rem auto; }
  .line.opt-line { grid-template-columns: minmax(0, 1fr) 6rem auto; }
  .line.opt-line select { grid-column: 1 / -1; grid-row: 2; }
  .line.grp-line { grid-template-columns: minmax(0, 1fr) auto; }
  .line.grp-line .check { grid-row: 2; }
}
</style>
