<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg drink-opts" role="dialog" aria-modal="true" aria-labelledby="drink-opts-title" @submit.prevent="confirm">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico"><PosIcon name="cup" :size="22" /></span>
          <div>
            <h3 id="drink-opts-title">{{ food.name }}</h3>
            <p>Elige el tamaño y los extras.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        </div>

        <fieldset v-if="sizes.length" class="grp">
          <legend>Tamaño</legend>
          <div class="chips">
            <button
              v-for="s in sizes"
              :key="s.id"
              type="button"
              class="chip"
              :class="{ on: sizeId === s.id }"
              :aria-pressed="sizeId === s.id"
              @click="sizeId = s.id"
            >
              <strong>{{ s.name }}</strong>
              <small>{{ money(s.price) }}</small>
            </button>
          </div>
        </fieldset>

        <fieldset v-for="g in groups" :key="g.id" class="grp">
          <legend>
            {{ g.name }}
            <em v-if="g.required">obligatorio</em>
            <em v-else-if="g.multi">elige los que quieras</em>
            <em v-else>opcional</em>
          </legend>
          <div class="chips">
            <button
              v-for="o in g.options"
              :key="o.id"
              type="button"
              class="chip"
              :class="{ on: picked.has(`${g.id}:${o.id}`) }"
              :aria-pressed="picked.has(`${g.id}:${o.id}`)"
              @click="toggle(g, o)"
            >
              <strong>{{ o.name }}</strong>
              <small v-if="Number(o.priceDelta)">{{ Number(o.priceDelta) > 0 ? '+' : '−' }}{{ money(Math.abs(o.priceDelta)) }}</small>
            </button>
          </div>
        </fieldset>

        <div class="qty-row">
          <span>Cantidad</span>
          <div class="stepper">
            <button type="button" aria-label="Una menos" :disabled="qty <= 1" @click="qty = Math.max(1, qty - 1)">−</button>
            <strong>{{ qty }}</strong>
            <button type="button" aria-label="Una más" @click="qty += 1">+</button>
          </div>
        </div>

        <p v-if="missing" class="adm-err">{{ missing }}</p>

        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary">Agregar · {{ money(priced.price * qty) }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import "../../admin.css";
import PosIcon from "../PosIcon.js";
import { pricedChoice } from "../../cafe.js";

const props = defineProps({
  food: { type: Object, required: true },
  money: { type: Function, required: true },
});
const emit = defineEmits(["close", "add"]);

const sizes = computed(() => props.food.sizes || []);
const groups = computed(() => props.food.modifierGroups || []);
const sizeId = ref(sizes.value[0]?.id || null);
const picked = reactive(new Set());
const qty = ref(1);

function toggle(g, o) {
  const key = `${g.id}:${o.id}`;
  if (picked.has(key)) {
    picked.delete(key);
    return;
  }
  // Una sola opción por grupo, salvo los de «elige varios»
  if (!g.multi) for (const other of g.options) picked.delete(`${g.id}:${other.id}`);
  picked.add(key);
}

const priced = computed(() => pricedChoice(props.food, { sizeId: sizeId.value, modifierIds: [...picked] }));
const missing = computed(() => {
  const g = groups.value.find((grp) => grp.required && !grp.options.some((o) => picked.has(`${grp.id}:${o.id}`)));
  return g ? `Falta elegir: ${g.name.toLowerCase()}.` : "";
});

function confirm() {
  if (missing.value) return;
  emit("add", { choice: priced.value, qty: qty.value });
}
</script>

<style scoped>
.drink-opts { width: min(34rem, 100%); }
.grp { margin: 0; padding: 0; border: none; display: grid; gap: 0.45rem; min-width: 0; }
.grp legend {
  padding: 0;
  margin-bottom: 0.45rem;
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--timber-muted);
}
.grp legend em { margin-left: 0.35rem; font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.chip {
  display: grid;
  gap: 0.1rem;
  min-width: 5.5rem;
  min-height: 3.2rem;
  padding: 0.45rem 0.8rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.chip strong { font-size: 0.95rem; }
.chip small { font-size: 0.8rem; color: var(--timber-muted); font-variant-numeric: tabular-nums; }
.chip.on {
  border-color: var(--timber-primary);
  background: var(--timber-primary-soft);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--timber-primary) 15%, transparent);
}
.chip.on small { color: var(--timber-primary); }
.qty-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-weight: 700; }
.stepper { display: flex; align-items: center; gap: 0.35rem; }
.stepper button {
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-size: 1.3rem;
  font-weight: 800;
  cursor: pointer;
}
.stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
.stepper strong { min-width: 2rem; text-align: center; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
</style>
