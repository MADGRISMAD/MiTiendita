<template>
  <div class="auth">
    <aside class="auth-brand">
      <router-link to="/" class="auth-logo" aria-label="Mi Tiendita, ir al inicio">
        <img src="/logo.svg" alt="" width="44" height="44" />
        <BrandName tone="dark" />
      </router-link>

      <div class="auth-pitch">
        <h2>El punto de venta para tu tiendita, farmacia o ferretería.</h2>
        <ul>
          <li>
            <span class="tick" aria-hidden="true">✓</span>
            Cobra rápido con escáner o tocando los productos
          </li>
          <li>
            <span class="tick" aria-hidden="true">✓</span>
            Inventario, caducidades y Registro mágico de compras
          </li>
          <li>
            <span class="tick" aria-hidden="true">✓</span>
            Sigue vendiendo aunque se vaya el internet
          </li>
        </ul>
        <p class="auth-trial">Prueba gratis de 14 días</p>
      </div>

      <p class="auth-foot">En la nube · celular, tablet y computadora</p>
    </aside>

    <main class="auth-main">
      <div class="auth-card">
        <slot />
      </div>
      <p class="auth-legal">
        <router-link to="/terminos">Términos</router-link>
        <span aria-hidden="true">·</span>
        <router-link to="/privacidad">Aviso de privacidad</router-link>
      </p>
    </main>
  </div>
</template>

<script setup>
import BrandName from "./BrandName.vue";
</script>

<style scoped>
.auth {
  /* El body no desplaza (POS a pantalla completa): este contenedor sí */
  position: fixed;
  inset: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: minmax(20rem, 0.9fr) minmax(0, 1.1fr);
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-family: var(--font-sans);
}

.auth-brand {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2rem;
  padding: 2.25rem 2.5rem;
  color: #fff;
  background:
    radial-gradient(ellipse 70% 45% at 10% 10%, rgba(224, 138, 30, 0.28), transparent 60%),
    radial-gradient(ellipse 60% 50% at 95% 95%, rgba(91, 154, 232, 0.35), transparent 60%),
    linear-gradient(160deg, #0a1a30 0%, #123056 45%, #1e5aa8 100%);
}
.auth-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: inherit;
  text-decoration: none;
  font-size: 1.35rem;
}
.auth-logo img { border-radius: 0.8rem; }
.auth-pitch { max-width: 26rem; }
.auth-pitch h2 {
  margin: 0 0 1.4rem;
  font-size: clamp(1.6rem, 2.6vw, 2.15rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.auth-pitch ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
  font-size: 1rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.9);
}
.auth-pitch li {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}
.tick {
  flex-shrink: 0;
  width: 1.45rem;
  height: 1.45rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(240, 169, 74, 0.22);
  color: #f0a94a;
  font-size: 0.8rem;
  font-weight: 800;
}
.auth-trial {
  display: inline-block;
  margin: 1.6rem 0 0;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.88rem;
  font-weight: 700;
}
.auth-foot {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.6);
}

.auth-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2.5rem 1.5rem;
}
.auth-card {
  width: min(27rem, 100%);
  padding: 2rem 1.9rem 1.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 1.25rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.auth-legal {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.8rem;
  color: var(--timber-muted);
}
.auth-legal a {
  color: inherit;
  text-decoration: none;
}
.auth-legal a:hover { text-decoration: underline; }

/* Tablet vertical: marca más angosta */
@media (max-width: 1023.98px) {
  .auth { grid-template-columns: minmax(16rem, 0.75fr) minmax(0, 1.25fr); }
  .auth-brand { padding: 2rem 1.75rem; }
  .auth-pitch ul { font-size: 0.92rem; }
}

/* Celular: la marca se vuelve un encabezado compacto */
@media (max-width: 767.98px) {
  /* Flujo normal: en grid la fila del encabezado se encogía con formularios largos */
  .auth { display: block; }
  .auth-brand {
    position: static;
    height: auto;
    min-height: 0;
    gap: 0;
    padding: 1rem 1.15rem 3.6rem;
  }
  .auth-logo { font-size: 1.15rem; }
  .auth-logo img { width: 36px; height: 36px; }
  .auth-pitch,
  .auth-foot { display: none; }
  .auth-main {
    justify-content: flex-start;
    margin-top: -2.6rem;
    padding: 0 0.85rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  }
  .auth-card {
    padding: 1.4rem 1.15rem 1.2rem;
    border-radius: 1.15rem;
  }
}
</style>
