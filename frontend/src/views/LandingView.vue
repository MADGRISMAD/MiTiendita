<template>
  <div class="landing" ref="root" @scroll.passive="onScroll">
    <div class="sky" aria-hidden="true">
      <span class="sheet s1" :style="drift(0.16)"></span>
      <span class="sheet s2" :style="drift(0.28)"></span>
      <span class="sheet s3" :style="drift(0.1)"></span>
    </div>

    <header class="nav">
      <a href="#top" class="nav-brand">
        <img src="/logo.svg" alt="" width="36" height="36" />
        <span><BrandName tone="dark" /></span>
      </a>
      <nav class="nav-links" aria-label="Secciones">
        <a href="#como-funciona">Cómo funciona</a>
        <a href="#inventario-magico">La Magia</a>
        <a href="#por-que-nube">¿Por qué nube?</a>
        <a href="#planes">Planes</a>
      </nav>
      <div class="nav-actions">
        <template v-if="loggedIn">
          <router-link class="btn ghost" :to="{ name: homeRoute }">Ir al sistema</router-link>
        </template>
        <template v-else>
          <router-link class="btn ghost" to="/login">Ingresar</router-link>
          <router-link class="btn amber" to="/register">Probar gratis</router-link>
        </template>
      </div>
    </header>

    <main id="top">
      <!-- ═══ HERO ═══ -->
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-copy">
            <p class="eyebrow">Punto de venta en la nube</p>
            <h1>
              Tu tienda no cierra<br />
              aunque la compu falle
            </h1>
            <p class="hero-line">
              Abre caja desde el celular, la tablet o la PC — sin instalar nada.
              Tus ventas, productos y cortes siempre a la mano.
            </p>
            <div class="hero-cta">
              <router-link v-if="!loggedIn" class="btn amber lg" to="/register">
                Probar 14 días gratis
              </router-link>
              <router-link v-else class="btn amber lg" :to="{ name: homeRoute }">
                Abrir caja
              </router-link>
              <a class="btn line lg" href="#inventario-magico">Ver la Magia</a>
            </div>
            <p class="hero-note">Sin tarjeta. Cancela cuando quieras.</p>
          </div>
          <div class="hero-visual" aria-hidden="true" :style="drift(0.08)">
            <div class="shot">
              <div class="shot-top">
                <img src="/logo.svg" alt="" width="18" height="18" />
                <span>Abarrotes López</span>
                <span class="shot-nav on">Vender</span>
                <span class="shot-nav">Productos</span>
                <span class="shot-nav">Caja</span>
                <span class="shot-clock">14:32</span>
              </div>
              <div class="shot-fkeys">
                <span>F2 Anular</span>
                <span>F4 Precio</span>
                <span>F9 Dcto</span>
                <span class="cobrar">F12 Cobrar</span>
              </div>
              <div class="shot-status">
                <span>Abarrotes López</span>
                <span>2 arts</span>
                <span class="hint">Escáner listo</span>
              </div>
              <div class="shot-desk">
                <div class="shot-scan">
                  <span>Código / búsqueda</span>
                  <div>7501234567890</div>
                </div>
                <div class="shot-total">
                  <p>2 arts</p>
                  <p class="lbl">Total</p>
                  <strong>$40.00</strong>
                  <p class="tax">IVA $5.52 · Neto $34.48</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Cant.</th>
                    <th>Descripción</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="on">
                    <td>750123</td>
                    <td>1</td>
                    <td>Coca 600 ml</td>
                    <td>$22.00</td>
                  </tr>
                  <tr>
                    <td>750456</td>
                    <td>1</td>
                    <td>Sabritas</td>
                    <td>$18.00</td>
                  </tr>
                </tbody>
              </table>
              <div class="shot-foot">
                <div>
                  <strong>Coca 600 ml</strong>
                  <span>1 × $22.00 = $22.00</span>
                </div>
                <span class="cobrar">COBRAR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ TRUST STRIP ═══ -->
      <section class="trust-strip" v-if="visible.trust">
        <div class="trust-inner">
          <div class="trust-item">
            <strong>100%</strong>
            <span>en la nube</span>
          </div>
          <div class="trust-item">
            <strong>14 días</strong>
            <span>de prueba gratis</span>
          </div>
          <div class="trust-item">
            <strong>0</strong>
            <span>instalaciones</span>
          </div>
          <div class="trust-item">
            <strong>Desde $349</strong>
            <span>/mes</span>
          </div>
        </div>
      </section>

      <!-- ═══ CÓMO FUNCIONA (dispositivos + explainer) ═══ -->
      <section id="como-funciona" class="band devices-band" ref="secDevices">
        <div class="section">
          <p class="section-kicker">Así de fácil</p>
          <h2>Abres el navegador y ya estás en caja</h2>
          <p class="section-lede">
            No importa si es tu celular viejo, una tablet prestada o la compu del mostrador.
            Entras a Mi Tiendita desde cualquier navegador y empiezas a cobrar.
          </p>
          <div class="device-row" :style="drift(0.05)">
            <figure>
              <div class="device phone">
                <div class="bezel">
                  <span class="notch" aria-hidden="true"></span>
                  <div class="screen">
                    <p>Vender</p>
                    <strong>$40.00</strong>
                  </div>
                </div>
              </div>
              <figcaption>Tu celular</figcaption>
              <p class="device-hint">Cobra en el pasillo o en la fila</p>
            </figure>
            <figure>
              <div class="device tablet">
                <div class="bezel">
                  <span class="cam" aria-hidden="true"></span>
                  <div class="screen">
                    <p>Ticket · 2 arts</p>
                    <strong>$40.00</strong>
                  </div>
                </div>
              </div>
              <figcaption>Una tablet</figcaption>
              <p class="device-hint">Caja compacta y moderna</p>
            </figure>
            <figure>
              <div class="device pc">
                <div class="monitor">
                  <div class="bezel">
                    <div class="screen">
                      <p>Escáner listo</p>
                      <strong class="pay">COBRAR</strong>
                    </div>
                  </div>
                  <span class="neck" aria-hidden="true"></span>
                  <span class="base" aria-hidden="true"></span>
                </div>
              </div>
              <figcaption>La PC del mostrador</figcaption>
              <p class="device-hint">Con escáner e impresora de tickets</p>
            </figure>
          </div>
          <p class="device-fallback">
            <strong>¿Se descompuso un equipo?</strong> Entras desde otro y sigues vendiendo. Así de simple.
          </p>
        </div>
      </section>

      <!-- ═══ INVENTARIO MÁGICO (estrella) ═══ -->
      <section id="inventario-magico" class="band magic" ref="secMagic">
        <div class="section">
          <div class="magic-header">
            <span class="magic-spark" aria-hidden="true">✦</span>
            <p class="section-kicker">Lo que nos hace diferentes</p>
          </div>
          <h2>Inventario Mágico y Precio Mágico</h2>
          <p class="section-lede magic-lede">
            Dos magias, un botón. Pegas un papelito o le tomas foto a la nota del camión:
            el catálogo y los precios se actualizan solos.
          </p>

          <div class="magic-pair">
            <article>
              <p class="pair-kicker">✦ Inventario Mágico</p>
              <h3>Del papelito al anaquel</h3>
              <p>
                Escribes “15 cocas de 600” o subes la foto. Entran piezas, packs y
                productos nuevos — sin buscar renglón por renglón.
              </p>
            </article>
            <article id="precio-magico">
              <p class="pair-kicker">✦ Precio Mágico</p>
              <h3>Si el costo sube, no pierdes margen</h3>
              <p>
                Foto a la factura del proveedor. Si la Coca te costaba $14 y ahora $15.50,
                te avisa y te sugiere el precio al público.
              </p>
            </article>
          </div>

          <div class="magic-flow">
            <article>
              <span class="step">1</span>
              <h3>Escribes o tomas foto</h3>
              <p>"Coca 600ml a 22" o la nota de remisión — como la tengas.</p>
            </article>
            <span class="flow-arrow" aria-hidden="true">→</span>
            <article>
              <span class="step">2</span>
              <h3>La nube lo interpreta</h3>
              <p>Reconoce productos, costos, precios y cantidades.</p>
            </article>
            <span class="flow-arrow" aria-hidden="true">→</span>
            <article>
              <span class="step">3</span>
              <h3>Catálogo y precios listos</h3>
              <p>Inventario Mágico llena el anaquel. Precio Mágico cuida tu ganancia.</p>
            </article>
          </div>

          <div class="magic-demo">
            <div class="magic-demo-input">
              <p class="magic-demo-label">
                <span class="magic-demo-icon" aria-hidden="true">📝</span>
                Tú escribes:
              </p>
              <pre>Coca 600ml a 22
