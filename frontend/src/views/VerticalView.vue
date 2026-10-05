<template>
  <PublicPage>
    <template #hero>
      <nav class="crumbs" aria-label="Ruta">
        <router-link to="/">Mi Tiendita</router-link>
        <span aria-hidden="true">›</span>
        <span>{{ page.h1 }}</span>
      </nav>
      <h1>{{ page.h1 }}</h1>
      <p class="lede">{{ page.lead }}</p>
      <div class="cta">
        <router-link class="btn primary" to="/register">Probar 14 días gratis</router-link>
        <router-link class="btn" :to="{ path: '/', hash: '#planes' }">Ver precios</router-link>
      </div>
      <p class="promo">Clientes nuevos: primeros 3 meses a 1/3 del precio. Sin tarjeta para la prueba.</p>
    </template>

    <section class="grid" aria-label="Beneficios">
      <article v-for="s in page.sections" :key="s.h2" class="card">
        <h2>{{ s.h2 }}</h2>
        <p>{{ s.p }}</p>
      </article>
    </section>

    <section class="card" aria-labelledby="inc-title">
      <h2 id="inc-title">Todo lo que incluye Mi Tiendita</h2>
      <ul class="checks">
        <li v-for="f in FEATURES" :key="f">{{ f }}</li>
      </ul>
    </section>

    <section class="card" aria-labelledby="price-title">
      <h2 id="price-title">Precios</h2>
      <div class="prices">
        <div v-for="p in PRICES" :key="p.id" class="price">
          <strong>{{ p.name }}</strong>
          <span><b>${{ p.month.toLocaleString("es-MX") }}</b> al mes</span>
          <small>o ${{ p.year.toLocaleString("es-MX") }} al año</small>
        </div>
      </div>
      <p class="muted">Precios en MXN con IVA. 14 días de prueba gratis; los clientes nuevos pagan sus primeros 3 meses a un tercio del precio.</p>
    </section>

    <section class="card" aria-labelledby="faq-title">
      <h2 id="faq-title">Preguntas frecuentes</h2>
      <details v-for="f in page.faq" :key="f.q" class="faq">
        <summary>{{ f.q }}</summary>
        <p>{{ f.a }}</p>
      </details>
    </section>

    <section class="card" aria-labelledby="more-title">
      <h2 id="more-title">Mi Tiendita para otros giros</h2>
      <ul class="others">
        <li v-for="v in others" :key="v.slug">
          <router-link :to="`/${v.slug}`">{{ v.h1 }}</router-link>
        </li>
      </ul>
    </section>

    <div class="final card">
      <h2>Empieza hoy</h2>
      <p>Crea tu tienda en un minuto y cobra desde el celular, la tablet o la PC que ya tienes.</p>
      <router-link class="btn primary" to="/register">Crear mi tienda gratis</router-link>
    </div>
  </PublicPage>
</template>

<script setup>
import { computed } from "vue";
import PublicPage from "../components/PublicPage.vue";
import { COMMON_FEATURES as FEATURES, PRICES, VERTICALS } from "../seo/site.mjs";

const props = defineProps({ slug: { type: String, required: true } });
const page = computed(() => VERTICALS.find((v) => v.slug === props.slug) || VERTICALS[0]);
const others = computed(() => VERTICALS.filter((v) => v.slug !== props.slug));
</script>

<style scoped>
.crumbs { display: flex; gap: 0.4rem; font-size: 0.82rem; font-weight: 700; color: rgba(255, 255, 255, 0.75); margin-bottom: 0.6rem; }
.crumbs a { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
h1 { margin: 0; font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -0.035em; line-height: 1.1; }
.lede { margin: 0.7rem 0 0; max-width: 40rem; font-size: 1.05rem; line-height: 1.55; color: rgba(255, 255, 255, 0.88); }
.cta { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.2rem; }
.btn { display: inline-flex; align-items: center; min-height: 2.8rem; padding: 0 1.2rem; border-radius: 0.7rem; font-weight: 800; text-decoration: none; border: 1px solid var(--timber-line); color: var(--timber-ink); background: var(--timber-panel); }
.btn.primary { background: var(--timber-accent); color: #1a1208; border-color: transparent; }
.promo { margin: 0.8rem 0 0; font-size: 0.86rem; font-weight: 700; color: rgba(255, 255, 255, 0.8); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.8rem; }
.card { padding: 1.2rem; border-radius: 1rem; border: 1px solid var(--timber-line); background: var(--timber-panel); }
.card + .card, .grid + .card { margin-top: 0.9rem; }
.card h2 { margin: 0 0 0.4rem; font-size: 1.1rem; font-weight: 800; }
.card p { margin: 0; line-height: 1.55; color: var(--timber-muted); }
.checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 0.45rem 1rem; margin: 0.4rem 0 0; padding: 0; list-style: none; }
.checks li { position: relative; padding-left: 1.4rem; line-height: 1.45; }
.checks li::before { content: "✓"; position: absolute; left: 0; font-weight: 900; color: var(--timber-primary); }
.prices { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.6rem; margin: 0.4rem 0 0.7rem; }
.price { display: grid; gap: 0.15rem; padding: 0.8rem; border-radius: 0.8rem; background: var(--timber-surface); }
.price b { font-size: 1.3rem; }
.price small, .muted { color: var(--timber-muted); font-size: 0.85rem; }
.faq { border-top: 1px solid var(--timber-line); padding: 0.7rem 0; }
.faq summary { cursor: pointer; font-weight: 800; }
.faq p { margin-top: 0.4rem; }
.others { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.others a { display: inline-block; padding: 0.45rem 0.8rem; border-radius: 999px; background: var(--timber-surface); color: var(--timber-primary); font-weight: 700; text-decoration: none; }
.final { text-align: center; }
.final .btn { margin-top: 0.8rem; }
</style>
