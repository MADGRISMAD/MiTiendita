<template>
  <main class="nf">
    <div class="nf-card">
      <img src="/logo.svg" alt="Mi Tiendita" class="nf-logo" width="72" height="72" />
      <p class="nf-code">404</p>
      <h1>Esta página no existe</h1>
      <p class="nf-text">
        La dirección <code>{{ path }}</code> no lleva a ningún lado. Puede que el enlace esté mal escrito o que la página ya no exista.
      </p>
      <router-link :to="home.to" class="nf-btn">← {{ home.label }}</router-link>
    </div>
  </main>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { homeForRole, isAuthenticated } from "../authStore";

const route = useRoute();
const path = computed(() => route.fullPath);
// Con sesión regresa a la pantalla principal de su rol; sin sesión, al inicio
const home = computed(() =>
  isAuthenticated() ? { to: { name: homeForRole() }, label: "Volver a la app" } : { to: "/", label: "Volver al inicio" }
);
</script>

<style scoped>
.nf {
  display: grid;
  place-items: center;
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  background:
    radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in srgb, var(--timber-primary) 14%, transparent), transparent 70%),
    var(--timber-surface);
  color: var(--timber-ink);
  font-family: var(--font-sans, system-ui, sans-serif);
}
.nf-card {
  display: grid;
  justify-items: center;
  gap: 0.6rem;
  width: min(28rem, 100%);
  padding: 2rem 1.5rem;
  border: 1px solid var(--timber-line);
  border-radius: 1.25rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
  text-align: center;
}
.nf-logo { width: 4.5rem; height: 4.5rem; border-radius: 1.1rem; }
.nf-code {
  margin: 0.4rem 0 0;
  font-size: 3.2rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--timber-primary);
}
.nf h1 { margin: 0; font-size: 1.35rem; font-weight: 800; }
.nf-text { margin: 0; font-size: 0.95rem; line-height: 1.5; color: var(--timber-muted); }
.nf-text code {
  padding: 0.05rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-size: 0.88em;
  overflow-wrap: anywhere;
}
.nf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
  margin-top: 0.6rem;
  padding: 0 1.4rem;
  border-radius: 0.85rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font-weight: 700;
  text-decoration: none;
}
.nf-btn:hover { background: color-mix(in srgb, var(--timber-primary) 88%, #000); }
</style>
