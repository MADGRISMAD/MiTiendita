<template>
  <header class="tk-head">
    <!-- Toldo a rayas de la tiendita, en tinta negra para impresora térmica -->
    <svg class="tk-awning" viewBox="0 0 160 27" aria-hidden="true">
      <rect x="0" y="0" width="160" height="4" fill="#000" />
      <g v-for="i in 8" :key="i">
        <path
          :d="`M${(i - 1) * 20} 4h20v12a10 10 0 0 1 -20 0z`"
          :fill="i % 2 ? '#000' : '#fff'"
          stroke="#000"
          stroke-width="1.2"
        />
      </g>
    </svg>
    <p class="tk-shop">{{ name }}</p>
    <p class="tk-kind"><span>{{ kind }}</span></p>
    <p v-if="address" class="tk-addr">{{ address }}</p>
    <p v-if="phone" class="tk-addr">Tel. {{ phone }}</p>
  </header>
</template>

<script setup>
import { computed } from "vue";
import { venueStore } from "../venueStore";
import { BUSINESS_TYPE_LABEL } from "../ticketShell";

// Sin props usa los datos guardados; con props sirve de vista previa (Configuración)
const props = defineProps({
  preview: { type: Object, default: null },
});
const src = computed(() => props.preview || venueStore);
const name = computed(() => src.value.businessName || "Mi Tiendita");
const kind = computed(() => BUSINESS_TYPE_LABEL[src.value.businessType] || BUSINESS_TYPE_LABEL.abarrotes);
const address = computed(() => src.value.address || "");
const phone = computed(() => src.value.phone || "");
</script>

<style scoped>
.tk-head {
  display: grid;
  justify-items: center;
  gap: 0.6mm;
  text-align: center;
}
.tk-awning {
  display: block;
  width: calc(100% + 2 * var(--tk-pad));
  height: auto;
  margin: 0 calc(-1 * var(--tk-pad)) 2.5mm;
}
.tk-shop {
  margin: 0;
  max-width: 100%;
  font-size: 1.75em;
  font-weight: 900;
  line-height: 1.02;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}
.tk-kind {
  display: flex;
  align-items: center;
  gap: 2mm;
  width: 100%;
  margin: 0.4mm 0 0.6mm;
  font-size: 0.78em;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.tk-kind::before,
.tk-kind::after {
  content: "";
  flex: 1;
  border-top: 1px solid #000;
}
.tk-kind span { white-space: nowrap; }
.tk-addr {
  margin: 0;
  font-size: 0.86em;
  line-height: 1.3;
}
</style>
