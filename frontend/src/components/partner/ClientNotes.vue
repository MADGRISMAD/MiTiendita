<template>
  <section class="pf-card-stack" aria-labelledby="notes-title">
    <h3 id="notes-title" class="pf-section-title">Seguimiento</h3>
    <form class="pf-inline" @submit.prevent="add">
      <label class="adm-field grow">
        <span class="pf-sr">Nueva nota</span>
        <input v-model="text" class="adm-inp" maxlength="1000" placeholder="Ej. Le llamé, quiere capacitación el lunes" />
      </label>
      <button type="submit" class="adm-btn primary" :disabled="busy || text.trim().length < 2">Anotar</button>
    </form>
    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-if="!items.length" class="pf-muted">Aún no hay notas. Anota llamadas, acuerdos y pendientes para que todo tu equipo lo vea.</p>
    <ul v-else class="pf-timeline">
      <li v-for="n in items" :key="n.id || n.createdAt">
        <span class="dot" aria-hidden="true"></span>
        <div>
          <p>{{ n.text }}</p>
          <small>{{ n.authorName || n.author }}</small>
        </div>
        <time :datetime="n.createdAt" :title="dateTime(n.createdAt)">{{ ago(n.createdAt) }}</time>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, watch } from "vue";
import { apiService } from "../../apiService";
import { ago, dateTime } from "../../platform/format";

const props = defineProps({ tenantId: { type: String, required: true }, notes: { type: Array, default: () => [] } });

const items = ref([...props.notes]);
const text = ref("");
const busy = ref(false);
const error = ref("");
watch(() => props.notes, (n) => (items.value = [...n]));

async function add() {
  busy.value = true;
  error.value = "";
  try {
    const note = await apiService.partnerAddNote(props.tenantId, text.value.trim());
    items.value = [note, ...items.value];
    text.value = "";
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude guardar la nota.";
  } finally {
    busy.value = false;
  }
}
</script>
