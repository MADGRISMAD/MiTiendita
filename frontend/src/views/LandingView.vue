<template>
  <div class="landing" id="top">
    <header class="nav">
      <div class="wrap nav-inner">
        <a href="#top" class="nav-brand" aria-label="Mi Tiendita, inicio">
          <img src="/logo.svg" alt="" width="34" height="34" />
          <BrandName />
        </a>
        <nav class="nav-links" aria-label="Secciones">
          <a href="#caja">La caja</a>
          <a href="#magia">Inventario Mágico</a>
          <a href="#planes">Precios</a>
          <a href="#proveedores">Sé proveedor</a>
          <a href="#preguntas">Preguntas</a>
        </nav>
        <div class="nav-actions">
          <router-link v-if="loggedIn" class="btn primary sm" :to="{ name: homeRoute }">Ir al sistema</router-link>
          <template v-else>
            <router-link class="btn quiet sm" to="/login">Ingresar</router-link>
            <router-link class="btn cta sm" to="/register">Probar gratis</router-link>
          </template>
        </div>
      </div>
    </header>

    <main>
      <!-- ═══ HERO: la caja real ═══ -->
      <section class="hero">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <p class="kicker">Punto de venta para tiendas de barrio</p>
            <h1>Tu tienda no cierra aunque la compu falle</h1>
            <p class="lede">
              Cobras con escáner, desde el celular o la tablet, sin instalar nada. Si se va el internet sigues vendiendo,
              y desde tu celular ves cuánto llevas hoy.
            </p>
            <div class="hero-cta">
              <router-link v-if="!loggedIn" class="btn cta lg" to="/register">Probar 3 días gratis</router-link>
              <router-link v-else class="btn cta lg" :to="{ name: homeRoute }">Abrir caja</router-link>
              <a class="btn outline lg" href="#planes">Ver precios</a>
            </div>
            <ul class="hero-checks">
              <li>Sin tarjeta para probar</li>
              <li>Cancelas cuando quieras</li>
              <li>Desde ${{ formatInt(basicPrice) }} al mes</li>
            </ul>
          </div>

          <figure class="hero-shot">
            <div class="browser">
              <div class="browser-bar" aria-hidden="true">
                <i></i><i></i><i></i>
                <span>mitiendita.software/pos</span>
              </div>
              <img
                src="/screens/caja-pc.webp"
                srcset="/screens/caja-pc-900.webp 900w, /screens/caja-pc.webp 1600w"
                sizes="(max-width: 960px) 92vw, 760px"
                width="1600"
                height="1000"
                alt="Pantalla de venta de Mi Tiendita: buscador, productos de abarrotes con precio y existencias, y el ticket con total de $212.00 listo para cobrar"
                fetchpriority="high"
              />
            </div>
            <div class="phone hero-phone">
              <img
                src="/screens/caja-movil.webp"
                width="780"
                height="1688"
                alt="La misma caja en un celular, con el botón Cobrar abajo"
                loading="lazy"
              />
            </div>
            <figcaption>Así se ve hoy la caja de Mi Tiendita, en la PC y en el celular.</figcaption>
          </figure>
        </div>
      </section>

      <!-- ═══ DATOS RÁPIDOS ═══ -->
      <section class="facts" aria-label="Lo esencial">
        <div class="wrap facts-grid">
          <div class="fact">
            <strong>181 productos</strong>
            <span>de abarrotes ya capturados con su código: solo les pones precio</span>
          </div>
          <div class="fact">
            <strong>Sin internet</strong>
            <span>la caja sigue cobrando y sube las ventas cuando regresa la red</span>
          </div>
          <div class="fact">
            <strong>Lo que ya tienes</strong>
            <span>celular, tablet o la PC del mostrador, con escáner e impresora</span>
          </div>
          <div class="fact">
            <strong>3 días gratis</strong>
            <span>y los primeros 3 meses a un tercio del precio</span>
          </div>
        </div>
      </section>

      <!-- ═══ LA CAJA, PANTALLA POR PANTALLA ═══ -->
      <section id="caja" class="band">
        <div class="wrap">
          <div class="head">
            <p class="kicker">Todo tu mostrador en una pantalla</p>
            <h2>Hecho para cobrar rápido y no perder la cuenta</h2>
            <p class="lede">Estas son pantallas reales del sistema, con el catálogo de una tienda de abarrotes.</p>
          </div>

          <article class="feature">
            <div class="feature-copy">
              <p class="tag">Cobrar</p>
              <h3>Cobras en segundos, sin hacer cuentas</h3>
              <ul class="ticks">
                <li>Escaneas o buscas por nombre, aunque lo escribas sin acentos</li>
                <li>Efectivo, tarjeta, transferencia, pago mixto o fiado</li>
                <li>Te dice el cambio exacto y ofrece billetes comunes</li>
                <li>Imprime el ticket en tu impresora de 58 u 80 mm</li>
              </ul>
            </div>
            <div class="browser feature-shot">
              <img
                src="/screens/cobro-pc.webp"
                srcset="/screens/cobro-pc-900.webp 900w, /screens/cobro-pc.webp 1600w"
                sizes="(max-width: 960px) 92vw, 620px"
                width="1600"
                height="1000"
                alt="Ventana Cobrar venta: total de $212.00, pago en efectivo de $300 y cambio de $88.00"
                loading="lazy"
              />
            </div>
          </article>

          <article class="feature flip">
            <div class="feature-copy">
              <p class="tag">Resumen</p>
              <h3>Sabes cuánto vendiste sin esperar al corte</h3>
              <ul class="ticks">
                <li>Ventas de hoy contra ayer a la misma hora</li>
                <li>Ganancia estimada y margen, con el costo de cada producto</li>
                <li>Hora pico y cómo te pagaron</li>
                <li>Lo revisas desde tu celular, estés donde estés</li>
              </ul>
            </div>
            <div class="browser feature-shot">
              <img
                src="/screens/resumen-pc.webp"
                srcset="/screens/resumen-pc-900.webp 900w, /screens/resumen-pc.webp 1600w"
                sizes="(max-width: 960px) 92vw, 620px"
                width="1600"
                height="1000"
                alt="Resumen del día: vendiste hoy, tickets, ticket promedio, ganancia estimada, ventas por hora y formas de pago"
                loading="lazy"
              />
            </div>
          </article>

          <article class="feature">
            <div class="feature-copy">
              <p class="tag">Productos e inventario</p>
              <h3>Tu inventario, sin cuaderno</h3>
              <ul class="ticks">
                <li>Llegas con 181 productos de abarrotes ya dados de alta</li>
                <li>Avisos de poco stock, agotados y productos que caducan</li>
                <li>Compras a proveedores que suman existencias y actualizan el costo</li>
                <li>Exportas tu catálogo y tus ventas a Excel</li>
              </ul>
            </div>
            <div class="browser feature-shot">
              <img
                src="/screens/productos-pc.webp"
                srcset="/screens/productos-pc-900.webp 900w, /screens/productos-pc.webp 1600w"
                sizes="(max-width: 960px) 92vw, 620px"
                width="1600"
                height="1000"
                alt="Pantalla de productos: 181 productos en 8 categorías, valor del inventario, stock bajo y lista con precio, costo, ganancia y existencias"
                loading="lazy"
              />
            </div>
          </article>
        </div>
      </section>

      <!-- ═══ EQUIPOS Y SIN INTERNET ═══ -->
      <section id="equipos" class="band soft">
        <div class="wrap devices">
          <div class="phone devices-phone">
            <img src="/screens/caja-movil.webp" width="780" height="1688" alt="Caja de Mi Tiendita en el celular" loading="lazy" />
          </div>
          <div class="devices-copy">
            <p class="kicker">Funciona con lo que ya tienes</p>
            <h2>Abres el navegador y ya estás en caja</h2>
            <p class="lede">
              No se instala nada. Entras desde el celular, una tablet o la PC del mostrador y ves lo mismo en todos.
            </p>
            <dl class="qa">
              <div>
                <dt>¿Se fue el internet?</dt>
                <dd>La caja sigue cobrando con el catálogo guardado. Cuando vuelve la red, las ventas se suben solas.</dd>
              </div>
              <div>
                <dt>¿Se descompuso la compu?</dt>
                <dd>Entras desde otro equipo y ahí están tu catálogo, tus ventas y tus cortes. No pierdes ni un ticket.</dd>
              </div>
              <div>
                <dt>¿Mucha fila?</dt>
                <dd>Un cajero cobra en el mostrador y otro con el celular en el pasillo, cada quien con su usuario.</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <!-- ═══ VIDEO ═══ -->
      <section id="video" class="band">
        <div class="wrap video">
          <div class="video-copy">
            <p class="kicker">Míralo en 20 segundos</p>
            <h2>Se descompone la PC. Tú sigues vendiendo.</h2>
            <p class="lede">Un minuto de tu tiempo para ver por qué ya no dependes de una sola computadora.</p>
          </div>
          <video
            class="video-player"
            controls
            playsinline
            preload="metadata"
            poster="/mitiendita-promo-poster.jpg"
            aria-label="Mi Tiendita en 20 segundos"
          >
            <source src="/mitiendita-promo.mp4" type="video/mp4" />
          </video>
        </div>
      </section>

      <!-- ═══ INVENTARIO MÁGICO ═══ -->
      <section id="magia" class="band soft">
        <div class="wrap">
          <div class="head">
            <p class="kicker">Lo que nos hace diferentes</p>
            <h2>Inventario Mágico y Precio Mágico</h2>
            <p class="lede">
              Le tomas foto a la nota del proveedor o escribes la lista como la tengas. El catálogo y los precios se
              actualizan solos.
            </p>
          </div>

          <div class="magic">
            <div class="magic-note">
              <p class="magic-label">Tú escribes o tomas foto</p>
              <div class="paper" aria-label="Nota escrita a mano">
                <p>15 cocas de 600 a 22</p>
                <p>Sabritas a 18</p>
                <p>Aceite 1L 48 pesos</p>
              </div>
            </div>
            <span class="magic-arrow" aria-hidden="true">→</span>
            <div class="magic-result">
              <p class="magic-label">Tu catálogo queda así</p>
              <ul class="catalog">
                <li><span>Coca-Cola 600 ml</span><em>+15 pzas</em><strong>$22.00</strong></li>
                <li><span>Sabritas Saladas</span><em>nuevo</em><strong>$18.00</strong></li>
                <li><span>Aceite 1 L</span><em>nuevo</em><strong>$48.00</strong></li>
              </ul>
              <div class="price-alert">
                <p><strong>Subió el costo de la Coca 600 ml</strong></p>
                <p>Te costaba $14.00, ahora $15.50. Precio sugerido: <strong>$24.50</strong> para no perder margen.</p>
              </div>
            </div>
          </div>

          <ol class="steps">
            <li><b>1</b><span><strong>Escribes o tomas foto.</strong> La lista, el papelito o la factura del camión.</span></li>
            <li><b>2</b><span><strong>Mi Tiendita lo interpreta.</strong> Reconoce productos, cantidades, costos y precios.</span></li>
            <li><b>3</b><span><strong>Revisas y confirmas.</strong> Se suman existencias y se ajustan precios.</span></li>
          </ol>
          <p class="fine">
            Cada revisión cuenta como un uso del mes: <strong>Básico 50</strong>, <strong>Crecimiento 150</strong> y
            <strong>Pro 500</strong>.
          </p>
        </div>
      </section>

      <!-- ═══ PLANES ═══ -->
      <section id="planes" class="band">
        <div class="wrap">
          <div class="head">
            <p class="kicker">Precios sin letras chiquitas</p>
            <h2>Elige según tu tienda</h2>
            <p class="lede">3 días de prueba sin tarjeta. Cancelas cuando quieras. Precios en pesos con IVA incluido.</p>
          </div>

          <p class="promo">
            <span class="promo-tag">Lanzamiento</span>
            <span>
              <strong>Clientes nuevos: 3 meses a 1/3 del precio</strong> con el plan mensual, después precio normal.
              Aparte de tus 3 días gratis.
            </span>
          </p>

          <div class="billing" role="group" aria-label="Periodo de pago">
            <button type="button" :class="{ on: billingInterval === 'month' }" :aria-pressed="billingInterval === 'month'" @click="billingInterval = 'month'">
              Mensual
            </button>
            <button type="button" :class="{ on: billingInterval === 'year' }" :aria-pressed="billingInterval === 'year'" @click="billingInterval = 'year'">
              Anual <em>2 meses gratis</em>
            </button>
          </div>

          <div class="plans">
            <article v-for="p in plans" :key="p.id" class="plan" :class="{ hot: p.highlight }">
              <p v-if="p.badge" class="plan-badge">{{ p.badge }}</p>
              <h3>{{ p.name }}</h3>
              <p class="plan-tag">{{ p.tagline }}</p>
              <div class="plan-price">
                <template v-if="billingInterval === 'month'">
                  <template v-if="p.promoPrice">
                    <p class="amount">${{ formatInt(p.promoPrice) }}<span>/mes</span></p>
                    <p class="amount-note">los primeros {{ p.promoMonths || 3 }} meses, luego ${{ formatInt(p.price) }}/mes</p>
                  </template>
                  <p v-else class="amount">${{ formatInt(p.price) }}<span>/mes</span></p>
                </template>
                <template v-else>
                  <p class="amount">${{ formatInt(planYearPrice(p)) }}<span>/año</span></p>
                  <p class="amount-note">como ${{ formatInt(planMonthlyFromYear(p)) }} al mes</p>
                </template>
              </div>
              <p class="plan-magic">
                <InventarioMagicoTerm /> y <InventarioMagicoTerm kind="precio" />: {{ p.aiQuotaLabel }}
              </p>
              <ul class="ticks">
                <li v-for="(f, j) in p.features" :key="j">{{ f }}</li>
              </ul>
              <router-link class="btn block" :class="p.highlight ? 'cta' : 'outline'" :to="planCtaTo">
                {{ loggedIn ? "Ver en facturación" : "Empezar gratis" }}
              </router-link>
            </article>
          </div>

          <p class="perpetual">
            ¿Prefieres pagar una sola vez? Hay <strong>licencia perpetua</strong>, sin Inventario Mágico ni Precio Mágico.
            <button type="button" class="link" @click="showPerpetual = true">Ver qué incluye</button>
          </p>
        </div>
      </section>

      <!-- ═══ TESTIMONIOS (solo reales, con permiso) ═══ -->
      <section v-if="testimonials.length" id="testimonios" class="band soft">
        <div class="wrap">
          <div class="head">
            <p class="kicker">Tiendas que ya cobran con Mi Tiendita</p>
            <h2>Lo dicen ellos</h2>
          </div>
          <div class="testis">
            <figure v-for="t in testimonials" :key="t.name" class="testi">
              <blockquote>“{{ t.quote }}”</blockquote>
              <figcaption>
                <img v-if="t.photo" :src="t.photo" :alt="t.name" width="44" height="44" loading="lazy" />
                <span><strong>{{ t.name }}</strong> · {{ t.shop }}, {{ t.city }}</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <!-- ═══ EQUIPO ═══ -->
      <section id="hardware" class="band soft">
        <div class="wrap hw">
          <div class="hw-copy">
            <p class="kicker">¿No tienes equipo?</p>
            <h2>Te lo vendemos e instalamos</h2>
            <p class="lede">
              Puedes usar lo que ya tienes. Pero si quieres algo nuevo, te armamos el mostrador completo y lo dejamos
              funcionando.
            </p>
          </div>
          <ul class="hw-list">
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M11 18h2" /></svg>
              <strong>Tablet para caja</strong>
              <span>Compacta y rápida en el mostrador</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></svg>
              <strong>Impresora de tickets</strong>
              <span>Térmica de 80 mm, USB o Bluetooth</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14M7.5 5v14M11 5v14M14 5v14M17.5 5v14M20 5v14" /></svg>
              <strong>Escáner de códigos</strong>
              <span>Lee el código de barras al instante</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="3.5" width="19" height="13" rx="2" /><path d="M8 20.5h8M12 16.5v4" /></svg>
              <strong>Terminal todo en uno</strong>
              <span>Pantalla, impresora y escáner juntos</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- ═══ PROVEEDORES ═══ -->
      <PartnersSection :plans="plans">
        <template #actions>
          <router-link class="btn cta lg" :to="{ path: '/register', query: { tipo: 'proveedor' } }">Quiero ser proveedor</router-link>
          <a class="btn outline lg" :href="partnerWhatsapp" target="_blank" rel="noopener">Preguntar por WhatsApp</a>
        </template>
      </PartnersSection>

      <!-- ═══ PREGUNTAS ═══ -->
      <section id="preguntas" class="band soft">
        <div class="wrap faq">
          <div class="head">
            <p class="kicker">Antes de empezar</p>
            <h2>Preguntas frecuentes</h2>
          </div>
          <div class="faq-list">
            <details v-for="f in faq" :key="f.q">
              <summary>{{ f.q }}</summary>
              <p>{{ f.a }}</p>
            </details>
          </div>
        </div>
      </section>

      <!-- ═══ CIERRE ═══ -->
      <section class="band">
        <div class="wrap">
          <div class="closing">
            <div>
              <h2>Prueba Mi Tiendita 3 días en tu mostrador</h2>
              <p>Si no te convence, no pagas nada. Sin tarjeta y sin letras chiquitas.</p>
            </div>
            <div class="closing-cta">
              <router-link v-if="!loggedIn" class="btn cta lg" to="/register">Crear mi cuenta gratis</router-link>
              <router-link v-else class="btn cta lg" :to="{ name: homeRoute }">Ir al sistema</router-link>
              <WhatsAppHelp label="Prefiero preguntar por WhatsApp" :message="PRESALE_MESSAGE" compact />
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Licencia perpetua: qué es, antes de pedir una cuenta -->
    <Teleport to="body">
      <div v-if="showPerpetual" class="lp-modal-bg" @click.self="showPerpetual = false">
        <div class="lp-modal" role="dialog" aria-modal="true" aria-labelledby="perpetual-title">
          <button type="button" class="lp-modal-x" aria-label="Cerrar" @click="showPerpetual = false">×</button>
          <p class="lp-modal-kicker">Pago único</p>
          <h3 id="perpetual-title">Licencia perpetua</h3>
          <p>Pagas una vez y usas la caja, el catálogo y los tickets sin cuota mensual.</p>
          <div class="lp-modal-cols">
            <div>
              <h4>Incluye</h4>
              <ul>
                <li>Cobrar desde celular, tablet o PC en el navegador</li>
                <li>Sin instalar nada · 1 sucursal</li>
                <li>Hasta 20 usuarios</li>
                <li>Productos ilimitados</li>
                <li>Tickets de 80 mm, corte de caja e inventario</li>
              </ul>
            </div>
            <div>
              <h4>No incluye</h4>
              <ul>
                <li>Inventario Mágico ni Precio Mágico (la IA)</li>
              </ul>
              <h4>Soporte y actualizaciones</h4>
              <p class="lp-modal-small">Te explicamos precio y condiciones por WhatsApp antes de que decidas.</p>
            </div>
          </div>
          <div class="lp-modal-acts">
            <WhatsAppHelp label="Pregúntanos por WhatsApp" :message="PERPETUAL_MESSAGE" />
            <router-link v-if="loggedIn" class="lp-modal-link" :to="{ name: 'billing' }" @click="showPerpetual = false">
              Ver mi plan actual
            </router-link>
          </div>
        </div>
      </div>
    </Teleport>

    <footer class="foot">
      <div class="wrap foot-grid">
        <div class="foot-brand">
          <BrandName />
          <p>Punto de venta en la nube para abarrotes y tiendas de barrio.</p>
          <WhatsAppHelp class="foot-wa" label="¿Dudas? Escríbenos por WhatsApp" :message="PRESALE_MESSAGE" compact />
        </div>
        <div class="foot-links">
          <strong>Mi Tiendita</strong>
          <router-link to="/login">Ingresar</router-link>
          <router-link to="/register">Crear cuenta</router-link>
          <router-link to="/ayuda">Ayuda</router-link>
          <a href="/guia-cajero.pdf" download>Guía de cajero</a>
          <router-link to="/terminos">Términos</router-link>
          <router-link to="/privacidad">Privacidad</router-link>
        </div>
        <nav class="foot-links" aria-label="Punto de venta por giro">
          <strong>Para tu giro</strong>
          <router-link v-for="v in VERTICALS" :key="v.slug" :to="`/${v.slug}`">{{ v.h1.replace(/^Punto de venta /, "") }}</router-link>
        </nav>
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
import WhatsAppHelp from "../components/WhatsAppHelp.vue";
import PartnersSection from "../components/landing/PartnersSection.vue";
import { PRICES, VERTICALS } from "../seo/site.mjs";
import { PERPETUAL_MESSAGE, PRESALE_MESSAGE, whatsappLink } from "../support";

