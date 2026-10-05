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
// Marco de las pantallas del portal de socios: misma barra de la app y encabezado que la plataforma.
import AppShell from "../AppShell.vue";
import "../../admin.css";
import "../../platform.css";

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
});
</script>