Sabritas a 18
Aceite 1L  48 pesos</pre>
            </div>
            <span class="magic-demo-arrow" aria-hidden="true">
              <span class="arrow-line"></span>
              <span class="arrow-text">La Magia</span>
              <span class="arrow-line"></span>
            </span>
            <div class="magic-demo-output">
              <p class="magic-demo-label">
                <span class="magic-demo-icon" aria-hidden="true">✅</span>
                Tu catálogo:
              </p>
              <ul>
                <li>
                  <span>Coca 600 ml</span>
                  <strong>$22.00</strong>
                </li>
                <li>
                  <span>Sabritas</span>
                  <strong>$18.00</strong>
                </li>
                <li>
                  <span>Aceite 1 L</span>
                  <strong>$48.00</strong>
                </li>
              </ul>
            </div>
          </div>

          <p class="magic-note">
            Cada revisión cuenta como un uso del mes, da igual si es inventario o precio:
            <strong>Básico 50</strong>, <strong>Crecimiento 150</strong> y <strong>Pro 500</strong>.
          </p>
        </div>
      </section>

      <!-- ═══ POR QUÉ NUBE ═══ -->
      <section id="por-que-nube" class="band cloud" ref="secCloud">
        <div class="section">
          <p class="section-kicker">Nunca más "se perdió todo"</p>
          <h2>Tu información vive en la nube, no en un disco duro</h2>
          <p class="section-lede">
            Si la compu se llena de virus, si se va la luz a media venta,
            si el cajero derrama el café en el teclado — no pierdes ni un ticket.
          </p>
          <ul class="pillars">
            <li>
              <span class="pillar-icon" aria-hidden="true">🛡️</span>
              <h3>Se murió la PC — no pasa nada</h3>
              <p>
                Entras desde cualquier otro dispositivo y tu catálogo, ventas y cortes
                siguen ahí. Sin rescates de $500 con el técnico.
              </p>
            </li>
            <li>
              <span class="pillar-icon" aria-hidden="true">🔄</span>
              <h3>Siempre actualizado</h3>
              <p>
                Las mejoras llegan solas al refrescar la página.
                Nada de parches, USB ni "ven a actualizarme el sistema".
              </p>
            </li>
            <li>
              <span class="pillar-icon" aria-hidden="true">📱</span>
              <h3>Revisa desde donde estés</h3>
              <p>
                Ve cuánto se vendió hoy desde tu celular.
                No tienes que esperar al corte de caja de la noche.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- ═══ PLANES ═══ -->
      <section id="planes" class="band plans" ref="secPlans">
        <div class="section">
          <p class="section-kicker">Precios sin letras chiquitas</p>
          <h2>Elige según tu tienda</h2>
          <p class="section-lede">
            14 días de prueba. Sin tarjeta. Cancela cuando quieras. Precios en MXN con IVA.
          </p>

          <div class="billing-toggle" role="group" aria-label="Periodo de pago">
            <span :class="{ on: billingInterval === 'month' }">Mensual</span>
            <button
              type="button"
              class="toggle-track"
              :class="{ annual: billingInterval === 'year' }"
              :aria-pressed="billingInterval === 'year'"
              aria-label="Cambiar a facturación anual"
              @click="billingInterval = billingInterval === 'month' ? 'year' : 'month'"
            >
              <span class="toggle-thumb" />
            </button>
            <span :class="{ on: billingInterval === 'year' }">
              Anual
              <em class="save-pill">Ahorra 2 meses</em>
            </span>
          </div>

          <div class="plan-grid">
            <article v-for="p in plans" :key="p.id" :class="{ hot: p.highlight }">
              <p v-if="p.badge" class="badge">{{ p.badge }}</p>
              <h3>{{ p.name }}</h3>
              <p class="tag">{{ p.tagline }}</p>
              <template v-if="billingInterval === 'month'">
                <p class="price">${{ formatInt(p.price) }} <span>/ mes</span></p>
              </template>
              <template v-else>
                <p class="price">
                  ${{ formatInt(planYearPrice(p)) }}
                  <span>/ año</span>
                </p>
                <p class="price-note">
                  ~${{ formatInt(planMonthlyFromYear(p)) }}/mes · ahorras 2 meses
                </p>
              </template>
              <p class="im-line">
                <InventarioMagicoTerm /> · <InventarioMagicoTerm kind="precio" /> · {{ p.aiQuotaLabel }}
              </p>
              <ul>
                <li v-for="(f, i) in p.features" :key="i">{{ f }}</li>
              </ul>
              <router-link
                class="btn"
                :class="p.highlight ? 'amber' : 'blue'"
                :to="planCtaTo"
              >
                {{ loggedIn ? "Ver en facturación" : "Empezar gratis" }}
              </router-link>
            </article>
          </div>

          <aside class="plan-extra">
            <p>
              ¿Prefieres pagar una sola vez? Hay <strong>licencia perpetua por $7,490</strong>.
            </p>
            <router-link :to="loggedIn ? { name: 'billing' } : '/register?plan=perpetual'">
              Más información →
            </router-link>
            <p v-if="!loggedIn" class="perpetual-note">Regístrate y actívala desde Facturación → Soporte.</p>
          </aside>
        </div>
      </section>

      <!-- ═══ HARDWARE ═══ -->
      <section id="hardware" class="band hardware" ref="secHardware">
        <div class="section">
          <p class="section-kicker">¿No tienes equipo?</p>
          <h2>Te lo vendemos e instalamos</h2>
          <p class="section-lede">
            Puedes usar lo que ya tienes: tu celular, una tablet vieja o la PC del mostrador.
            Pero si quieres algo nuevo, nosotros lo armamos todo.
          </p>
          <div class="hw-grid">
            <div class="hw-card">
              <span class="hw-icon" aria-hidden="true">📱</span>
              <h4>Tablet para caja</h4>
              <p>Compacta, rápida y bonita en el mostrador.</p>
            </div>
            <div class="hw-card">
              <span class="hw-icon" aria-hidden="true">🖨️</span>
              <h4>Impresora de tickets</h4>
              <p>80 mm, térmica, conexión USB o Bluetooth.</p>
            </div>
            <div class="hw-card">
              <span class="hw-icon" aria-hidden="true">📷</span>
              <h4>Escáner de códigos</h4>
              <p>Lee códigos de barras al instante.</p>
            </div>
            <div class="hw-card">
              <span class="hw-icon" aria-hidden="true">🖥️</span>
              <h4>Terminal All-in-One</h4>
              <p>Todo integrado: pantalla, impresora y escáner.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ CTA FINAL ═══ -->
      <section class="band final-cta">
        <div class="section">
          <h2>Tu tienda merece un sistema que no te deje tirado</h2>
          <p>
            Prueba Mi Tiendita 14 días. Si no te convence, cancelas y listo — sin cobros, sin letras chiquitas.
          </p>
          <div class="final-cta-actions">
            <router-link v-if="!loggedIn" class="btn amber lg" to="/register">
              Crear cuenta gratis
            </router-link>
            <router-link v-else class="btn amber lg" :to="{ name: homeRoute }">
              Ir al sistema
            </router-link>
          </div>
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="foot-brand">
        <BrandName />
        <p>Punto de venta en la nube para abarrotes y tiendas de barrio.</p>
      </div>
      <div class="foot-links">
        <router-link to="/login">Ingresar</router-link>
        <router-link to="/register">Registro</router-link>
        <router-link to="/terminos">Términos</router-link>
        <router-link to="/privacidad">Privacidad</router-link>
      </div>
    </footer>
  </div>