const partnerWhatsapp = whatsappLink("Hola, me interesa ser proveedor oficial de Mi Tiendita en mi zona. ¿Cómo funciona?");

const route = useRoute();
const plans = ref([]);
/** Testimonios reales: { name, shop, city, quote, photo? } — con permiso de la persona. Vacío = sección oculta. */
const testimonials = ref([]);
const billingInterval = ref("month");
const loggedIn = computed(() => Boolean(authStore.token));
const showPerpetual = ref(false);
const homeRoute = computed(() => homeForRole());
const basicPrice = PRICES.find((p) => p.id === "basic")?.month || 349;
const planCtaTo = computed(() => {
  if (loggedIn.value) {
    return {
      name: "billing",
      query: billingInterval.value === "year" ? { interval: "year" } : undefined,
    };
  }
  return "/register";
});

const faq = [
  {
    q: "¿Necesito internet para cobrar?",
    a: "Para entrar la primera vez, sí. Después, si se cae el internet, la caja sigue cobrando con el catálogo guardado en el equipo y sube las ventas sola cuando vuelve la red.",
  },
  {
    q: "¿Tengo que descargar algo?",
    a: "No. Entras desde el navegador del celular, la tablet o la computadora. Si quieres, la agregas a la pantalla de inicio como si fuera una app.",
  },
  {
    q: "¿Funciona con mi escáner y mi impresora de tickets?",
    a: "Sí. Los escáneres de código de barras USB funcionan como teclado, y las impresoras térmicas de 58 y 80 mm se conectan por USB, Bluetooth o desde el navegador.",
  },
  {
    q: "¿Qué pasa cuando terminan los 3 días de prueba?",
    a: "Eliges un plan para seguir cobrando. Si no eliges ninguno, no te cobramos nada: la prueba no pide tarjeta.",
  },
  {
    q: "¿Cómo pago y cómo cancelo?",
    a: "Pagas con tarjeta a través de Mercado Pago, mensual o anual. Cancelas la renovación desde Facturación y sigues usando el sistema hasta el fin del periodo pagado.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Tus ventas y tu catálogo viven en la nube con respaldos diarios. Las contraseñas van cifradas y puedes activar la verificación en dos pasos.",
  },
];

