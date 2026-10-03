<template>
  <figure class="pf-viz pf-card-stack" style="margin: 0">
    <div class="pf-tools" style="justify-content: space-between">
      <div class="pf-legend" aria-label="Series de la gráfica">
        <span><i class="k1"></i>Ingresos</span>
        <span><i class="k2"></i>Gastos (IA y otros)</span>
      </div>
      <button type="button" class="adm-btn sm" :aria-pressed="asTable" @click="asTable = !asTable">
        {{ asTable ? "Ver gráfica" : "Ver como tabla" }}
      </button>
    </div>

    <div v-if="!asTable" class="wrap" style="position: relative">
      <svg
        class="pf-chart"
        :viewBox="`0 0 ${W} ${H}`"
        role="group"
        aria-label="Ingresos y gastos de los últimos meses"
        @pointerleave="hover = -1"
      >
        <g>
          <template v-for="t in ticks" :key="t.value">
            <line class="grid" :x1="M.l" :x2="W - M.r" :y1="t.y" :y2="t.y" />
            <text :x="M.l - 8" :y="t.y + 4" text-anchor="end">{{ short(t.value) }}</text>
          </template>
        </g>
        <g v-for="(m, i) in months" :key="m.month" :class="{ hot: hover === i }">
          <path v-if="m.revenue != null && m.revenue > 0" class="bar s1" :d="bar(m.x1, m.revenue)" />
          <path v-if="m.cost > 0" class="bar s2" :d="bar(m.x2, m.cost)" />
          <text v-if="m.last && m.revenue != null && m.revenue > 0" class="val" :x="m.x1 + BAR" :y="yOf(m.revenue) - 6" text-anchor="end">{{ short(m.revenue) }}</text>
          <text v-if="m.last && m.cost > 0" class="val" :x="m.x2" :y="yOf(m.cost) - 6" text-anchor="start">{{ short(m.cost) }}</text>
          <text :x="m.cx" :y="H - 8" text-anchor="middle">{{ m.label }}</text>
        </g>
        <line class="base" :x1="M.l" :x2="W - M.r" :y1="yOf(0)" :y2="yOf(0)" />
        <!-- El hit target es toda la columna del mes: más grande que las barras y alcanzable con teclado -->
        <rect
          v-for="(m, i) in months"
          :key="'hit' + m.month"
          class="band"
          :x="m.bx"
          :y="M.t"
          :width="band"
          :height="H - M.t - M.b"
          tabindex="0"
          role="img"
          :aria-label="describe(m)"
          @pointerenter="hover = i"
          @pointermove="hover = i"
          @focus="hover = i"
          @blur="hover = -1"
        />
      </svg>
      <div v-if="tip" class="pf-tip" :style="{ left: tip.left, top: tip.top }" role="status">
        <strong>{{ tip.title }}</strong>
        <div class="row"><span><i class="key k1"></i>Ingresos</span><b>{{ tip.revenue }}</b></div>
        <div class="row"><span><i class="key k2"></i>Gastos</span><b>{{ tip.cost }}</b></div>
        <div class="row"><span>Ganancia</span><b>{{ tip.profit }}</b></div>
        <div class="row"><span>Altas nuevas</span><b>{{ tip.signups }}</b></div>
      </div>
    </div>

    <div v-else class="pf-table-wrap">
      <table class="pf-table">
        <caption class="pf-sr">Ingresos, gastos y ganancia por mes</caption>
        <thead>
          <tr><th scope="col">Mes</th><th scope="col" class="num">Ingresos</th><th scope="col" class="num">IA</th><th scope="col" class="num">Otros gastos</th><th scope="col" class="num">Ganancia</th><th scope="col" class="num">Altas</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in trend" :key="t.month">
            <th scope="row" style="text-align: left">{{ t.label }} {{ t.month.slice(0, 4) }}</th>
            <td class="num">{{ t.revenue == null ? "sin registro" : money(t.revenue) }}</td>
            <td class="num">{{ money(t.aiCost) }}</td>
            <td class="num">{{ money(t.expenses) }}</td>
            <td class="num">{{ t.profit == null ? "—" : money(t.profit) }}</td>
            <td class="num">{{ t.signups }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <figcaption class="adm-hint">
      Los meses anteriores a que existiera el registro mensual aparecen sin ingresos. La ganancia es ingresos menos IA y gastos.
    </figcaption>
  </figure>
</template>

<script setup>
import { computed, ref } from "vue";
import { money } from "../../platform/format";

const props = defineProps({ trend: { type: Array, default: () => [] } });

const W = 640;
const H = 260;
const M = { l: 52, r: 12, t: 22, b: 30 };
const BAR = 22; // máximo 24 px por barra
const GAP = 2; // hueco de 2 px entre barras que se tocan

const hover = ref(-1);
const asTable = ref(false);

const cost = (t) => (Number(t.aiCost) || 0) + (Number(t.expenses) || 0);
const maxValue = computed(() => Math.max(1, ...props.trend.map((t) => Math.max(Number(t.revenue) || 0, cost(t)))));

// Eje con números redondos (0, 1,000, 2,000…)
const niceMax = computed(() => {
  const raw = maxValue.value;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => (s * 4) >= raw) || pow * 10;
  return step * 4;
});
const yOf = (v) => M.t + (1 - v / niceMax.value) * (H - M.t - M.b);
const ticks = computed(() => [0, 1, 2, 3, 4].map((i) => ({ value: (niceMax.value / 4) * i, y: yOf((niceMax.value / 4) * i) })));

const band = computed(() => (W - M.l - M.r) / Math.max(1, props.trend.length));
const months = computed(() =>
  props.trend.map((t, i) => {
    const bx = M.l + i * band.value;
    const cx = bx + band.value / 2;
    return {
      ...t,
      cost: cost(t),
      bx,
      cx,
      x1: cx - BAR - GAP / 2,
      x2: cx + GAP / 2,
      last: i === props.trend.length - 1,
    };
  })
);

/** Columna con punta redondeada de 4 px y base recta sobre la línea cero. */
function bar(x, value) {
  const top = yOf(value);
  const base = yOf(0);
  const h = Math.max(0, base - top);
  const r = Math.min(4, h, BAR / 2);
  return `M${x} ${base} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + BAR - r} Q${x + BAR} ${top} ${x + BAR} ${top + r} V${base} Z`;
}

const short = (v) => (v >= 1000 ? `$${(v / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`);

const describe = (m) =>
  `${m.label} ${m.month.slice(0, 4)}: ingresos ${m.revenue == null ? "sin registro" : money(m.revenue)}, gastos ${money(m.cost)}, ganancia ${m.profit == null ? "sin dato" : money(m.profit)}`;

const tip = computed(() => {
  const m = months.value[hover.value];
  if (!m) return null;
  return {
    left: `${(m.cx / W) * 100}%`,
    top: `${(Math.min(yOf(m.revenue || 0), yOf(m.cost)) / H) * 100}%`,
    title: `${m.label} ${m.month.slice(0, 4)}`,
    revenue: m.revenue == null ? "sin registro" : money(m.revenue),
    cost: money(m.cost),
    profit: m.profit == null ? "—" : money(m.profit),
    signups: m.signups,
  };
});
</script>