</template>

<script setup>
import BrandName from "../components/BrandName.vue";
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { apiService } from "../apiService";
import { authStore, homeForRole } from "../authStore";
import InventarioMagicoTerm from "../components/InventarioMagicoTerm.vue";

const route = useRoute();
const root = ref(null);
const scrollY = ref(0);
const reduceMotion = ref(false);
let raf = 0;
let pendingScroll = 0;
const plans = ref([]);
const billingInterval = ref("month");
const loggedIn = computed(() => Boolean(authStore.token));
const homeRoute = computed(() => homeForRole());
const planCtaTo = computed(() => {
  if (loggedIn.value) {
    return {
      name: "billing",
      query: billingInterval.value === "year" ? { interval: "year" } : undefined,
    };
  }
  return "/register";
});

const visible = ref({
  trust: false,
  devices: false,
  magic: false,
  cloud: false,
  plans: false,
  hardware: false,
});

const secDevices = ref(null);
const secMagic = ref(null);
const secCloud = ref(null);
const secPlans = ref(null);
const secHardware = ref(null);

let observer = null;

function formatInt(n) {
  return Number(n || 0).toLocaleString("es-MX");
}

function planYearPrice(p) {
  return p.priceYear ?? Math.round(Number(p.price || 0) * 10);
}

