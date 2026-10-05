<template>
  <div class="pf-card-stack">
    <button type="button" class="adm-btn sm pf-back" @click="$emit('close')">← Todos los vendedores</button>

    <p v-if="loading && !detail" class="adm-card pf-muted">Abriendo al vendedor…</p>
    <p v-else-if="error && !detail" class="adm-banner err" role="alert">{{ error }}</p>

    <section v-else-if="detail" class="adm-card pf-card-stack">
      <div class="pf-detail-head">
        <ClientAvatar :name="detail.name" size="3rem" />
        <div class="pf-grow">
          <h2>{{ detail.name }}</h2>
          <div class="meta" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem">
            <span class="adm-pill" :class="detail.status === 'active' ? 'good' : 'warn'">{{ detail.status === "active" ? "Activo" : "Pausado" }}</span>
            <span class="pf-chip">{{ Math.round(detail.rate * 100) }}% de comisión</span>
            <span class="pf-chip">{{ detail.code }}</span>
          </div>
        </div>
        <div class="acts">
          <button type="button" class="adm-btn sm" @click="showEdit = true">Editar</button>
          <button type="button" class="adm-btn sm" :class="detail.status === 'active' ? 'danger-ghost' : 'primary'" :disabled="busy" @click="toggle">
            {{ detail.status === "active" ? "Pausar" : "Reactivar" }}
          </button>
        </div>
      </div>

      <nav class="adm-tabs" aria-label="Secciones del vendedor">
        <button v-for="t in TABS" :key="t.id" type="button" :class="{ on: tab === t.id }" :aria-pressed="tab === t.id" @click="setTab(t.id)">
          {{ t.label }}<em v-if="t.count != null" :class="{ alert: t.id === 'cobros' && t.count }">{{ t.count }}</em>
        </button>
      </nav>

      <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
      <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>
      <p v-if="detail.status !== 'active'" class="adm-banner warn" role="status">
        Está pausado: su código ya no sirve para registros nuevos. Sus tiendas actuales siguen generándole comisión.
      </p>

      <ReferrerSummaryTab v-if="tab === 'resumen'" :detail="detail" />
      <ReferrerClientsTab v-else-if="tab === 'clientes'" :detail="detail" />
      <ReferrerCommissionsTab v-else :detail="detail" @changed="refresh" />
    </section>

    <ReferrerDialog v-if="showEdit" :referrer="detail" @close="showEdit = false" @saved="saved" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ClientAvatar from "./ClientAvatar.vue";
import ReferrerSummaryTab from "./ReferrerSummaryTab.vue";
import ReferrerClientsTab from "./ReferrerClientsTab.vue";
import ReferrerCommissionsTab from "./ReferrerCommissionsTab.vue";
import ReferrerDialog from "./ReferrerDialog.vue";
import { apiService } from "../../apiService";

const props = defineProps({ id: { type: String, required: true } });
const emit = defineEmits(["close", "updated"]);

const route = useRoute();
const router = useRouter();

const detail = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const ok = ref("");
const showEdit = ref(false);

const tab = computed(() => (["resumen", "clientes", "cobros"].includes(route.query.v) ? route.query.v : "resumen"));
const TABS = computed(() => [
  { id: "resumen", label: "Resumen" },
  { id: "clientes", label: "Clientes", count: detail.value?.clients ?? null },
  { id: "cobros", label: "Cobros", count: detail.value?.pendingCount ?? null },
]);
function setTab(v) {
  router.replace({ query: { ...route.query, v: v === "resumen" ? undefined : v } }).catch(() => {});
}

function say(message) {
  ok.value = message;
  setTimeout(() => (ok.value = ""), 5000);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    detail.value = await apiService.platformReferrer(props.id);
    emit("updated", detail.value);
  } catch (e) {
    detail.value = null;
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude abrir a ese vendedor.";
  } finally {
    loading.value = false;
  }
}

async function refresh(message) {
  await load();
  if (message) say(message);
}

function saved(next) {
  showEdit.value = false;
  detail.value = next;
  emit("updated", next);
  say("Cambios guardados.");
}

async function toggle() {
  busy.value = true;
  error.value = "";
  try {
    detail.value = await apiService.platformUpdateReferrer(props.id, { status: detail.value.status === "active" ? "paused" : "active" });
    emit("updated", detail.value);
    say(detail.value.status === "active" ? "Vendedor reactivado." : "Vendedor pausado.");
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cambiar su estado.";
  } finally {
    busy.value = false;
  }
}

watch(() => props.id, load, { immediate: true });
</script>
