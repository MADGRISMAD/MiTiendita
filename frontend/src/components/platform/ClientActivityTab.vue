<template>
  <div class="pf-card-stack">
    <p v-if="loading" class="pf-muted">Cargando la historia…</p>
    <p v-else-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-else-if="!items.length" class="pf-muted">Aún no hay movimientos de este cliente.</p>
    <ul v-else class="pf-timeline" aria-label="Historia del cliente">
      <li v-for="item in items" :key="item.id">
        <span class="dot" :class="item.source" aria-hidden="true"></span>
        <div>
          <p>{{ item.message }}<template v-if="item.amount"> · {{ money(item.amount) }}</template></p>
          <small>{{ item.source === "billing" ? "Cobro y licencia" : item.actor ? `Por ${item.actor}` : "Equipo" }}</small>
        </div>
        <time :datetime="item.at" :title="dateTime(item.at)">{{ ago(item.at) }}</time>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { apiService } from "../../apiService";
import { ago, dateTime, money } from "../../platform/format";

const props = defineProps({ detail: { type: Object, required: true } });

const items = ref([]);
const loading = ref(true);
const error = ref("");
let seq = 0;

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = "";
  try {
    const data = await apiService.platformTenantActivity(props.detail.id);
    if (mine === seq) items.value = data.items || [];
  } catch (e) {
    if (mine === seq) error.value = typeof e.response?.data === "string" ? e.response.data : "No pude leer la historia.";
  } finally {
    if (mine === seq) loading.value = false;
  }
}
watch(() => props.detail.id, load, { immediate: true });
// Si se guardó algo en la pestaña de licencia, la historia se refresca sola
watch(() => props.detail.updatedAtKey, load);
</script>
