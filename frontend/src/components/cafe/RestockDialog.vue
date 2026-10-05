<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="restock-title" @submit.prevent="save">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico"><PosIcon name="truck" :size="22" /></span>
          <div>
            <h3 id="restock-title">Surtir {{ ingredient.name }}</h3>
            <p>Tienes {{ fmt(stock) }} {{ unit }}. ¿Cuánto llegó?</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        </div>

        <label class="adm-field">
          Llegaron
          <span class="with-unit">
            <input ref="amountEl" v-model.number="amount" class="adm-inp num" type="number" min="0" step="any" inputmode="decimal" required />
            <b>{{ unit }}</b>
          </span>
        </label>
        <div class="quick">
          <button v-for="q in quick" :key="q" type="button" class="adm-btn sm" @click="amount = (Number(amount) || 0) + q">+{{ fmt(q) }} {{ unit }}</button>
        </div>
        <p class="adm-hint">Quedarán <strong>{{ fmt(stock + (Number(amount) || 0)) }} {{ unit }}</strong>.</p>

        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving || !(Number(amount) > 0)">{{ saving ? 'Guardando…' : 'Surtir' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import "../../admin.css";
import PosIcon from "../PosIcon.js";
import { unitShort } from "../../cafe.js";

const props = defineProps({
  ingredient: { type: Object, required: true },
  saving: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "save"]);

const amount = ref(0);
const amountEl = ref(null);
const unit = computed(() => unitShort(props.ingredient.stockUnit));
const stock = computed(() => Number(props.ingredient.stock) || 0);
const quick = computed(() => (props.ingredient.stockUnit === "pz" ? [10, 50, 100] : [500, 1000, 5000]));
const fmt = (n) => Number(n).toLocaleString("es-MX", { maximumFractionDigits: 3 });

onMounted(() => {
  if (window.matchMedia("(pointer: fine)").matches) amountEl.value?.focus();
});

function save() {
  const add = Number(amount.value) || 0;
  if (add <= 0) return;
  emit("save", Math.round((stock.value + add) * 1000) / 1000);
}
</script>

<style scoped>
.with-unit { display: flex; align-items: center; gap: 0.4rem; }
.with-unit b { min-width: 1.4rem; color: var(--timber-ink); }
.quick { display: flex; flex-wrap: wrap; gap: 0.4rem; }
</style>
