<template>
  <div v-if="href" class="wa-help" :class="{ compact }">
    <a :href="href" target="_blank" rel="noopener" class="wa-btn" @click="$emit('open')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"
        />
      </svg>
      <span>{{ label }}</span>
    </a>
    <small class="wa-hours">{{ SUPPORT_HOURS }}</small>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { SUPPORT_HOURS, supportMessage, whatsappLink } from "../support";
import { venueStore } from "../venueStore";
import { authStore } from "../authStore";
import { billingStore } from "../billingStore";

// message: texto propio (landing, licencia perpetua); sin él arma el de ayuda con los datos de la tienda
const props = defineProps({
  label: { type: String, default: "Ayuda por WhatsApp" },
  message: { type: String, default: "" },
  compact: { type: Boolean, default: false },
});
defineEmits(["open"]);

const route = useRoute();
const href = computed(() =>
  whatsappLink(
    props.message ||
      supportMessage({
        businessName: venueStore.businessName,
        tenantId: authStore.tenantId,
        plan: billingStore.planName || billingStore.plan,
        screen: route?.fullPath,
      })
  )
);
</script>

<style scoped>
.wa-help {
  display: grid;
  justify-items: start;
  gap: 0.3rem;
}
.wa-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.55rem 1rem;
  border-radius: 0.8rem;
  background: #1f8f4e;
  color: #fff;
  font-weight: 800;
  text-decoration: none;
}
.wa-btn:hover {
  background: #187a41;
}
.wa-btn:focus-visible {
  outline: 2px solid #1f8f4e;
  outline-offset: 3px;
}
.wa-hours {
  font-size: 0.78rem;
  color: var(--timber-muted, #667);
}
.compact .wa-btn {
  min-height: 2.4rem;
  padding: 0.45rem 0.8rem;
  font-size: 0.9rem;
}
</style>
