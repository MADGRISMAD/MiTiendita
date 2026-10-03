<template>
  <PlatformFrame title="Finanzas" :subtitle="monthText">
    <template #actions>
      <button type="button" class="adm-btn" :disabled="downloading || loading" @click="downloadReport">
        {{ downloading ? "Preparando…" : "Descargar reporte" }}
      </button>
    </template>

    <nav class="adm-tabs main" aria-label="Secciones de finanzas">
      <button v-for="t in TABS" :key="t.id" type="button" :class="{ on: tab === t.id }" :aria-pressed="tab === t.id" @click="setTab(t.id)">
        {{ t.label }}
      </button>
    </nav>

    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>
    <p v-if="loading && !books" class="pf-muted">Cargando números…</p>
    <div v-else-if="books" :class="{ 'adm-loading': loading }">
      <FinanceRevenue v-if="tab === 'ingresos'" :books="books" />
      <FinanceAi v-else-if="tab === 'ia'" :books="books" />
      <FinanceExpenses v-else :books="books" @changed="load" />
    </div>
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import FinanceRevenue from "../../components/platform/FinanceRevenue.vue";
import FinanceAi from "../../components/platform/FinanceAi.vue";
import FinanceExpenses from "../../components/platform/FinanceExpenses.vue";
import { apiService } from "../../apiService";

const route = useRoute();
const router = useRouter();

const TABS = [
  { id: "ingresos", label: "Ingresos" },
  { id: "ia", label: "Gasto de IA" },
  { id: "gastos", label: "Otros gastos" },
];
const tab = computed(() => (TABS.some((t) => t.id === route.query.v) ? route.query.v : "ingresos"));
function setTab(id) {
  router.replace({ query: { v: id === "ingresos" ? undefined : id } }).catch(() => {});
}

const books = ref(null);
const loading = ref(true);
const error = ref("");
const downloading = ref(false);

const monthText = computed(() => {
  const key = books.value?.month;
  if (!key) return "Los números del mes";
  const d = new Date(`${key}-01T12:00:00`);
  const s = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    books.value = await apiService.platformOverview();
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar los números.";
  } finally {
    loading.value = false;
  }
}

async function downloadReport() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    const html = await apiService.platformReport();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    if (!window.open(url, "_blank")) {
      const link = document.createElement("a");
      link.href = url;
      link.download = `timber-reporte-${books.value?.month || "mes"}.html`;
      link.click();
    }
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude preparar el reporte.";
  } finally {
    downloading.value = false;
  }
}

onMounted(load);
</script>
