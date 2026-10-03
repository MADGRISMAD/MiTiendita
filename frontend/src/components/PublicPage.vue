<template>
  <div class="pub">
    <header class="pub-bar">
      <router-link to="/" class="pub-brand" aria-label="Mi Tiendita, ir al inicio">
        <img src="/logo.svg" alt="" width="32" height="32" />
        <BrandName tone="dark" />
      </router-link>
      <nav class="pub-nav" aria-label="Páginas">
        <router-link v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</router-link>
      </nav>
      <router-link v-if="loggedIn" class="pub-cta" :to="{ name: homeRoute }">Volver al sistema</router-link>
      <router-link v-else class="pub-cta" to="/register">Probar gratis</router-link>
    </header>

    <section class="pub-hero">
      <div class="pub-wrap">
        <slot name="hero" />
      </div>
    </section>

    <main class="pub-wrap pub-main">
      <slot />
    </main>

    <footer class="pub-foot">
      <div class="pub-wrap">
        <router-link to="/">Inicio</router-link>
        <router-link v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</router-link>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from "vue";
import BrandName from "./BrandName.vue";
import { authStore, homeForRole } from "../authStore";

const links = [
  { to: "/ayuda", label: "Ayuda" },
  { to: "/terminos", label: "Términos" },
  { to: "/privacidad", label: "Privacidad" },
];
const loggedIn = computed(() => Boolean(authStore.token));
const homeRoute = computed(() => homeForRole());
</script>

<style scoped>
.pub {
  /* El body no desplaza (POS a pantalla completa): este contenedor sí */
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-family: var(--font-sans);
  scroll-behavior: smooth;
}
.pub-wrap {
  width: min(100%, 62rem);
  margin: 0 auto;
  padding: 0 1.15rem;
}

.pub-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 1.15rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06);
}
.pub-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  font-weight: 800;
  margin-right: auto;
}
.pub-nav {
  display: flex;
  gap: 0.25rem;
}
.pub-nav a {
  color: var(--timber-topbar-text);
  opacity: 0.75;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
}
.pub-nav a:hover { opacity: 1; background: rgba(255, 255, 255, 0.08); }
.pub-nav a.router-link-active { opacity: 1; background: rgba(255, 255, 255, 0.14); }
.pub-cta {
  background: var(--timber-accent);
  color: #1a1208;
  text-decoration: none;
  font-weight: 800;
  font-size: 0.88rem;
  border-radius: 999px;
  padding: 0.5rem 1rem;
  white-space: nowrap;
}

.pub-hero {
  background:
    radial-gradient(60rem 18rem at 85% -40%, color-mix(in srgb, var(--timber-accent) 38%, transparent), transparent),
    linear-gradient(160deg, var(--timber-topbar), color-mix(in srgb, var(--timber-primary) 55%, var(--timber-topbar)));
  color: var(--timber-topbar-text);
  padding: 2.6rem 0 3.4rem;
}
.pub-hero :deep(.kicker) {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--timber-accent);
}
.pub-hero :deep(h1) {
  margin: 0.35rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4.5vw, 2.7rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.1;
}
.pub-hero :deep(.lede) {
  margin: 0.7rem 0 0;
  max-width: 36rem;
  opacity: 0.8;
  line-height: 1.55;
}

.pub-main {
  /* sube sobre el hero para que la tarjeta "flote" */
  margin-top: -1.8rem;
  padding-bottom: 3rem;
  position: relative;
}

.pub-foot {
  border-top: 1px solid var(--timber-line);
  padding: 1.25rem 0 2rem;
  color: var(--timber-muted);
}
.pub-foot .pub-wrap { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
.pub-foot a { color: var(--timber-primary); font-weight: 700; text-decoration: none; font-size: 0.9rem; }
.pub-foot a:hover { text-decoration: underline; }

@media (max-width: 40rem) {
  .pub-nav { display: none; }
}
</style>
