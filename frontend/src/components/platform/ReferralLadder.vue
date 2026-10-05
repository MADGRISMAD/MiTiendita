<template>
  <div class="pf-ladder">
    <ol class="steps" aria-label="Niveles de comisión">
      <li v-for="(t, i) in ladder" :key="t.from" :class="{ done: !compact && i < current, now: !compact && i === current }" :aria-current="!compact && i === current ? 'step' : undefined">
        <strong>{{ pct(t.rate) }}</strong>
        <small>{{ t.from === 0 ? "al empezar" : `desde ${t.from} ventas` }}</small>
      </li>
    </ol>
    <template v-if="compact"></template>
    <template v-else-if="next">
      <div class="pf-meter" role="img" :aria-label="`Faltan ${next.missing} ventas para subir a ${pct(next.rate)}`">
        <i :style="{ width: progress + '%' }"></i>
      </div>
      <p class="hint">
        Faltan <strong>{{ next.missing }}</strong> {{ next.missing === 1 ? "venta cerrada" : "ventas cerradas" }} para subir a <strong>{{ pct(next.rate) }}</strong>.
      </p>
    </template>
    <p v-else-if="!compact" class="hint"><strong>Nivel máximo.</strong> Gana {{ pct(ladder[ladder.length - 1].rate) }} de cada cobro.</p>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  ladder: { type: Array, required: true },
  closed: { type: Number, default: 0 },
  compact: { type: Boolean, default: false }, // solo la tabla de niveles, sin progreso
});

const current = computed(() => {
  let idx = 0;
  props.ladder.forEach((t, i) => {
    if (props.closed >= t.from) idx = i;
  });
  return idx;
});
const next = computed(() => {
  const n = props.ladder[current.value + 1];
  return n ? { rate: n.rate, from: n.from, missing: n.from - props.closed } : null;
});
const progress = computed(() => {
  if (!next.value) return 100;
  const from = props.ladder[current.value].from;
  return Math.max(4, Math.min(100, ((props.closed - from) / (next.value.from - from)) * 100));
});
const pct = (r) => `${Math.round(r * 100)}%`;
</script>
