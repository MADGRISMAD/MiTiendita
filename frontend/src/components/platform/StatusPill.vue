<template>
  <span class="adm-pill" :class="status.tone">{{ status.label }}</span>
</template>

<script setup>
import { computed } from "vue";
import { statusOf } from "../../platform/format";

const props = defineProps({ client: { type: Object, required: true } });
const status = computed(() => statusOf(props.client));
</script>
