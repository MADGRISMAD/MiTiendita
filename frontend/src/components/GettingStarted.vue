<template>
  <section v-if="visible" class="gs">
    <div class="gs-head">
      <div>
        <p class="kicker">Primeros pasos</p>
        <h3>Deja la tienda lista para cobrar</h3>
      </div>
      <button v-if="canDismiss" type="button" class="ghost" @click="dismiss">Ocultar</button>
    </div>
    <ol>
      <li v-for="step in steps" :key="step.id" :class="{ done: step.done }">
        <span class="mark" aria-hidden="true">{{ step.done ? "✓" : "" }}</span>
        <span>{{ step.label }}</span>
        <router-link v-if="!step.done && step.to" :to="step.to">Ir</router-link>
      </li>
    </ol>
    <div v-if="showSeed" class="seed-row">
      <button type="button" class="seed" :disabled="seeding" @click="seed">
        {{ seeding ? "Cargando…" : "Cargar 8 productos de ejemplo" }}
      </button>
      <p>Coca, agua, leche, huevo… para probar la caja hoy. Luego los editas.</p>
    </div>
    <p v-if="err" class="err">{{ err }}</p>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { apiService } from "../apiService";
import { hasRole } from "../authStore";

const emit = defineEmits(["seeded"]);

const data = ref(null);
const seeding = ref(false);
const err = ref("");

const steps = computed(() => data.value?.steps || []);
const remaining = computed(() => data.value?.remaining ?? 0);
const canDismiss = computed(() => hasRole("admin") && remaining.value > 0);
const showSeed = computed(
  () => hasRole("admin") && data.value && !data.value.productCount && !data.value.starterSeeded
);
const visible = computed(() => {
  if (!data.value) return false;
  if (data.value.complete) return false;
  if (data.value.dismissed && remaining.value > 0) return false;
  return remaining.value > 0;
});

async function load() {
  try {
    data.value = await apiService.getOnboarding();
  } catch {
    data.value = null;
  }
}

async function seed() {
  seeding.value = true;
  err.value = "";
  try {
    await apiService.seedStarterCatalog();
    await load();
    emit("seeded");
  } catch (e) {
    const raw = e.response?.data;
    err.value = typeof raw === "string" ? raw : raw?.message || "No se pudo cargar el catálogo.";
  } finally {
    seeding.value = false;
  }
}

async function dismiss() {
  try {
    await apiService.dismissOnboarding();
    if (data.value) data.value.dismissed = true;
  } catch {
    /* ignore */
  }
}

onMounted(load);

defineExpose({ reload: load });
</script>

<style scoped>
.gs {
  padding: 1rem 1.05rem;
  border-radius: 1rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  box-shadow: var(--timber-shadow);
  margin-bottom: 0.9rem;
}
.gs-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.7rem;
}
.kicker {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--timber-accent);
}
h3 {
  margin: 0.15rem 0 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
}
ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
li {
  display: grid;
  grid-template-columns: 1.4rem 1fr auto;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.9rem;
  color: var(--timber-ink);
}
li.done { color: var(--timber-muted); text-decoration: line-through; }
.mark {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 1.5px solid var(--timber-line);
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--timber-success);
}
li.done .mark {
  background: var(--timber-success-soft);
  border-color: transparent;
}
a { color: var(--timber-primary); font-weight: 800; font-size: 0.82rem; text-decoration: none; }
.ghost {
  border: none;
  background: transparent;
  color: var(--timber-muted);
  font-weight: 700;
  cursor: pointer;
  font-size: 0.8rem;
}
.seed-row { margin-top: 0.85rem; display: grid; gap: 0.35rem; }
.seed-row p { margin: 0; font-size: 0.8rem; color: var(--timber-muted); }
.seed {
  border: none;
  border-radius: 0.7rem;
  min-height: 2.5rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font-weight: 800;
  cursor: pointer;
}
.seed:disabled { opacity: 0.6; }
.err { margin: 0.5rem 0 0; color: var(--timber-danger); font-size: 0.85rem; }
</style>