function formatInt(n) {
  return Number(n || 0).toLocaleString("es-MX");
}

function planYearPrice(p) {
  return p.priceYear ?? Math.round(Number(p.price || 0) * 10);
}

function planMonthlyFromYear(p) {
  return p.monthlyFromYear ?? Math.round(planYearPrice(p) / 12);
}

const fallbackPlans = [
  {
    id: "basic",
    name: "Básico",
    tagline: "Para la tiendita que quiere dejar el cuaderno",
    price: 349,
    aiQuotaLabel: "50 usos al mes",
    highlight: false,
    badge: null,
    features: ["1 sucursal · 2 usuarios", "Hasta 250 productos", "Corte de caja e inventario", "Tickets de 80 mm"],
  },
  {
    id: "growth",
    name: "Crecimiento",
    tagline: "Más cajeros, más productos, más control",
    price: 750,
    aiQuotaLabel: "150 usos al mes",
    highlight: true,
    badge: "Más popular",
    features: ["Todo lo del Básico", "6 usuarios · 1,500 productos", "Cobro en pasillo con el celular", "Proveedores y compras"],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para tiendas con catálogo grande y proveedores",
    price: 1350,
    aiQuotaLabel: "500 usos al mes",
    highlight: false,
    badge: null,
    features: ["Todo lo de Crecimiento", "20 usuarios · productos ilimitados", "Lee fotos de facturas de proveedores", "Soporte prioritario"],
  },
];

