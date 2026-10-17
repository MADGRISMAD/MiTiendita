<template>
  <section ref="root" class="hero2" aria-label="Mi Tiendita, punto de venta en la nube">
    <div class="layer grid-bg" aria-hidden="true"></div>
    <div class="layer glow" aria-hidden="true"></div>

    <!-- Texto -->
    <div class="copy">
      <a class="news" href="#inventario-magico">
        <span class="news-tag">Nuevo</span>
        Inventario Mágico: toma foto a la nota del proveedor y se carga sola
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </a>
      <h1>
        <span class="h1-a">Cobra rápido.</span>
        <span class="h1-b">Controla todo.</span>
      </h1>
      <p class="sub">
        El punto de venta en la nube para abarrotes, farmacias y ferreterías. Cobra desde celular, tablet o PC, lleva tu
        inventario al día y sigue vendiendo aunque se vaya el internet.
      </p>
      <div class="ctas">
        <router-link v-if="!loggedIn" class="btn primary" to="/register">
          Crear mi tienda gratis
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </router-link>
        <router-link v-else class="btn primary" :to="{ name: homeRoute }">
          Abrir caja
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </router-link>
        <a class="btn ghost" href="#planes">Planes desde ${{ basicPrice }} al mes</a>
      </div>
      <p class="note">3 días de prueba gratis sin tarjeta. Clientes nuevos: primeros 3 meses a un tercio del precio.</p>
      <nav class="giros" aria-label="Punto de venta para tu giro">
        <router-link v-for="g in giros" :key="g.to" :to="g.to" class="giro">{{ g.t }}</router-link>
      </nav>
    </div>

    <!-- Pantalla de venta -->
    <div ref="stage" class="stage" :style="{ '--k': k }">
      <div class="clip">
        <div class="scaler">
          <div class="tilt">
            <div class="frame"><HeroPos /></div>
          </div>
        </div>
      </div>

      <div class="float f-right" aria-hidden="true">
        <div class="f-row">
          <span class="f-ok">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <span class="f-txt"><strong>Pago aprobado</strong><small>Terminal Mercado Pago</small></span>
        </div>
        <div class="f-amount">
          <small>Tarjeta •••• 4821</small>
          <span>$1,240.00</span>
        </div>
      </div>

      <div class="float f-left" aria-hidden="true">
        <div class="f-head"><small>Ventas de hoy</small><em>Corte listo</em></div>
        <div class="f-big">$8,420.00</div>
        <svg viewBox="0 0 240 70" width="100%" height="70" class="f-chart">
          <defs>
            <linearGradient id="hero-mtg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#2d6be4" stop-opacity=".45" />
              <stop offset="1" stop-color="#2d6be4" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 58 C24 54 36 46 60 48 S96 30 120 34 S160 22 180 18 S220 8 240 4 L240 70 L0 70Z" fill="url(#hero-mtg)" />
          <path d="M0 58 C24 54 36 46 60 48 S96 30 120 34 S160 22 180 18 S220 8 240 4" fill="none" stroke="#2d6be4" stroke-width="2" />
        </svg>
        <div class="f-axis"><span>8:00</span><span>12:00</span><span>16:00</span><span>20:00</span></div>
      </div>
    </div>

    <!-- Equipo -->
    <div class="equip">
      <p class="equip-title">Funciona con el equipo que ya tienes</p>
      <ul class="equip-grid">
        <li v-for="h in hw" :key="h.t">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a94a8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="h.d" /></svg>
          {{ h.t }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import HeroPos from "./HeroPos.vue";
import { useHeroParallax } from "../../heroParallax";
import { PRICES } from "../../seo/site.mjs";
import "../../landing-fonts.css";

defineProps({
  loggedIn: { type: Boolean, default: false },
  homeRoute: { type: String, default: "pos" },
});

const basicPrice = (PRICES.find((p) => p.id === "basic")?.month || 349).toLocaleString("es-MX");

const root = ref(null);
const stage = ref(null);
const k = ref(1);
useHeroParallax(root);

// La pantalla se diseñó a 1176 px de ancho: en pantallas angostas se reduce completa, sin recortarla
const SCREEN_W = 1176;
let ro = null;
onMounted(() => {
  const clip = stage.value?.querySelector(".clip");
  if (!clip || typeof ResizeObserver === "undefined") return;
  const fit = () => {
    k.value = Math.max(0.26, Math.min(1, clip.clientWidth / SCREEN_W));
  };
  ro = new ResizeObserver(fit);
  ro.observe(clip);
  fit();
});
onUnmounted(() => ro?.disconnect());

const giros = [
  { t: "Abarrotes", to: "/punto-de-venta-para-abarrotes" },
  { t: "Farmacias", to: "/punto-de-venta-para-farmacia" },
  { t: "Ferreterías", to: "/punto-de-venta-para-ferreteria" },
  { t: "Papelerías", to: "/punto-de-venta-para-papeleria" },
  { t: "Con báscula", to: "/punto-de-venta-con-bascula" },
  { t: "Sin internet", to: "/punto-de-venta-sin-internet" },
];

const hw = [
  { t: "Lector de código de barras", d: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M14 8v8M17 8v8" },
  { t: "Báscula", d: "M4 20h16l-2-10H6zM12 10V6M9 6h6M10 15h4" },
  { t: "Impresora térmica 80 mm", d: "M7 9V3h10v6M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M7 14h10v7H7z" },
  { t: "Terminal Mercado Pago", d: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8v5H8zM9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01" },
  { t: "Celular y tablet", d: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" },
  { t: "PC o laptop", d: "M4 5h16v10H4zM2 19h20" },
];
</script>

<style scoped>
/* Las capas se mueven con las variables que escribe heroParallax.js:
   --sy (px de scroll), --tp (0..1, pantalla que se abre), --mx/--my (puntero, -1..1). */
.hero2 {
  --hero-accent: #2d6be4;
  --sy: 0;
  --tp: 0;
  --mx: 0;
  --my: 0;
  position: relative;
  /* sube bajo la nav pegajosa: la cuadrícula y el brillo llegan hasta arriba */
  margin-top: -72px;
  padding-top: 72px;
  overflow: hidden;
  background: #070b14;
  color: #eef2f8;
  font-family: "Geist", system-ui, sans-serif;
  /* la app trae un interletrado global que ensancha el texto de este diseño */
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
}
.layer {
  position: absolute;
  pointer-events: none;
  will-change: transform;
}
.grid-bg {
  inset: 0 0 auto 0;
  height: 900px;
  background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 64px 64px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
  transform: translate3d(0, calc(var(--sy) * 0.3px), 0);
}
.glow {
  left: 50%;
  top: 520px;
  width: 1400px;
  max-width: 200vw;
  height: 700px;
  background: radial-gradient(closest-side, rgba(45, 107, 228, 0.25), transparent);
  transform: translate3d(-50%, calc(var(--sy) * 0.5px), 0);
}

/* ─── Texto ─── */
.copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
  max-width: 980px;
  margin: 0 auto;
  padding: 72px 32px 64px;
  text-align: center;
  transform: translate3d(0, calc(var(--sy) * 0.12px), 0);
  /* se apaga solo cuando la pantalla ya ocupa el lugar del texto */
  opacity: calc(1 - (var(--tp) - 0.45) * 1);
}
.news {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px 6px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #c9d1de;
  font-size: 13px;
  text-align: left;
  text-decoration: none;
  transition: transform 0.15s ease, background 0.15s ease;
}
.news:hover { transform: translateY(-1px); background: rgba(255, 255, 255, 0.07); color: #fff; }
.news-tag {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--hero-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
}
h1 {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
}
.h1-a {
  padding-bottom: 0.06em;
  background: linear-gradient(180deg, #fff 30%, #aeb8ca 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: clamp(46px, 7.6vw, 104px);
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: -0.06em;
}
.h1-b {
  color: #f5a524;
  font-family: "Instrument Serif", Georgia, serif;
  font-size: clamp(52px, 8.4vw, 116px);
  font-style: italic;
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.02em;
}
.sub {
  max-width: 620px;
  margin: 0;
  color: #a3adc0;
  font-size: 19px;
  line-height: 1.55;
}
.ctas {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding-top: 6px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 15px 24px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 500;
  text-decoration: none;
  transition: transform 0.15s ease, background 0.15s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn.primary {
  background: #fff;
  color: #070b14;
  box-shadow: 0 0 0 1px #fff, 0 8px 30px -6px rgba(255, 255, 255, 0.25);
}
.btn.ghost {
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
  color: #eef2f8;
}
.btn.ghost:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.btn:focus-visible,
.news:focus-visible,
.giro:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}
.note { margin: 0; color: #6f7a8f; font-size: 13px; }
.giros {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding-top: 10px;
}
.giro {
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #a3adc0;
  font-size: 13px;
  text-decoration: none;
  transition: transform 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.giro:hover { transform: translateY(-1px); color: #fff; border-color: rgba(255, 255, 255, 0.2); }

/* ─── Pantalla ─── */
.stage {
  position: relative;
  max-width: 1240px;
  height: calc(700px * var(--k, 1));
  margin: 0 auto;
  padding: 0 32px;
}
.clip {
  position: absolute;
  inset: 0 32px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 80%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 80%, transparent 100%);
}
.scaler {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1176px;
  margin-left: -588px;
  transform: scale(var(--k, 1));
  transform-origin: 50% 0;
}
.tilt {
  transform: perspective(2400px) rotateX(calc(12deg * (1 - var(--tp))));
  transform-origin: 50% 0;
  will-change: transform;
}
.frame {
  padding: 8px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 40px 120px -30px #000;
}

/* ─── Tarjetas flotantes (cada una a su profundidad) ─── */
.float {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(18, 26, 43, 0.92);
  box-shadow: 0 30px 60px -20px #000, inset 0 1px 0 rgba(255, 255, 255, 0.08);
  will-change: transform;
}
.f-right {
  top: 70px;
  right: 0;
  width: 268px;
  gap: 12px;
  transform: translate3d(calc(var(--mx) * -18px), calc(var(--sy) * -0.22px + var(--my) * -10px), 0);
}
.f-left {
  top: 330px;
  left: 0;
  width: 280px;
  gap: 6px;
  padding: 18px;
  transform: translate3d(calc(var(--mx) * 12px), calc(var(--sy) * -0.1px + var(--my) * 8px), 0);
}
.f-row { display: flex; align-items: center; gap: 10px; }
.f-ok {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(61, 214, 140, 0.12);
  color: #3dd68c;
}
.f-txt { display: flex; flex-direction: column; }
.f-txt strong { font-size: 14px; font-weight: 500; }
.f-txt small { color: #8a94a8; font-size: 12px; }
.f-amount {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.f-amount small { color: #8a94a8; font-size: 13px; }
.f-amount span { font-family: "Geist Mono", ui-monospace, monospace; font-size: 18px; }
.f-head { display: flex; justify-content: space-between; align-items: center; }
.f-head small { color: #8a94a8; font-size: 12px; }
.f-head em { color: #3dd68c; font-size: 12px; font-style: normal; font-weight: 500; }
.f-big { font-family: "Geist Mono", ui-monospace, monospace; font-size: 26px; letter-spacing: -0.03em; }
.f-chart { margin-top: 6px; }
.f-axis {
  display: flex;
  justify-content: space-between;
  color: #6f7a8f;
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 11px;
}

/* ─── Equipo ─── */
.equip {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px 32px 96px;
}
.equip-title {
  margin: 0;
  color: #6f7a8f;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: center;
}
.equip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
.equip-grid li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 26px 12px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: #c9d1de;
  font-size: 14px;
  text-align: center;
}

/* ─── Responsive ─── */
@media (max-width: 980px) {
  .float { display: none; }
}
@media (max-width: 640px) {
  .copy { padding: 48px 20px 44px; gap: 22px; }
  .sub { font-size: 17px; }
  .btn { padding: 14px 20px; font-size: 15px; width: 100%; justify-content: center; }
  .ctas { width: 100%; }
  .stage { padding: 0 16px; }
  .clip { inset: 0 16px; }
  .equip { padding: 8px 16px 64px; }
  .equip-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .equip-grid li { padding: 20px 10px; font-size: 13px; }
}

@media (prefers-reduced-motion: reduce) {
  .layer,
  .copy,
  .tilt,
  .float {
    transition: none;
  }
}
</style>
