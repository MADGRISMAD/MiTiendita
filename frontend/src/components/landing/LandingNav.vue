<template>
  <header ref="el" class="lnav" :class="{ solid: scrolled }">
    <div class="lnav-in">
      <div class="lnav-left">
        <a href="#top" class="brand" aria-label="Mi Tiendita, inicio">
          <img src="/logo.svg" alt="" width="32" height="32" />
          <BrandName tone="dark" />
        </a>
        <nav class="links" aria-label="Secciones">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#inventario-magico">La Magia</a>
          <a href="#por-que-nube">¿Por qué nube?</a>
          <a href="#planes">Planes</a>
          <a href="#proveedores">Sé proveedor</a>
        </nav>
      </div>
      <div class="actions">
        <router-link v-if="loggedIn" class="pill" :to="{ name: homeRoute }">Ir al sistema</router-link>
        <template v-else>
          <router-link class="signin" to="/login">Ingresar</router-link>
          <router-link class="pill" to="/register">Prueba gratis</router-link>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import BrandName from "../BrandName.vue";
import "../../landing-fonts.css";

defineProps({
  loggedIn: { type: Boolean, default: false },
  homeRoute: { type: String, default: "pos" },
});

const el = ref(null);
const scrolled = ref(false);
let scroller = null;

// El scroll vive en el contenedor .landing: la barra se vuelve de vidrio al bajar del hero
function onScroll() {
  scrolled.value = scroller.scrollTop > 24;
}

onMounted(() => {
  scroller = el.value?.closest(".landing");
  if (!scroller) return;
  scroller.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
onUnmounted(() => scroller?.removeEventListener("scroll", onScroll));
</script>

<style scoped>
.lnav {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 72px;
  border-bottom: 1px solid transparent;
  font-family: "Geist", system-ui, sans-serif;
  letter-spacing: 0;
  transition: background-color 0.25s ease, border-color 0.25s ease, backdrop-filter 0.25s ease;
}
.lnav.solid {
  background: rgba(7, 11, 20, 0.82);
  border-bottom-color: rgba(255, 255, 255, 0.08);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
}
.lnav-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  height: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 32px;
}
.lnav-left { display: flex; align-items: center; gap: 44px; min-width: 0; }
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  font-size: 20px;
  text-decoration: none;
}
.brand img { border-radius: 8px; }
.links { display: none; gap: 30px; font-size: 14px; }
.links a {
  color: #a3adc0;
  text-decoration: none;
  transition: color 0.15s;
}
.links a:hover { color: #fff; }
.actions { display: flex; align-items: center; gap: 6px; flex: none; }
.signin {
  padding: 9px 14px;
  color: #a3adc0;
  font-size: 14px;
  text-decoration: none;
  transition: color 0.15s;
}
.signin:hover { color: #fff; }
.pill {
  padding: 9px 16px;
  border-radius: 999px;
  background: #fff;
  color: #070b14;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  text-decoration: none;
  transition: transform 0.15s ease;
}
.pill:hover { transform: translateY(-1px); }
.pill:focus-visible,
.signin:focus-visible,
.links a:focus-visible,
.brand:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
  border-radius: 8px;
}

@media (min-width: 981px) {
  .links { display: flex; }
}
@media (max-width: 640px) {
  .lnav-in { padding: 0 16px; gap: 12px; }
  .signin { display: none; }
  .brand { font-size: 18px; gap: 8px; }
  .brand img { width: 28px; height: 28px; }
}
</style>