// Los precios de la landing salen SIEMPRE de PRICES (src/seo/site.mjs), nunca de la API ni de variables:
// la API solo aporta textos y características. Así lo que se ve es lo que está en el código.
const PROMO_DIVISOR = 3;
function withFixedPrices(list) {
  return list.map((p) => {
    const fixed = PRICES.find((x) => x.id === p.id);
    if (!fixed) return p;
    return {
      ...p,
      price: fixed.month,
      priceYear: fixed.year,
      monthlyFromYear: Math.floor(fixed.year / 12),
      promoPrice: Math.round(fixed.month / PROMO_DIVISOR),
      promoMonths: 3,
    };
  });
}

async function loadPlans() {
  plans.value = withFixedPrices(fallbackPlans);
  try {
    const res = await apiService.getBillingPlans();
    if (res.plans?.length) plans.value = withFixedPrices(res.plans);
  } catch {
    /* se quedan los de respaldo */
  }
}

function scrollToHash() {
  const hash = route.hash?.replace("#", "");
  if (!hash) return;
  nextTick(() => {
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// En la landing la barra del navegador del celular va clara, como la página; al salir vuelve la del sistema
let prevThemeColor = null;
function setThemeColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  if (prevThemeColor === null) prevThemeColor = meta.getAttribute("content");
  meta.setAttribute("content", color);
}

onMounted(async () => {
  setThemeColor("#fbfaf7");
  await loadPlans();
  scrollToHash();
});

onUnmounted(() => {
  if (prevThemeColor !== null) setThemeColor(prevThemeColor);
});

watch(() => route.hash, scrollToHash);
</script>

<style scoped>
/* La landing es siempre clara: fija sus propios colores (y los del sistema para los componentes que usa),
   sin importar si el equipo está en modo oscuro. */
.landing {
  --timber-primary: #1e5aa8;
  --timber-primary-soft: #e7f0fb;
  --timber-accent: #e08a1e;
  --timber-ink: #17212e;
  --timber-muted: #5d6b7c;
  --timber-line: #e3e7ee;
  --timber-surface: #f6f7f9;
  --timber-panel: #ffffff;
  --timber-panel-elevated: #fafbfc;
  --timber-topbar: #123056;
  --timber-success: #2e7d32;
  --timber-success-soft: #e8f5e9;
  --timber-on-primary: #ffffff;

  --paper: #fbfaf7;
  --soft: #f4f6f9;
  --cta: #e08a1e;
  --cta-hover: #c97812;
  --cta-ink: #1f1404;
  --radius: 14px;
  --shadow-shot: 0 1px 2px rgba(23, 33, 46, 0.06), 0 18px 40px -18px rgba(23, 33, 46, 0.28);

  color-scheme: light;
  position: relative;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  scroll-behavior: smooth;
  scroll-padding-top: 4.5rem;
  background: var(--paper);
  color: var(--timber-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
@media (prefers-reduced-motion: reduce) {
  .landing { scroll-behavior: auto; }
}

.wrap {
  width: min(72rem, 100% - 2.5rem);
  margin-inline: auto;
}

/* ─── Botones ─── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  padding: 0 1.15rem;
  border: 1.5px solid transparent;
  border-radius: 10px;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.btn:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--timber-primary) 40%, transparent);
  outline-offset: 2px;
}
.btn.sm { min-height: 2.4rem; padding: 0 0.95rem; font-size: 0.9rem; }
.btn.lg { min-height: 3.25rem; padding: 0 1.5rem; font-size: 1.02rem; }
.btn.block { width: 100%; }
.btn.cta { background: var(--cta); color: var(--cta-ink); }
.btn.cta:hover { background: var(--cta-hover); }
.btn.primary { background: var(--timber-primary); color: #fff; }
.btn.primary:hover { background: #184b8d; }
.btn.outline { border-color: #cfd6e0; background: #fff; color: var(--timber-ink); }
.btn.outline:hover { border-color: var(--timber-primary); color: var(--timber-primary); }
.btn.quiet { background: transparent; color: var(--timber-ink); }
.btn.quiet:hover { background: var(--soft); }
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--timber-primary);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

/* ─── Navegación ─── */
.nav {
  position: sticky;
  top: 0;
  z-index: 30;
  background: rgba(251, 250, 247, 0.94);
  border-bottom: 1px solid var(--timber-line);
  backdrop-filter: saturate(1.4) blur(8px);
}
.nav-inner {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-height: 4rem;
}
.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 1.15rem;
  text-decoration: none;
}
.nav-links {
  display: flex;
  gap: 1.4rem;
  margin-right: auto;
}
.nav-links a {
  color: var(--timber-muted);
  font-size: 0.93rem;
  font-weight: 600;
  text-decoration: none;
}
.nav-links a:hover { color: var(--timber-ink); }
.nav-actions { display: flex; gap: 0.4rem; margin-left: auto; }

/* ─── Tipografía de secciones ─── */
.kicker {
  margin: 0 0 0.7rem;
  color: var(--timber-primary);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
h1,
h2,
h3 {
  margin: 0;
  color: var(--timber-ink);
  font-family: var(--font-display);
  letter-spacing: -0.02em;
}
h2 {
  font-size: clamp(1.7rem, 3.2vw, 2.4rem);
  font-weight: 800;
  line-height: 1.12;
}
.lede {
  margin: 0.9rem 0 0;
  max-width: 40rem;
  color: var(--timber-muted);
  font-size: 1.08rem;
  line-height: 1.6;
}
.head { max-width: 46rem; margin-bottom: 2.5rem; }
.band { padding: clamp(3.5rem, 7vw, 6rem) 0; }
.band.soft { background: var(--soft); border-block: 1px solid var(--timber-line); }

.ticks {
  display: grid;
  gap: 0.6rem;
  margin: 1.2rem 0 0;
  padding: 0;
  list-style: none;
}
.ticks li {
  position: relative;
  padding-left: 1.7rem;
  color: var(--timber-ink);
  font-size: 1rem;
  line-height: 1.45;
}
.ticks li::before {
  content: "";
  position: absolute;
  left: 0.15rem;
  top: 0.38rem;
  width: 0.95rem;
  height: 0.55rem;
  border-left: 2.5px solid var(--timber-success);
  border-bottom: 2.5px solid var(--timber-success);
  transform: rotate(-45deg);
}

/* ─── Marcos de captura ─── */
.browser {
  overflow: hidden;
  border: 1px solid #d9dfe7;
  border-radius: var(--radius);
  background: #fff;
  box-shadow: var(--shadow-shot);
}
.browser img { display: block; width: 100%; height: auto; }
.browser-bar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  height: 2rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--timber-line);
  background: #f3f5f8;
}
.browser-bar i {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #d5dbe3;
}
.browser-bar span {
  margin-left: 0.6rem;
  padding: 0.15rem 0.7rem;
  border-radius: 6px;
  background: #fff;
  color: var(--timber-muted);
  font-size: 0.72rem;
  font-weight: 600;
}
.phone {
  overflow: hidden;
  border: 7px solid #1d2532;
  border-radius: 30px;
  background: #1d2532;
  box-shadow: var(--shadow-shot);
}
.phone img { display: block; width: 100%; height: auto; border-radius: 23px; }

/* ─── Hero ─── */
.hero { padding: clamp(2.5rem, 6vw, 4.5rem) 0 clamp(2.5rem, 5vw, 3.5rem); }
.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
}
.hero h1 {
  font-size: clamp(2.3rem, 5vw, 3.6rem);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.03em;
}
.hero .lede { font-size: 1.15rem; }
.hero-cta { display: flex; flex-wrap: wrap; gap: 0.7rem; margin-top: 1.8rem; }
.hero-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.2rem;
  margin: 1.3rem 0 0;
  padding: 0;
  list-style: none;
  color: var(--timber-muted);
  font-size: 0.92rem;
  font-weight: 600;
}
.hero-checks li { position: relative; padding-left: 1.2rem; }
.hero-checks li::before {
  content: "";
  position: absolute;
  left: 0.1rem;
  top: 0.38rem;
  width: 0.65rem;
  height: 0.38rem;
  border-left: 2px solid var(--timber-success);
  border-bottom: 2px solid var(--timber-success);
  transform: rotate(-45deg);
}
.hero-shot { position: relative; margin: 0 0 0 0; padding-bottom: 1.6rem; }
.hero-phone {
  position: absolute;
  right: -1.2rem;
  bottom: 0;
  width: 26%;
  border-width: 5px;
  border-radius: 22px;
}
.hero-phone img { border-radius: 17px; }
.hero-shot figcaption {
  margin-top: 0.9rem;
  color: var(--timber-muted);
  font-size: 0.85rem;
}

