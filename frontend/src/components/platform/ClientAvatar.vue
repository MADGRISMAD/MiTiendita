<template>
  <span class="pf-avatar" :style="{ '--h': hue, width: size, height: size }" aria-hidden="true">{{ text }}</span>
</template>

<script setup>
import { computed } from "vue";
import { hueOf, initials } from "../../platform/format";

const props = defineProps({
  name: { type: String, default: "" },
  size: { type: String, default: "2.5rem" },
});
const hue = computed(() => hueOf(props.name));
const text = computed(() => initials(props.name));
</script>
