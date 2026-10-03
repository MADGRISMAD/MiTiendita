<template>
  <div class="pf-card-stack">
    <div class="adm-kpis">
      <div class="adm-kpi">
        <span>Gastos del mes</span>
        <strong class="pf-num">{{ money(books.expensesTotal) }}</strong>
        <small>sin contar la IA</small>
      </div>
      <div class="adm-kpi">
        <span>Anotados</span>
        <strong class="pf-num">{{ books.expenses.length }}</strong>
        <small>este mes</small>
      </div>
    </div>

    <section class="adm-card pf-card-stack">
      <div class="adm-card-head"><div><h2>Anotar un gasto</h2><p>Servidor, dominio, comisiones… lo que cuesta operar Mi Tiendita.</p></div></div>
      <form class="pf-expense" @submit.prevent="add">
        <label class="adm-field"><span>Concepto</span><input v-model="label" class="adm-inp" placeholder="Servidor, dominio, comisión…" required minlength="2" maxlength="80" /></label>
        <label class="adm-field"><span>Monto</span><input v-model.number="amount" class="adm-inp num" type="number" min="0.01" step="0.01" placeholder="0.00" required /></label>
        <label class="adm-field"><span>Nota (opcional)</span><input v-model="note" class="adm-inp" maxlength="200" /></label>
        <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? "Guardando…" : "Agregar" }}</button>
      </form>
      <p v-if="error" class="pf-err" role="alert">{{ error }}</p>

      <p v-if="!books.expenses.length" class="pf-muted">No hay gastos anotados este mes.</p>
      <ul v-else class="pf-list">
        <li v-for="row in books.expenses" :key="row.id" class="pf-row" style="cursor: default; align-items: center">
          <span class="body">
            <span class="top"><strong>{{ row.label }}</strong><time>{{ row.day ? `día ${row.day}` : "" }}</time></span>
            <span v-if="row.note" class="prev">{{ row.note }}</span>
          </span>
          <strong class="pf-num">{{ money(row.amount) }}</strong>
          <button type="button" class="adm-btn sm danger-ghost" :aria-label="`Quitar el gasto ${row.label}`" @click="remove(row)">
            {{ confirmId === row.id ? "¿Seguro?" : "Quitar" }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { apiService } from "../../apiService";
import { money } from "../../platform/format";

defineProps({ books: { type: Object, required: true } });
const emit = defineEmits(["changed"]);

const label = ref("");
const amount = ref(null);
const note = ref("");
const saving = ref(false);
const error = ref("");
const confirmId = ref("");
let confirmTimer = null;

async function add() {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await apiService.platformCreateExpense({ label: label.value, amount: Number(amount.value), note: note.value });
    label.value = "";
    amount.value = null;
    note.value = "";
    emit("changed");
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude guardar el gasto.";
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  if (confirmId.value !== row.id) {
    confirmId.value = row.id;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirmId.value = ""), 4000);
    return;
  }
  confirmId.value = "";
  error.value = "";
  try {
    await apiService.platformDeleteExpense(row.id);
    emit("changed");
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude quitar el gasto.";
  }
}
</script>