/* ─── Datos rápidos ─── */
.facts { padding-bottom: clamp(2.5rem, 5vw, 3.5rem); }
.facts-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--timber-line);
  border-radius: var(--radius);
  background: #fff;
}
.fact { display: grid; gap: 0.3rem; padding: 1.2rem 1.3rem; }
.fact + .fact { border-left: 1px solid var(--timber-line); }
.fact strong { font-size: 1.1rem; font-weight: 800; }
.fact span { color: var(--timber-muted); font-size: 0.92rem; line-height: 1.45; }

/* ─── Funciones con captura ─── */
.feature {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
}
.feature + .feature { margin-top: clamp(3.5rem, 7vw, 5.5rem); }
.feature.flip .feature-copy { order: 2; }
.feature h3 { font-size: clamp(1.4rem, 2.4vw, 1.75rem); font-weight: 800; line-height: 1.2; }
.tag {
  display: inline-block;
  margin: 0 0 0.8rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  font-size: 0.8rem;
  font-weight: 800;
}

/* ─── Equipos ─── */
.devices {
  display: grid;
  grid-template-columns: minmax(0, 0.55fr) minmax(0, 1.45fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: center;
}
.devices-phone { max-width: 17rem; justify-self: center; }
.qa { display: grid; gap: 1.1rem; margin: 1.8rem 0 0; }
.qa div { padding-left: 1rem; border-left: 3px solid var(--timber-primary); }
.qa dt { font-weight: 800; }
.qa dd { margin: 0.25rem 0 0; color: var(--timber-muted); line-height: 1.55; }

/* ─── Video ─── */
.video {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
}
.video-player {
  width: 100%;
  max-height: 34rem;
  border-radius: var(--radius);
  background: #e9edf2;
  box-shadow: var(--shadow-shot);
}

/* ─── Inventario Mágico ─── */
.magic {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) auto minmax(0, 1.2fr);
  gap: 1.5rem;
  align-items: start;
}
.magic-label {
  margin: 0 0 0.7rem;
  color: var(--timber-muted);
  font-size: 0.85rem;
  font-weight: 700;
}
.paper {
  padding: 1.4rem 1.5rem 1.2rem;
  border: 1px solid #ebe3c9;
  border-radius: 6px;
  background:
    repeating-linear-gradient(#fffdf4 0 2.15rem, #e9e2c8 2.15rem calc(2.15rem + 1px)),
    #fffdf4;
  box-shadow: 0 10px 24px -16px rgba(60, 45, 10, 0.35);
  transform: rotate(-1.2deg);
}
.paper p {
  margin: 0;
  color: #1e3a6e;
  font-family: "Caveat", "Segoe Print", cursive;
  font-size: 1.6rem;
  line-height: 2.16rem;
}
.magic-arrow {
  align-self: center;
  color: var(--timber-muted);
  font-size: 1.8rem;
  font-weight: 700;
}
.catalog {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--timber-line);
  border-radius: var(--radius);
  background: #fff;
}
.catalog li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 1rem;
  align-items: center;
  padding: 0.85rem 1.1rem;
}
.catalog li + li { border-top: 1px solid var(--timber-line); }
.catalog span { font-weight: 700; }
.catalog em {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--timber-success-soft);
  color: var(--timber-success);
  font-size: 0.78rem;
  font-style: normal;
  font-weight: 800;
}
.catalog strong { font-variant-numeric: tabular-nums; }
.price-alert {
  margin-top: 0.9rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid #f2d3a6;
  border-radius: var(--radius);
  background: #fff7eb;
}
.price-alert p { margin: 0; line-height: 1.5; }
.price-alert p + p { margin-top: 0.25rem; color: #5b4523; font-size: 0.95rem; }
.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
  margin: 2.8rem 0 0;
  padding: 0;
  list-style: none;
}
.steps li { display: flex; gap: 0.8rem; align-items: flex-start; line-height: 1.5; color: var(--timber-muted); }
.steps strong { color: var(--timber-ink); }
.steps b {
  flex: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--timber-primary);
  color: #fff;
  font-size: 0.9rem;
}
.fine { margin: 1.8rem 0 0; color: var(--timber-muted); font-size: 0.92rem; }

