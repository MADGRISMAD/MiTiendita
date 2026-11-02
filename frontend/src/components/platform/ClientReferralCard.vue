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

    <label v-if="canMove" class="pf-check">
      <input v-model="move" type="checkbox" />
      <span>También pasar sus {{ detail.commissions.count }} comisiones ya generadas ({{ money(detail.commissions.earned) }}) al vendedor nuevo. Si no, se quedan con quien las ganó.</span>
    </label>

    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { apiService } from "../../apiService";

const props = defineProps({ detail: { type: Object, required: true } });
const emit = defineEmits(["changed"]);

const code = ref("");
const move = ref(false);
const canMove = computed(() => props.detail.canMoveCommissions && props.detail.commissions?.count > 0 && props.detail.referrer);
const money = (n) => `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      await apiService.platformSetTenantReferrer(props.detail.id, code.value.trim(), canMove.value && move.value);
      code.value = "";
      move.value = false;
    },
    () => "Vendedor asignado."
  );
const remove = () => run(() => apiService.platformSetTenantReferrer(props.detail.id, null), () => "Se quitó el vendedor.");
</script>

<style scoped>
.pf-check { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.86rem; }
</style>
