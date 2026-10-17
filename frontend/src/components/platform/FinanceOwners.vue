<template>
  <div class="pf-card-stack">
    <p class="adm-banner" role="note">
      <strong>Solo para los socios.</strong> El soporte y los demás administradores no ven esta pestaña.
    </p>

    <div class="pf-month">
      <button type="button" class="adm-btn sm" aria-label="Mes anterior" @click="shift(-1)">‹</button>
      <input v-model="month" type="month" class="adm-inp" aria-label="Mes" :max="thisMonth" />
      <button type="button" class="adm-btn sm" aria-label="Mes siguiente" :disabled="month >= thisMonth" @click="shift(1)">›</button>
      <button type="button" class="adm-btn" :disabled="!data || downloading" @click="downloadCsv">{{ downloading ? "Preparando…" : "Descargar CSV" }}</button>
    </div>

    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>
    <p v-if="loading && !data" class="pf-muted">Cargando cobros…</p>

    <template v-if="data">
      <div class="adm-kpis" :class="{ 'adm-loading': loading }">
        <div class="adm-kpi good">
          <span>Tu parte del ingreso</span>
          <strong class="pf-num">{{ money(data.perPartner) }}</strong>
          <small>lo cobrado ÷ {{ data.partners }} socios</small>
        </div>
        <div class="adm-kpi">
          <span>Tu parte de la utilidad</span>
          <strong class="pf-num">{{ money(data.profitPerPartner) }}</strong>
          <small>después de IA y gastos ÷ {{ data.partners }}</small>
        </div>
        <div class="adm-kpi">
          <span>Cobrado en el mes</span>
          <strong class="pf-num">{{ money(data.collected) }}</strong>
          <small>{{ data.count }} {{ data.count === 1 ? "cobro" : "cobros" }}</small>
        </div>
        <div v-if="isCurrent && estimated != null" class="adm-kpi" :class="{ warn: Math.abs(estimated - data.collected) > 1 }">
          <span>Estimado por planes</span>
          <strong class="pf-num">{{ money(estimated) }}</strong>
          <small>{{ differenceText }}</small>
        </div>
      </div>

      <section class="adm-card pf-card-stack">
        <div class="adm-card-head">
          <div>
            <h2>Cómo sale tu parte</h2>
            <p>Partes iguales entre los {{ data.partners }} socios. No descuenta comisiones de vendedores ni comisiones de Mercado Pago.</p>
          </div>
        </div>
        <dl class="pf-split">
          <div><dt>Cobrado</dt><dd>{{ money(data.collected) }}</dd></div>
          <div><dt>Gasto de IA</dt><dd>− {{ money(data.costs.ai) }}</dd></div>
          <div><dt>Otros gastos</dt><dd>− {{ money(data.costs.expenses) }}</dd></div>
          <div class="sum"><dt>Utilidad</dt><dd>{{ money(data.profit) }}</dd></div>
          <div class="sum"><dt>÷ {{ data.partners }} = por socio</dt><dd>{{ money(data.profitPerPartner) }}</dd></div>
        </dl>
      </section>

      <section class="adm-card pf-card-stack">
        <div class="adm-card-head"><div><h2>Cobros del mes</h2><p>Cada pago recibido, con su origen.</p></div></div>
        <p v-if="!data.payments.length" class="pf-muted">No hay cobros registrados en este mes.</p>
        <div v-else class="pf-table-wrap">
          <table class="pf-table">
            <thead>
              <tr><th scope="col">Fecha</th><th scope="col">Tienda</th><th scope="col">Plan</th><th scope="col">Origen</th><th scope="col" class="num">Monto</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in data.payments" :key="p.id">
                <td>{{ dateOf(p.at) }}</td>
                <td><router-link :to="{ name: 'platformClient', params: { id: p.tenantId } }">{{ p.businessName }}</router-link></td>
                <td>{{ p.planName }} · {{ p.interval === "year" ? "anual" : "mensual" }}</td>
                <td>{{ p.source === "mercado_pago" ? "Mercado Pago" : "Manual" }}<small v-if="p.note && p.source === 'manual'" class="pf-muted"> · {{ p.note }}</small></td>
                <td class="num">{{ money(p.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { apiService } from "../../apiService";
import { saveBlob } from "../../download";
import { money } from "../../platform/format";

const props = defineProps({ books: { type: Object, required: true } });

const thisMonth = props.books.month;
const month = ref(thisMonth);
const data = ref(null);
const loading = ref(false);
const error = ref("");
const downloading = ref(false);

const isCurrent = computed(() => month.value === thisMonth);
// El estimado (precio de cada plan activo) solo tiene sentido para el mes en curso
const estimated = computed(() => (isCurrent.value ? props.books.revenue : null));
const differenceText = computed(() => {
  if (estimated.value == null || !data.value) return "";
  const diff = Math.round((data.value.collected - estimated.value) * 100) / 100;
  if (Math.abs(diff) <= 1) return "coincide con lo cobrado";
  return diff > 0 ? `se ha cobrado ${money(diff)} más` : `faltan ${money(-diff)} por cobrar este mes`;
});

function shift(delta) {
  const [y, m] = month.value.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  month.value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const dateOf = (v) => new Date(v).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");

async function load() {
  if (!/^\d{4}-\d{2}$/.test(month.value)) return;
  loading.value = true;
  error.value = "";
  try {
    data.value = await apiService.platformPayments(month.value);
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar los cobros.";
  } finally {
    loading.value = false;
  }
}
async function downloadCsv() {
  downloading.value = true;
  try {
    saveBlob(await apiService.platformPaymentsCsv(month.value), `cobros_${month.value}.csv`);
  } catch {
    error.value = "No pude descargar el archivo.";
  } finally {
    downloading.value = false;
  }
}
watch(month, load);
onMounted(load);
</script>

<style scoped>
.pf-month { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.pf-month .adm-inp { width: auto; }
.pf-split { margin: 0; display: grid; gap: 0.35rem; }
.pf-split > div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
.pf-split dt { opacity: 0.8; }
.pf-split dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.pf-split .sum dt, .pf-split .sum dd { font-weight: 800; opacity: 1; }
</style>
