<template>
  <section class="adm-card pf-card-stack" aria-labelledby="ref-title">
    <div class="adm-card-head">
      <div>
        <h3 id="ref-title" class="pf-section-title">Vendedor que la trajo</h3>
        <p v-if="detail.referrer">
          <router-link :to="{ name: 'platformReferrer', params: { id: detail.referrer.id } }"><strong>{{ detail.referrer.name }}</strong></router-link>
          · código {{ detail.referrer.code }}. Cada cobro de esta tienda le genera comisión.
        </p>
        <p v-else>Nadie la refirió. Si llegó con un vendedor, asígnalo para que gane comisión por sus cobros.</p>
      </div>
    </div>

    <form class="pf-inline" @submit.prevent="assign">
      <label class="adm-field grow">
        <span>{{ detail.referrer ? "Cambiar por otro código" : "Código del vendedor" }}</span>
        <input v-model="code" class="adm-inp" placeholder="MT-XXXXXX" maxlength="12" autocomplete="off" />
      </label>
      <button type="submit" class="adm-btn" :disabled="busy || !code.trim()">Asignar</button>
      <button v-if="detail.referrer" type="button" class="adm-btn danger-ghost" :disabled="busy" @click="remove">Quitar</button>
    </form>

    <form class="pf-inline" @submit.prevent="register">
      <label class="adm-field">
        <span>Registrar un cobro hecho fuera de Mercado Pago (MXN)</span>
        <input v-model="amount" class="adm-inp" type="number" min="1" step="0.01" inputmode="decimal" placeholder="Ej. 3490" />
      </label>
      <label class="adm-field grow">
        <span>Nota</span>
        <input v-model="note" class="adm-inp" maxlength="200" placeholder="Ej. licencia perpetua, transferencia" />
      </label>
      <button type="submit" class="adm-btn" :disabled="busy || !(Number(amount) > 0)">Registrar cobro</button>
    </form>
    <p class="adm-hint">
      Úsalo para pagos en efectivo o transferencia y licencias perpetuas. Si la tienda tiene vendedor, ese cobro también le genera comisión.
    </p>

    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>
  </section>
</template>

<script setup>
import { ref } from "vue";
import { apiService } from "../../apiService";
import { money } from "../../platform/format";

const props = defineProps({ detail: { type: Object, required: true } });
const emit = defineEmits(["changed"]);

const code = ref("");
const amount = ref("");
const note = ref("");
const busy = ref(false);
const error = ref("");
const ok = ref("");

const msg = (e, fallback) => (typeof e.response?.data === "string" ? e.response.data : fallback);

async function run(task, success) {
  busy.value = true;
  error.value = "";
  ok.value = "";
  try {
    await task();
    ok.value = success();
    emit("changed");
  } catch (e) {
    error.value = msg(e, "No pude completar la acción.");
  } finally {
    busy.value = false;
  }
}

const assign = () =>
  run(
    async () => {
      await apiService.platformSetTenantReferrer(props.detail.id, code.value.trim());
      code.value = "";
    },
    () => "Vendedor asignado."
  );
const remove = () => run(() => apiService.platformSetTenantReferrer(props.detail.id, null), () => "Se quitó el vendedor.");
const register = () =>
  run(
    async () => {
      const value = Number(amount.value);
      const res = await apiService.platformManualPayment(props.detail.id, { amount: value, note: note.value });
      ok.value = res.commission ? `Cobro registrado. Comisión de ${money(res.commission.commission)} para el vendedor.` : "Cobro registrado.";
      amount.value = "";
      note.value = "";
    },
    () => ok.value
  );
</script>