function planMonthlyFromYear(p) {
  return p.monthlyFromYear ?? Math.round(planYearPrice(p) / 12);
}

function drift(speed) {
  if (reduceMotion.value) return undefined;
  const y = Math.round(scrollY.value * speed * -1);
  return { transform: `translate3d(0, ${y}px, 0)` };
}

function onScroll(event) {
  pendingScroll = event?.target?.scrollTop || 0;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    scrollY.value = pendingScroll;
    raf = 0;
  });
}

const fallbackPlans = [
  {
    id: "basic",
    name: "Básico",
    tagline: "Para la tiendita que quiere dejar el cuaderno",
    price: 349,
    priceYear: 3490,
    monthlyFromYear: 291,
    aiQuotaLabel: "50 al mes",
    highlight: false,
    badge: null,
    features: [
      "1 sucursal · 2 usuarios",
      "Hasta 250 productos",
      "Inventario Mágico: lista o foto al catálogo",
      "Precio Mágico: IA ajusta costos y precio al público",
      "50 usos de magia al mes",
      "Tickets 80 mm",
    ],
  },
  {
    id: "growth",
    name: "Crecimiento",
    tagline: "Más cajeros, más productos, más control",
    price: 599,
    priceYear: 5990,
    monthlyFromYear: 499,
    aiQuotaLabel: "150 al mes",
    highlight: true,
    badge: "Más popular",
    features: [
      "Todo lo del Básico",
      "6 usuarios · 1,500 productos",
      "Inventario Mágico: lista o foto al catálogo",
      "Precio Mágico: IA ajusta costos y precio al público",
      "150 usos de magia al mes",
      "Cobro en pasillo con el celular",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para tiendas con catálogo grande y proveedores",
    price: 899,
    priceYear: 8990,
    monthlyFromYear: 749,
    aiQuotaLabel: "500 al mes",
    highlight: false,
    badge: null,
    features: [
      "Todo lo de Crecimiento",
      "20 usuarios · productos ilimitados",
      "Inventario Mágico: lista o foto al catálogo",
      "Precio Mágico: IA ajusta costos y precio al público",
      "500 usos de magia al mes",
      "Lee fotos de facturas de proveedores",
    ],
  },
];

async function loadPlans() {
  try {
    const res = await apiService.getBillingPlans();
    plans.value = res.plans?.length ? res.plans : fallbackPlans;
  } catch {
    plans.value = fallbackPlans;
  }
}

function scrollToHash() {
  const hash = route.hash?.replace("#", "");
  if (!hash) return;
  nextTick(() => {
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setupIntersectionObserver() {
  if (reduceMotion.value) {
    Object.keys(visible.value).forEach((k) => (visible.value[k] = true));
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.dataset.reveal;
        if (id && id in visible.value) {
          visible.value[id] = true;
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, root: root.value }
  );

  const sectionMap = {
    devices: secDevices,
    magic: secMagic,
    cloud: secCloud,
    plans: secPlans,
    hardware: secHardware,
  };

  Object.entries(sectionMap).forEach(([key, elRef]) => {
    if (elRef.value) {
      elRef.value.dataset.reveal = key;
      observer.observe(elRef.value);
    }
  });

  setTimeout(() => (visible.value.trust = true), 200);
}

onMounted(async () => {
  reduceMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  await loadPlans();
  scrollToHash();
  nextTick(setupIntersectionObserver);
});

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
  if (observer) observer.disconnect();
});

watch(() => route.hash, scrollToHash);
</script>

<style scoped>
/* ═══════════════════════════════════════════
   LAYOUT & BACKGROUND
   ═══════════════════════════════════════════ */
.landing {
  position: relative;
  height: 100%;
  overflow: auto;
  background: transparent;
  color: var(--timber-ink);
  font-family: var(--font-sans);
}

.sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background: var(--timber-surface);
}
.sheet {
  position: absolute;
  left: -15%;
  width: 130%;
  height: 22rem;
  filter: blur(28px);
  will-change: transform;
}
.s1 {
  top: 6%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--timber-primary) 26%, transparent) 45%,
    transparent 100%
  );
}
.s2 {
  top: 46%;
  height: 16rem;
  background: linear-gradient(
    100deg,
    transparent 8%,
    color-mix(in srgb, var(--timber-primary) 16%, transparent) 50%,
    transparent 92%
  );
}
.s3 {
  top: 78%;
  height: 20rem;
  background: linear-gradient(
    80deg,
    color-mix(in srgb, var(--timber-topbar) 12%, transparent),
    transparent 75%
  );
}

