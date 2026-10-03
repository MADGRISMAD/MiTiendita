<template>
  <div class="pf-card-stack">
    <div class="adm-kpis">
      <div class="adm-kpi good">
        <span>Ganancia del mes</span>
        <strong class="pf-num">{{ money(books.profit) }}</strong>
        <small>ingresos menos IA y gastos</small>
      </div>
      <div class="adm-kpi">
        <span>Ingresos</span>
        <strong class="pf-num">{{ money(books.revenue) }}</strong>
        <small>solo planes activos</small>
      </div>
      <div class="adm-kpi">
        <span>Clientes que pagan</span>
        <strong class="pf-num">{{ books.clients.active }}</strong>
        <small>{{ books.clients.trialing }} en prueba (no suman)</small>
      </div>
      <div class="adm-kpi" :class="{ warn: books.clients.pastDue }">
        <span>Pago atrasado</span>
        <strong class="pf-num">{{ books.clients.pastDue }}</strong>
        <small>{{ books.clients.suspended }} suspendidos</small>
      </div>
    </div>

    <section class="adm-card pf-card-stack">
      <div class="adm-card-head">
        <div>
          <h2>Últimos 6 meses</h2>
          <p>Lo que entró contra lo que costó operar.</p>
        </div>
      </div>
      <TrendChart :trend="books.trend" />
    </section>

    <div class="pf-two even">
      <section class="adm-card pf-card-stack">
        <div class="adm-card-head"><div><h2>Ingresos por plan</h2></div></div>
        <div v-for="plan in books.byPlan" :key="plan.id" class="pf-usage" style="margin-bottom: 0.7rem">
          <span style="font-weight: 700">{{ plan.name }} <small class="pf-muted">· {{ plan.clients }} activos · {{ money(plan.price) }} al mes</small></span>
          <strong class="pf-num">{{ money(plan.amount) }}</strong>
          <div class="pf-meter"><i :style="{ width: share(plan.amount) + '%' }"></i></div>
        </div>
      </section>

      <section class="adm-card pf-card-stack">
        <div class="adm-card-head"><div><h2>Quién está pagando</h2><p>Si el plan es anual, se muestra la parte de este mes.</p></div></div>
        <p v-if="!books.payers.length" class="pf-muted">Todavía no hay planes activos.</p>
        <div v-else class="pf-table-wrap">
          <table class="pf-table">
            <thead><tr><th scope="col">Cliente</th><th scope="col">Plan</th><th scope="col">Cobro</th><th scope="col" class="num">Este mes</th></tr></thead>
            <tbody>
              <tr v-for="row in books.payers" :key="row.id">
                <td><router-link :to="{ name: 'platformClient', params: { id: row.id } }">{{ row.businessName }}</router-link></td>
                <td>{{ row.planName }}</td>
                <td>{{ row.interval === "year" ? "Anual" : "Mensual" }}</td>
                <td class="num">{{ money(row.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import TrendChart from "./TrendChart.vue";
import { money } from "../../platform/format";

const props = defineProps({ books: { type: Object, required: true } });
const share = (amount) => (props.books.revenue ? Math.round((amount / props.books.revenue) * 100) : 0);
</script>
