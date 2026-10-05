<template>
  <PartnerFrame title="Comisiones" :subtitle="subtitle">
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <template v-if="data">
      <div class="adm-kpis" aria-label="Tu dinero">
        <div class="adm-kpi good"><span>Por cobrar</span><strong class="pf-num">{{ money(data.pending) }}</strong><small>{{ data.pendingCount }} cobros pendientes</small></div>
        <div class="adm-kpi"><span>Ya pagado</span><strong class="pf-num">{{ money(data.paid) }}</strong><small>{{ data.payouts.length }} pagos recibidos</small></div>
        <div class="adm-kpi"><span>Ganado en total</span><strong class="pf-num">{{ money(data.earned) }}</strong><small>desde que empezaste</small></div>
        <div class="adm-kpi"><span>Tu comisión</span><strong class="pf-num">{{ Math.round(data.rate * 100) }}%</strong><small>{{ data.closedSales }} ventas cerradas</small></div>
      </div>

      <section class="adm-card pf-card-stack" aria-labelledby="clvl-title">
        <div class="adm-card-head">
          <div>
            <h2 id="clvl-title">Cómo sube tu comisión</h2>
            <p>Cada tienda que paga por primera vez cuenta como venta cerrada. Cada cobro usa tu nivel de ese momento.</p>
          </div>
        </div>
        <ReferralLadder :ladder="data.ladder" :closed="data.closedSales" />
      </section>

      <section class="adm-card pf-card-stack" aria-labelledby="cl-title">
        <h2 id="cl-title" class="pf-section-title">Cobros de tus tiendas</h2>
        <p v-if="!data.commissions.length" class="pf-muted">Cuando una de tus tiendas pague, aquí verás tu comisión.</p>
        <div v-else class="pf-table-wrap">
          <table class="pf-table">
            <thead>
              <tr><th scope="col">Fecha</th><th scope="col">Tienda</th><th scope="col" class="num">Cobro</th><th scope="col" class="num">Tu comisión</th><th scope="col">Estado</th></tr>
            </thead>
            <tbody>
              <tr v-for="c in data.commissions" :key="c.id" :class="{ void: c.status === 'void' }">
                <td>{{ shortDate(c.createdAt) }}</td>
                <td><router-link :to="{ name: 'partnerClient', params: { id: c.tenantId } }">{{ c.businessName || "Tienda" }}</router-link></td>
                <td class="num">{{ money(c.amount) }}</td>
                <td class="num"><strong>{{ money(c.commission) }}</strong> <small class="pf-muted">({{ Math.round(c.rate * 100) }}%)</small></td>
                <td><span class="adm-pill" :class="STATUS[c.status].tone">{{ STATUS[c.status].label }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="data.payouts.length" class="adm-card pf-card-stack" aria-labelledby="po-title">
        <h2 id="po-title" class="pf-section-title">Pagos que has recibido</h2>
        <ul class="pf-list">
          <li v-for="p in data.payouts" :key="p.id" class="pf-row static">
            <span class="body">
              <span class="top"><strong>{{ money(p.total) }}</strong><time :datetime="p.paidAt">{{ dateTime(p.paidAt) }}</time></span>
              <span class="sub">{{ p.count }} cobros</span>
              <span v-if="p.note" class="prev">{{ p.note }}</span>
            </span>
          </li>
        </ul>
      </section>
    </template>
    <p v-else-if="loading" class="adm-card pf-muted">Cargando…</p>
  </PartnerFrame>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PartnerFrame from "../../components/partner/PartnerFrame.vue";
import ReferralLadder from "../../components/platform/ReferralLadder.vue";
import { apiService } from "../../apiService";
import { dateTime, money, shortDate } from "../../platform/format";

const STATUS = { pending: { label: "Por cobrar", tone: "warn" }, paid: { label: "Pagada", tone: "good" }, void: { label: "Anulada", tone: "" } };

const data = ref(null);
const loading = ref(true);
const error = ref("");
const subtitle = computed(() => (data.value ? `Código ${data.value.code}` : ""));

onMounted(async () => {
  try {
    data.value = await apiService.partnerCommissions();
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar tus comisiones.";
  } finally {
    loading.value = false;
  }
});
</script>