.nav,
main,
.foot {
  position: relative;
  z-index: 1;
}

/* ═══════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════ */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.45rem 1rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
}
.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: #fff;
  font-weight: 800;
  font-family: var(--font-display);
  font-size: 1.05rem;
}
.nav-brand img { border-radius: 0.4rem; }
.nav-links { display: none; gap: 1rem; }
.nav-links a {
  color: color-mix(in srgb, var(--timber-topbar-text) 72%, transparent);
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 700;
  transition: color 0.15s;
}
.nav-links a:hover { color: #fff; }
.nav-actions { margin-left: auto; display: flex; gap: 0.4rem; }
@media (min-width: 880px) {
  .nav-links { display: flex; }
  .nav { padding-inline: 1.5rem; }
}

/* ═══════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════ */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.35rem;
  padding: 0 0.9rem;
  border-radius: 0.55rem;
  font-weight: 800;
  font-size: 0.86rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
}
.btn:hover { transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.btn.lg { min-height: 2.85rem; padding: 0 1.25rem; font-size: 0.95rem; }
.btn.blue {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.btn.amber {
  background: var(--timber-accent);
  color: #1a1208;
  box-shadow: 0 4px 14px rgba(224, 138, 30, 0.3);
}
.btn.amber:hover { box-shadow: 0 6px 20px rgba(224, 138, 30, 0.4); }
.btn.ghost {
  background: transparent;
  color: var(--timber-topbar-text);
  border: 1px solid rgba(255, 255, 255, 0.22);
}
.btn.line {
  background: var(--timber-panel);
  color: var(--timber-ink);
  border: 1px solid var(--timber-line);
}

/* ═══════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════ */
.hero {
  position: relative;
  z-index: 1;
  padding: 2.5rem 1.15rem 3rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
  overflow: hidden;
}
.hero .btn.line {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.hero .btn.line:hover {
  background: rgba(255, 255, 255, 0.08);
}
.hero-inner {
  max-width: 68rem;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  align-items: center;
}
@media (min-width: 960px) {
  .hero { padding: 3.5rem 1.75rem 4rem; }
  .hero-inner { grid-template-columns: 0.9fr 1.1fr; gap: 2.5rem; }
}
.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--timber-accent);
}
.hero h1 {
  margin: 0.5rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 5.5vw, 3.2rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.08;
  color: #ffffff;
}
.hero-line {
  margin: 1rem 0 0;
  max-width: 26rem;
  font-size: 1.05rem;
  line-height: 1.5;
  color: #c8d8ec;
}
.hero-cta {
  margin-top: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.hero-note {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: rgba(200, 216, 236, 0.6);
  font-weight: 600;
}

/* ═══════════════════════════════════════════
   TRUST STRIP
   ═══════════════════════════════════════════ */
.trust-strip {
  position: relative;
  z-index: 2;
  background: var(--timber-panel);
  border-bottom: 1px solid var(--timber-line);
  animation: fadeUp 0.5s ease both;
}
.trust-inner {
  max-width: 58rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  padding: 1rem 1.15rem;
}
@media (min-width: 640px) {
  .trust-inner { grid-template-columns: repeat(4, 1fr); }
}
.trust-item {
  text-align: center;
  padding: 0.5rem 0.25rem;
}
.trust-item strong {
  display: block;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--timber-primary);
}
.trust-item span {
  font-size: 0.78rem;
  color: var(--timber-muted);
  font-weight: 600;
}

/* ═══════════════════════════════════════════
   SHARED SECTION STYLES
   ═══════════════════════════════════════════ */
.band {
  position: relative;
  z-index: 1;
}
.section {
  position: relative;
  z-index: 1;
  max-width: 58rem;
  margin: 0 auto;
  padding: 3rem 1.15rem;
  scroll-margin-top: 4rem;
  will-change: transform;
}
.section-kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--timber-primary);
}
.section h2 {
  margin: 0.3rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 2.6vw, 1.9rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}
.section-lede {
  margin: 0.6rem 0 0;
  max-width: 36rem;
  color: var(--timber-muted);
  font-size: 1rem;
  line-height: 1.55;
}

/* ═══════════════════════════════════════════
   DEVICES SECTION
   ═══════════════════════════════════════════ */
