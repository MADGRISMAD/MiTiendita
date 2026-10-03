<template>
  <div class="pf-card-stack">
    <div class="adm-kpis">
      <div class="adm-kpi warn">
        <span>Gasto estimado de IA</span>
        <strong class="pf-num">{{ money(books.ai.cost) }}</strong>
        <small>{{ money(books.ai.costPerUse) }} por uso</small>
      </div>
      <div class="adm-kpi">
        <span>Usos del mes</span>
        <strong class="pf-num">{{ books.ai.uses }}</strong>
        <small>Inventario y Precio Mágico</small>
      </div>
      <div class="adm-kpi">
        <span>Clientes que la usaron</span>
        <strong class="pf-num">{{ books.ai.clients.length }}</strong>
        <small>de {{ books.clients.total }} en total</small>
      </div>
    </div>

    <section class="adm-card pf-card-stack">
      <div class="adm-card-head">
        <div>
          <h2>Uso por cliente</h2>
          <p>Cada barra es cuánto de su cupo mensual ya gastó. Rojo: ya lo agotó.</p>
        </div>
      </div>
      <p v-if="!rows.length" class="pf-muted">Este mes nadie ha usado la IA.</p>
      <div v-else class="pf-table-wrap">
        <table class="pf-table">
          <thead><tr><th scope="col">Cliente</th><th scope="col">Cupo usado</th><th scope="col" class="num">Usos</th><th scope="col" class="num">Estimado</th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td><router-link :to="{ name: 'platformClient', params: { id: row.id } }">{{ row.businessName }}</router-link></td>
              <td style="min-width: 10rem">
                <div v-if="row.limit" class="pf-meter" :class="row.tone" :aria-label="`${row.pct}% del cupo`"><i :style="{ width: row.pct + '%' }"></i></div>
                <small v-else class="pf-muted">sin cupo</small>
              </td>
              <td class="num">{{ row.uses }}<small v-if="row.limit" class="pf-muted"> / {{ row.limit }}</small></td>
              <td class="num">{{ money(row.cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="adm-hint">Cada uso cuenta {{ money(books.ai.costPerUse) }}. Es una referencia para Mi Tiendita; el cargo real aparece en la cuenta de Google.</p>
    </section>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { money } from "../../platform/format";

const props = defineProps({ books: { type: Object, required: true } });

// El cupo de cada cliente viene en «cloud» (uses/limit por tienda); el costo, en ai.clients
const rows = computed(() => {
  const limits = new Map((props.books.cloud || []).map((c) => [c.id, Number(c.limit) || 0]));
  return props.books.ai.clients.map((row) => {
    const limit = limits.get(row.id) || 0;
    const pct = limit ? Math.min(100, Math.round((row.uses / limit) * 100)) : 0;
    return { ...row, limit, pct, tone: pct >= 100 ? "bad" : pct >= 80 ? "warn" : "" };
  });
});
</script>