/* ─── Planes ─── */
.promo {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin: -0.8rem 0 2rem;
  padding: 0.85rem 1.1rem;
  border: 1px solid #f2d3a6;
  border-radius: var(--radius);
  background: #fff7eb;
  line-height: 1.45;
}
.promo-tag {
  flex: none;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--cta);
  color: var(--cta-ink);
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}
.billing {
  display: inline-flex;
  gap: 0.25rem;
  margin-bottom: 1.6rem;
  padding: 0.25rem;
  border: 1px solid var(--timber-line);
  border-radius: 10px;
  background: #fff;
}
.billing button {
  min-height: 2.4rem;
  padding: 0 1rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--timber-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.billing button.on { background: var(--timber-ink); color: #fff; }
.billing em { margin-left: 0.3rem; color: var(--timber-success); font-size: 0.8rem; font-style: normal; }
.billing button.on em { color: #a6e3b0; }
.plans {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.2rem;
  align-items: start;
}
.plan {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.6rem;
  border: 1px solid var(--timber-line);
  border-radius: var(--radius);
  background: #fff;
}
.plan.hot { border: 2px solid var(--cta); box-shadow: 0 18px 40px -26px rgba(224, 138, 30, 0.6); }
.plan-badge {
  position: absolute;
  top: -0.8rem;
  left: 1.4rem;
  margin: 0;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  background: var(--cta);
  color: var(--cta-ink);
  font-size: 0.75rem;
  font-weight: 800;
}
.plan h3 { font-size: 1.3rem; font-weight: 800; }
.plan-tag { margin: 0.35rem 0 0; color: var(--timber-muted); font-size: 0.92rem; line-height: 1.45; min-height: 2.7rem; }
.plan-price { margin: 1.1rem 0 0; min-height: 4.6rem; }
.amount { margin: 0; font-size: 2.4rem; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.amount span { margin-left: 0.2rem; color: var(--timber-muted); font-size: 1rem; font-weight: 600; letter-spacing: 0; }
.amount-note { margin: 0.2rem 0 0; color: var(--timber-muted); font-size: 0.88rem; }
.plan-magic {
  margin: 1rem 0 0;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: var(--soft);
  font-size: 0.86rem;
  line-height: 1.45;
}
.plan .ticks { margin-bottom: 1.5rem; }
.plan .ticks li { font-size: 0.94rem; }
.plan .btn { margin-top: auto; }
.perpetual { margin: 1.6rem 0 0; color: var(--timber-muted); text-align: center; }

/* ─── Testimonios ─── */
.testis { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1.2rem; }
.testi { margin: 0; padding: 1.4rem; border: 1px solid var(--timber-line); border-radius: var(--radius); background: #fff; }
.testi blockquote { margin: 0; font-size: 1.02rem; line-height: 1.55; }
.testi figcaption { display: flex; align-items: center; gap: 0.6rem; margin-top: 1rem; color: var(--timber-muted); font-size: 0.9rem; }
.testi img { border-radius: 50%; object-fit: cover; }

/* ─── Equipo ─── */
.hw {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
}
.hw-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.hw-list li {
  display: grid;
  gap: 0.25rem;
  padding: 1.2rem;
  border: 1px solid var(--timber-line);
  border-radius: var(--radius);
  background: #fff;
}
.hw-list svg {
  width: 1.8rem;
  height: 1.8rem;
  margin-bottom: 0.4rem;
  fill: none;
  stroke: var(--timber-primary);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.hw-list span { color: var(--timber-muted); font-size: 0.92rem; }

/* ─── Proveedores (componente): mismos botones que el resto ─── */
:deep(.pt) { background: var(--paper); }

/* ─── Preguntas ─── */
.faq { display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); gap: clamp(2rem, 5vw, 4rem); }
.faq .head { margin: 0; }
.faq-list { border-top: 1px solid #d9dfe7; }
.faq-list details { border-bottom: 1px solid #d9dfe7; }
.faq-list summary {
  position: relative;
  padding: 1.1rem 2.2rem 1.1rem 0;
  font-size: 1.04rem;
  font-weight: 700;
  list-style: none;
  cursor: pointer;
}
.faq-list summary::-webkit-details-marker { display: none; }
.faq-list summary::after {
  content: "+";
  position: absolute;
  right: 0.2rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--timber-primary);
  font-size: 1.5rem;
  font-weight: 500;
}
.faq-list details[open] summary::after { content: "−"; }
.faq-list details p { margin: -0.3rem 0 1.2rem; color: var(--timber-muted); line-height: 1.6; }

/* ─── Cierre ─── */
.closing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem 2rem;
  padding: clamp(1.8rem, 4vw, 2.8rem);
  border: 1px solid #f2d3a6;
  border-radius: 20px;
  background: #fff7eb;
}
.closing h2 { font-size: clamp(1.5rem, 3vw, 2.1rem); }
.closing p { margin: 0.6rem 0 0; color: #5b4523; font-size: 1.05rem; }
.closing-cta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; }

/* ─── Pie ─── */
.foot { padding: 3rem 0 2.5rem; border-top: 1px solid var(--timber-line); background: #fff; }
.foot-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr); gap: 2rem; }
.foot-brand { font-size: 1.15rem; }
.foot-brand p { margin: 0.5rem 0 1rem; max-width: 20rem; color: var(--timber-muted); font-size: 0.92rem; line-height: 1.5; }
.foot-links { display: grid; align-content: start; gap: 0.45rem; }
.foot-links strong { margin-bottom: 0.3rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--timber-muted); }
.foot-links a { color: var(--timber-ink); font-size: 0.93rem; text-decoration: none; }
.foot-links a:hover { color: var(--timber-primary); text-decoration: underline; }

/* ─── Licencia perpetua ─── */
.lp-modal-bg {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 34, 0.5);
}
.lp-modal {
  position: relative;
  width: min(38rem, 100%);
  max-height: 92dvh;
  overflow-y: auto;
  padding: 1.8rem;
  border-radius: 18px;
  background: #fff;
  color: #17212e;
  color-scheme: light;
  font-family: var(--font-sans);
}
.lp-modal-x {
  position: absolute;
  top: 0.8rem;
  right: 0.9rem;
  width: 2.2rem;
  height: 2.2rem;
  border: none;
  border-radius: 8px;
  background: #f1f3f6;
  color: #17212e;
  font-size: 1.4rem;
  cursor: pointer;
}
.lp-modal-kicker { margin: 0; color: #1e5aa8; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.lp-modal h3 { margin: 0.3rem 0 0.6rem; font-size: 1.5rem; color: #17212e; }
.lp-modal > p { margin: 0; color: #5d6b7c; line-height: 1.55; }
.lp-modal-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem; margin: 1.2rem 0; }
.lp-modal h4 { margin: 0 0 0.4rem; font-size: 0.95rem; }
.lp-modal ul { margin: 0 0 1rem; padding-left: 1.1rem; color: #3b4757; line-height: 1.6; font-size: 0.93rem; }
.lp-modal-small { margin: 0; color: #5d6b7c; font-size: 0.9rem; line-height: 1.5; }
.lp-modal-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.lp-modal-link { color: #1e5aa8; font-weight: 700; }

/* ─── Tablet ─── */
@media (max-width: 960px) {
  .nav-links { display: none; }
  .hero-grid,
  .feature,
  .devices,
  .video,
  .hw,
  .faq {
    grid-template-columns: minmax(0, 1fr);
  }
  .feature.flip .feature-copy { order: 0; }
  .hero-shot { max-width: 44rem; }
  .hero-phone { right: 0.5rem; }
  .facts-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fact:nth-child(3) { border-left: none; }
  .fact:nth-child(n + 3) { border-top: 1px solid var(--timber-line); }
  .magic { grid-template-columns: minmax(0, 1fr); }
  .magic-arrow { transform: rotate(90deg); justify-self: center; }
  .plans { grid-template-columns: minmax(0, 1fr); max-width: 30rem; }
  .plan-tag,
  .plan-price { min-height: 0; }
  .devices-phone { max-width: 15rem; }
  .foot-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .foot-brand { grid-column: 1 / -1; }
}

/* ─── Celular ─── */
@media (max-width: 600px) {
  .wrap { width: calc(100% - 2rem); }
  .nav-inner { gap: 0.6rem; min-height: 3.6rem; }
  .nav-brand img { width: 30px; height: 30px; }
  .nav-actions .quiet { display: none; }
  .hero { padding-top: 2rem; }
  .hero .lede { font-size: 1.05rem; }
  .hero-cta .btn { flex: 1 1 100%; }
  .hero-phone { display: none; }
  .hero-shot { padding-bottom: 0; }
  .browser-bar span { display: none; }
  .facts-grid { grid-template-columns: minmax(0, 1fr); }
  .fact + .fact { border-left: none; border-top: 1px solid var(--timber-line); }
  .fact:nth-child(3) { border-top: 1px solid var(--timber-line); }
  .steps { grid-template-columns: minmax(0, 1fr); }
  .hw-list { grid-template-columns: minmax(0, 1fr); }
  .promo { flex-direction: column; align-items: flex-start; }
  .lp-modal-cols { grid-template-columns: minmax(0, 1fr); }
  .closing-cta .btn { flex: 1 1 100%; }
  .foot-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
