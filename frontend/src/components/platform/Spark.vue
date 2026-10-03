<template>
  <svg v-if="points.length > 1" class="pf-spark" :class="tone" viewBox="0 0 160 40" preserveAspectRatio="none" role="img" :aria-label="label">
    <path class="area" :d="area" />
    <path :d="line" />
  </svg>
</template>

<script setup>
import { computed } from "vue";

// values: números en orden. Dibuja línea y área; sin ejes (es una pista, no una gráfica).
const props = defineProps({
  values: { type: Array, default: () => [] },
  tone: { type: String, default: "" },
  label: { type: String, default: "Tendencia" },
});

const points = computed(() => {
  const v = props.values.map((n) => Number(n) || 0);
  if (v.length < 2) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  return v.map((n, i) => ({ x: (i / (v.length - 1)) * 160, y: 36 - ((n - min) / span) * 32 }));
});
const line = computed(() => points.value.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "));
const area = computed(() => (points.value.length ? `${line.value} L160 40 L0 40 Z` : ""));
</script>
