<template>
  <Teleport to="body">
    <div v-if="brandLoader.active" class="bl-bg" role="status" aria-live="polite" aria-label="Preparando tu experiencia">
      <div class="bl-card">
        <div class="bl-logo" :class="{ done: brandLoader.done }">
          <span class="bl-ring" aria-hidden="true"></span>
          <img v-if="brandLoader.logo" :src="brandLoader.logo" alt="" />
        </div>
        <h2>Preparando tu experiencia</h2>
        <p class="bl-step">{{ brandLoader.done ? "¡Listo! Estos son los colores de tu tienda." : BRAND_STEPS[brandLoader.step] }}</p>
        <div class="bl-bar" aria-hidden="true"><i :class="{ done: brandLoader.done }" :style="{ width: brandLoader.done ? '100%' : `${(brandLoader.step + 0.4) * 30}%` }"></i></div>
        <div class="bl-swatches" :class="{ show: brandLoader.done }" aria-hidden="true">
          <span><i :style="{ background: brandLoader.primary }"></i>Principal</span>
          <span><i :style="{ background: brandLoader.accent }"></i>Detalles</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { BRAND_STEPS, brandLoader } from "../brandTheme";
</script>

<style scoped>
.bl-bg {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: grid;
  place-items: center;
  padding: 1.2rem;
  background: radial-gradient(120% 120% at 50% 0%, #1a2a44 0%, #0a1220 70%);
  color: #f0f4fa;
  animation: bl-in 0.3s ease both;
}
.bl-card { display: grid; justify-items: center; gap: 0.7rem; width: min(24rem, 100%); text-align: center; }
.bl-logo { position: relative; width: 6.5rem; height: 6.5rem; display: grid; place-items: center; }
.bl-logo img { position: relative; z-index: 1; width: 5rem; height: 5rem; object-fit: contain; border-radius: 1.1rem; background: #fff; padding: 0.4rem; }
.bl-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.14);
  border-top-color: #fff;
  animation: bl-spin 1s linear infinite;
}
.bl-logo.done .bl-ring { animation: none; border-color: #6ce9a6; }
h2 { margin: 0.3rem 0 0; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em; }
.bl-step { margin: 0; min-height: 1.4em; color: rgba(240, 244, 250, 0.78); font-size: 0.95rem; }
.bl-bar { width: 100%; height: 0.35rem; margin-top: 0.4rem; border-radius: 999px; background: rgba(255, 255, 255, 0.14); overflow: hidden; }
.bl-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5b9ae8, #fff); transition: width 1s ease; }
.bl-bar i.done { background: #6ce9a6; transition-duration: 0.4s; }
.bl-swatches { display: flex; gap: 1.4rem; margin-top: 0.6rem; opacity: 0; transform: translateY(6px); transition: opacity 0.4s ease, transform 0.4s ease; }
.bl-swatches.show { opacity: 1; transform: none; }
.bl-swatches span { display: grid; justify-items: center; gap: 0.35rem; font-size: 0.78rem; color: rgba(240, 244, 250, 0.8); }
.bl-swatches i { width: 3rem; height: 3rem; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.85); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); }
@keyframes bl-spin { to { transform: rotate(360deg); } }
@keyframes bl-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .bl-ring { animation-duration: 3s; }
  .bl-bg { animation: none; }
  .bl-bar i, .bl-swatches { transition: none; }
}
</style>
