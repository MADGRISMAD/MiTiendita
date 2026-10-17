<template>
  <section class="pf-card-stack pf-pay" aria-labelledby="pay-title">
    <h3 id="pay-title" class="pf-section-title">Registrar un pago</h3>
    <p class="adm-hint">
      Para pagos recibidos fuera de la app (transferencia, efectivo). Activa el negocio y extiende su periodo pagado.
      <template v-if="paidUntil">Hoy paga hasta {{ paidUntil }}.</template>
    </p>
    <form class="pf-inline" @submit.prevent="register">
      <label class="adm-field">
        <span>Monto (MXN)</span>
        <input v-model="amount" class="adm-inp" type="number" min="1" step="0.01" inputmode="decimal" placeholder="Ej. 1899" />
      </label>
      <label v-if="!perpetual" class="adm-field">
        <span>Meses</span>
        <input v-model.number="months" class="adm-inp" type="number" min="1" max="36" step="1" inputmode="numeric" />
      </label>
      <label class="adm-field grow">
        <span>Nota</span>
        <input v-model="note" class="adm-inp" maxlength="200" placeholder="SPEI, folio…" />
      </label>
      <button type="submit" class="adm-btn primary" :disabled="busy || !(Number(amount) > 0) || (!perpetual && !(months >= 1 && months <= 36))">
        {{ busy ? "Registrando…" : "Registrar" }}
      </button>
    </form>
    <p v-if="!perpetual && Number(amount) > 0 && months >= 1" class="adm-hint">
      Se registrará {{ money(Number(amount)) }} por {{ months }} {{ months === 1 ? "mes" : "meses" }} ({{ money(Number(amount) / months) }} al mes).
    </p>
    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { apiService } from "../../apiService";
import { money, shortDate } from "../../platform/format";

const props = defineProps({ detail: { type: Object, required: true } });
const emit = defineEmits(["changed"]);

const amount = ref("");
const months = ref(1);
const note = ref("");
const busy = ref(false);
const error = ref("");
const ok = ref("");

const perpetual = computed(() => props.detail.plan === "perpetual" || props.detail.isPerpetual);
const paidUntil = computed(() => (!perpetual.value && props.detail.currentPeriodEnd ? shortDate(props.detail.currentPeriodEnd) : ""));

async function register() {
  busy.value = true;
  error.value = "";
  ok.value = "";
  try {
    const res = await apiService.platformManualPayment(props.detail.id, {
      amount: Number(amount.value),
      months: perpetual.value ? undefined : Number(months.value),
      note: note.value,
    });
    const until = res.currentPeriodEnd ? ` Paga hasta ${shortDate(res.currentPeriodEnd)}.` : "";
    ok.value = (res.commission ? `Pago registrado. Comisión de ${money(res.commission.commission)} para el vendedor.` : "Pago registrado.") + until;
    amount.value = "";
    months.value = 1;
    note.value = "";
    emit("changed");
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude registrar el pago.";
  } finally {
    busy.value = false;
  }
}
</script>
