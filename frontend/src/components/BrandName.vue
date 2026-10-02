<template>
  <span class="word" :class="tone">
    <span class="mi">Mi</span><span class="rest"> Tiendita</span>
  </span>
</template>

<script setup>
defineProps({
  tone: { type: String, default: "light" },
});
</script>

<style scoped>
.word {
  font-weight: 800;
  letter-spacing: -0.03em;
  white-space: nowrap;
}
.light .mi { color: var(--timber-accent, #e08a1e); }
.light .rest { color: var(--timber-primary, #1e5aa8); }
.dark .mi { color: #f0a94a; }
.dark .rest { color: #ffffff; }
</style>