.device-row {
  margin-top: 2rem;
  display: grid;
  gap: 1.5rem;
  justify-items: center;
}
@media (min-width: 800px) {
  .device-row { grid-template-columns: repeat(3, 1fr); align-items: end; }
}
.device-row figure { margin: 0; text-align: center; }
.device-row figcaption {
  margin-top: 0.75rem;
  font-weight: 800;
  font-size: 0.95rem;
}
.device-hint {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--timber-muted);
  font-weight: 600;
}
.device-fallback {
  margin: 2rem 0 0;
  padding: 0.85rem 1rem;
  border-radius: 0.75rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  font-size: 0.9rem;
  line-height: 1.45;
  text-align: center;
}
.device-fallback strong { font-weight: 800; }

.device { margin: 0 auto; }
.bezel {
  position: relative;
  background: #1a2332;
  box-shadow: var(--timber-shadow);
}
.screen {
  background: var(--timber-panel);
  color: var(--timber-ink);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.2rem;
}
.screen p {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.screen strong { font-size: 1.05rem; color: var(--timber-primary); }

.phone .bezel {
  width: 8.2rem;
  height: 15.4rem;
  padding: 0.85rem 0.45rem 0.55rem;
  border-radius: 1.55rem;
  border: 3px solid #0e1520;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.phone .notch {
  position: absolute;
  top: 0.38rem;
  left: 50%;
  width: 2.6rem;
  height: 0.42rem;
  margin-left: -1.3rem;
  border-radius: 999px;
  background: #0e1520;
}
.phone .screen {
  flex: 1;
  border-radius: 1.05rem;
}
.tablet .bezel {
  width: 13.5rem;
  height: 9.4rem;
  padding: 0.5rem 0.5rem 0.5rem 0.85rem;
  border-radius: 1rem;
  border: 3px solid #0e1520;
  display: flex;
  box-sizing: border-box;
}
.tablet .cam {
  position: absolute;
  left: 0.32rem;
  top: 50%;
  width: 0.32rem;
  height: 0.32rem;
  margin-top: -0.16rem;
  border-radius: 50%;
  background: #3a4658;
}
.tablet .screen {
  flex: 1;
  border-radius: 0.4rem;
}
.pc .monitor { width: 15rem; }
.pc .bezel {
  padding: 0.45rem 0.45rem 0.7rem;
  border-radius: 0.55rem 0.55rem 0.2rem 0.2rem;
  border: 3px solid #0e1520;
}
.pc .screen {
  height: 8.2rem;
  border-radius: 0.2rem;
}
.pc .pay {
  background: var(--timber-accent);
  color: #1a1208;
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  padding: 0.28rem 0.5rem;
  border-radius: 0.3rem;
}
.pc .neck {
  display: block;
  width: 1.6rem;
  height: 1.15rem;
  margin: 0 auto;
  background: #1a2332;
}
.pc .base {
  display: block;
  width: 5.2rem;
  height: 0.38rem;
  margin: 0 auto;
  border-radius: 0 0 0.35rem 0.35rem;
  background: #0e1520;
}

/* ═══════════════════════════════════════════
   HERO VISUAL (POS shot)
   ═══════════════════════════════════════════ */
.hero-visual {
  display: flex;
  justify-content: center;
  will-change: transform;
}
.shot {
  width: min(100%, 34rem);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.15);
  font-size: 0.72rem;
  color: var(--timber-ink);
}
.shot-top {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.5rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
  font-weight: 700;
}
.shot-top img { border-radius: 0.3rem; }
.shot-nav {
  padding: 0.2rem 0.45rem;
  border-radius: 0.35rem;
  color: color-mix(in srgb, var(--timber-topbar-text) 75%, transparent);
  font-weight: 700;
}
.shot-nav.on { background: rgba(255, 255, 255, 0.14); color: #fff; }
.shot-clock { margin-left: auto; font-variant-numeric: tabular-nums; opacity: 0.85; }
.shot-fkeys {
  display: flex;
  gap: 0.25rem;
  padding: 0.28rem 0.4rem;
  background: var(--timber-topbar);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.shot-fkeys span {
  padding: 0.28rem 0.4rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--timber-topbar-text);
  font-weight: 700;
}
.cobrar {
  background: var(--timber-accent);
  color: #1a1208 !important;
  border-color: transparent !important;
  font-weight: 800;
}
.shot-status {
  display: flex;
  gap: 0.75rem;
  padding: 0.22rem 0.55rem;
  background: color-mix(in srgb, var(--timber-primary) 88%, #0a1a30);
  color: #dce8f6;
  font-weight: 600;
  font-size: 0.68rem;
}
.shot-status .hint { margin-left: auto; opacity: 0.75; }
.shot-desk {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 0.35rem;
  padding: 0.4rem;
  background: var(--timber-surface);
}
.shot-scan {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.45rem;
  padding: 0.35rem 0.45rem;
}
.shot-scan span {
  display: block;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-muted);
  margin-bottom: 0.25rem;
}
.shot-scan div {
  border: 2px solid var(--timber-ink);
  border-radius: 0.35rem;
  padding: 0.28rem 0.4rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: var(--timber-panel-elevated);
}
.shot-total {
  background: #0d1624;
  color: #e8eef6;
  border-radius: 0.45rem;
  padding: 0.4rem 0.5rem;
}
.shot-total p { margin: 0; }
.shot-total .lbl {
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7a8ea8;
  font-weight: 700;
}
.shot-total strong {
  display: block;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #5ec8ff;
  line-height: 1.05;
}
.shot-total .tax { color: #8a9bb0; font-size: 0.62rem; margin-top: 0.15rem; }
.shot table { width: 100%; border-collapse: collapse; }
.shot th {
  text-align: left;
  font-size: 0.58rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--timber-muted);
  padding: 0.35rem 0.45rem;
  border-bottom: 1px solid var(--timber-line);
  font-weight: 800;
}
.shot td {
  padding: 0.32rem 0.45rem;
  border-bottom: 1px solid var(--timber-line);
  font-weight: 600;
}
.shot tr.on { background: var(--timber-primary-soft); }
.shot-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--timber-line);
}
.shot-foot strong { display: block; font-size: 0.78rem; }
.shot-foot span { color: var(--timber-muted); font-weight: 700; }
.shot-foot .cobrar {
  padding: 0.45rem 0.7rem;
  border-radius: 0.4rem;
  letter-spacing: 0.05em;
}

