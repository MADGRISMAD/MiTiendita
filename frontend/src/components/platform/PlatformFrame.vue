<template>
  <AppShell>
    <div class="adm pf">
      <header class="adm-head">
        <div>
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="$slots.actions" class="adm-acts">
          <slot name="actions" />
        </div>
      </header>
      <slot />
    </div>
  </AppShell>
</template>

<script setup>
// Marco común de las pantallas de plataforma: barra superior de la app + encabezado.
// Mientras está abierto mantiene al día el contador de tickets por responder de la navegación.
import { onMounted, onUnmounted } from "vue";
import AppShell from "../AppShell.vue";
import "../../admin.css";
import "../../platform.css";
import { watchWaiting, stopWatchingWaiting } from "../../platform/platformStore";

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
});

onMounted(watchWaiting);
onUnmounted(stopWatchingWaiting);
</script>
