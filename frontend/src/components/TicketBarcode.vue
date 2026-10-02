<template>
  <figure v-if="code.bars.length" class="tk-barcode">
    <svg
      :viewBox="`0 0 ${code.width} 40`"
      preserveAspectRatio="none"
      shape-rendering="crispEdges"
      role="img"
      :aria-label="`Código de barras ${value}`"
    >
      <rect v-for="(b, i) in code.bars" :key="i" :x="b.x" y="0" :width="b.w" height="40" fill="#000" />
    </svg>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<script setup>
import { computed } from "vue";
import { code128Bars } from "../barcode";

const props = defineProps({
  value: { type: String, required: true },
  caption: { type: String, default: "" },
});

const code = computed(() => {
  try {
    return code128Bars(props.value);
  } catch {
    return { bars: [], width: 0 };
  }
});
</script>

<style scoped>
.tk-barcode {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 1mm;
}
.tk-barcode svg {
  display: block;
  width: 46mm;
  max-width: 100%;
  height: 11mm;
}
.tk-barcode figcaption {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.35em;
}
</style>