/* ═══════════════════════════════════════════
   INVENTARIO MÁGICO
   ═══════════════════════════════════════════ */
.magic-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.magic-spark {
  font-size: 1.1rem;
  color: var(--timber-accent);
  animation: sparkle 2s ease-in-out infinite;
}
@keyframes sparkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}
.magic-lede {
  max-width: 40rem;
}

.magic-pair {
  margin-top: 1.35rem;
  display: grid;
  gap: 0.75rem;
}
@media (min-width: 720px) {
  .magic-pair { grid-template-columns: 1fr 1fr; }
}
.magic-pair article {
  background: var(--timber-panel-elevated);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  padding: 1.15rem 1.2rem 1.25rem;
}
.pair-kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-primary);
}
.magic-pair h3 {
  margin: 0.4rem 0 0;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.magic-pair p {
  margin: 0.4rem 0 0;
  color: var(--timber-muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.magic-flow {
  margin-top: 1.5rem;
  display: grid;
  gap: 0.5rem;
  align-items: start;
}
@media (min-width: 800px) {
  .magic-flow { grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; }
}
.flow-arrow {
  display: none;
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--timber-primary);
  text-align: center;
  opacity: 0.5;
}
@media (min-width: 800px) {
  .flow-arrow { display: block; }
}
.magic-flow article {
  background: var(--timber-panel-elevated);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  padding: 1.15rem;
}
.step {
  display: inline-flex;
  width: 1.6rem;
  height: 1.6rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font-weight: 800;
  font-size: 0.8rem;
}
.magic-flow h3 { margin: 0.5rem 0 0; font-size: 0.95rem; }
.magic-flow p { margin: 0.3rem 0 0; color: var(--timber-muted); font-size: 0.86rem; line-height: 1.45; }

.magic-demo {
  margin-top: 1.5rem;
  display: grid;
  gap: 1rem;
  align-items: stretch;
  padding: 1.25rem;
  border-radius: var(--timber-radius);
  background: var(--timber-panel-elevated);
  border: 1px solid var(--timber-line);
}
@media (min-width: 700px) {
  .magic-demo { grid-template-columns: 1fr auto 1fr; }
}
.magic-demo-label {
  margin: 0 0 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.magic-demo-icon { font-size: 0.9rem; }
.magic-demo-input pre {
  margin: 0;
  padding: 0.75rem 0.85rem;
  border-radius: 0.6rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.84rem;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--timber-ink);
}
.magic-demo-arrow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}
@media (min-width: 700px) {
  .magic-demo-arrow { flex-direction: column; padding: 0; }
}
.arrow-line {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--timber-primary), transparent);
}
@media (min-width: 700px) {
  .arrow-line {
    width: 2px;
    height: auto;
    flex: 1;
    background: linear-gradient(180deg, transparent, var(--timber-primary), transparent);
  }
}
.arrow-text {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-primary);
  white-space: nowrap;
}
.magic-demo-output ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0;
}
.magic-demo-output li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.5rem;
  border-bottom: 1px solid var(--timber-line);
  font-weight: 600;
  font-size: 0.9rem;
}
.magic-demo-output li:last-child { border-bottom: none; }
.magic-demo-output li strong {
  color: var(--timber-primary);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.magic-note {
  margin: 1.15rem 0 0;
  color: var(--timber-muted);
  font-size: 0.88rem;
  line-height: 1.5;
}
.magic-note strong {
  color: var(--timber-ink);
  font-weight: 700;
}

/* ═══════════════════════════════════════════
   CLOUD / WHY SECTION
   ═══════════════════════════════════════════ */
.pillars {
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.75rem;
}
@media (min-width: 800px) {
  .pillars { grid-template-columns: repeat(3, 1fr); }
}
.pillars li {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  padding: 1.15rem 1.15rem 1.25rem;
  box-shadow: var(--timber-shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}
.pillars li:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(18, 32, 56, 0.12);
}
.pillar-icon {
  display: block;
  font-size: 1.4rem;
  margin-bottom: 0.5rem;
}
.pillars h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.pillars p { margin: 0.4rem 0 0; color: var(--timber-muted); font-size: 0.88rem; line-height: 1.45; }

/* ═══════════════════════════════════════════
   PRICING
   ═══════════════════════════════════════════ */
.billing-toggle {
  margin-top: 1.15rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem 0.75rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.billing-toggle > span.on { color: var(--timber-ink); }
.toggle-track {
  position: relative;
  width: 3.1rem;
  height: 1.7rem;
  padding: 0;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.toggle-track.annual {
  background: var(--timber-primary-soft);
  border-color: var(--timber-primary);
}
.toggle-thumb {
  position: absolute;
  top: 0.18rem;
  left: 0.18rem;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--timber-ink);
  transition: transform 0.22s ease;
}
.toggle-track.annual .toggle-thumb {
  transform: translateX(1.35rem);
  background: var(--timber-primary);
}
.save-pill {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-style: normal;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  vertical-align: middle;
}
.price-note {
  margin: -0.1rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--timber-primary);
}

.plan-grid {
  margin-top: 1.1rem;
  display: grid;
  gap: 0.75rem;
}
@media (min-width: 900px) {
  .plan-grid { grid-template-columns: repeat(3, 1fr); }
}
.plan-grid article {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  height: 100%;
  padding: 1.15rem;
  border-radius: var(--timber-radius);
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  box-shadow: var(--timber-shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}
.plan-grid article:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(18, 32, 56, 0.12);
}
.plan-grid article.hot {
  border-color: var(--timber-primary);
  box-shadow: 0 0 0 1px var(--timber-primary), var(--timber-shadow);
}
.badge {
  margin: 0;
  width: fit-content;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
}
.plan-grid h3 { margin: 0; font-size: 1.2rem; font-weight: 800; }
.tag { margin: 0; color: var(--timber-muted); font-size: 0.86rem; min-height: 2.4em; }
.price {
  margin: 0.15rem 0 0;
  font-size: 1.85rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--timber-ink);
}
.price span { font-size: 0.8rem; font-weight: 600; color: var(--timber-muted); }
.im-line { margin: 0; font-size: 0.82rem; color: var(--timber-muted); font-weight: 600; }
.plan-grid ul {
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  flex: 1 1 auto;
}
.plan-grid li {
  position: relative;
  padding-left: 1rem;
  font-size: 0.84rem;
  color: var(--timber-muted);
  line-height: 1.35;
}
.plan-grid li::before {
  content: "✓";
  position: absolute;
  left: 0;
  top: 0;
  font-weight: 800;
  font-size: 0.78rem;
  color: var(--timber-primary);
}
.plan-grid .btn { width: 100%; margin-top: auto; align-self: end; }

.plan-extra {
  margin-top: 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 0.7rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
}
.plan-extra p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--timber-muted);
  line-height: 1.4;
}
.plan-extra strong { color: var(--timber-ink); font-weight: 700; }
.plan-extra a {
  color: var(--timber-primary);
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
}
.plan-extra a:hover { text-decoration: underline; }
.perpetual-note { margin: 0.25rem 0 0; font-size: 0.78rem; color: var(--timber-muted); }

/* ═══════════════════════════════════════════
   HARDWARE
   ═══════════════════════════════════════════ */
.hw-grid {
  margin: 1.5rem 0 0;
  display: grid;
  gap: 0.65rem;
  grid-template-columns: 1fr 1fr;
}
@media (min-width: 700px) {
  .hw-grid { grid-template-columns: repeat(4, 1fr); }
}
.hw-card {
  padding: 1rem;
  border-radius: var(--timber-radius);
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  box-shadow: var(--timber-shadow);
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}
.hw-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(18, 32, 56, 0.12);
}
.hw-icon {
  display: block;
  font-size: 1.6rem;
  margin-bottom: 0.45rem;
}
.hw-card h4 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 800;
}
.hw-card p {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  color: var(--timber-muted);
  line-height: 1.35;
}

/* ═══════════════════════════════════════════
   SECTION BACKGROUND ALTERNATION
   ═══════════════════════════════════════════ */
.band.cloud,
.band.plans,
.band.hardware {
  background: transparent;
}
.band.devices-band,
.band.magic {
  background: var(--timber-panel);
}

/* ═══════════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════════ */
.final-cta {
  text-align: center;
  position: relative;
  z-index: 1;
}
.final-cta .section {
  padding-top: 3.5rem;
  padding-bottom: 3.5rem;
}
.final-cta h2 {
  margin-inline: auto;
  max-width: 28rem;
  font-size: clamp(1.35rem, 2.4vw, 1.75rem);
}
.final-cta p {
  margin: 0.65rem auto 0;
  max-width: 30rem;
  color: var(--timber-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}
.final-cta-actions {
  margin-top: 1.25rem;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 1.15rem 2.25rem;
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel);
  font-size: 0.86rem;
  color: var(--timber-muted);
}
.foot-brand p {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--timber-muted);
  max-width: 20rem;
}
.foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}
.foot a { color: var(--timber-primary); font-weight: 700; text-decoration: none; }
.foot a:hover { text-decoration: underline; }
.foot-brand :deep(.word) { font-size: 1.05rem; }

/* ═══════════════════════════════════════════
   ENTRANCE ANIMATIONS
   ═══════════════════════════════════════════ */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet,
  .hero-visual,
  .device-row {
    transform: none !important;
  }
  .magic-spark { animation: none; }
}
</style>
