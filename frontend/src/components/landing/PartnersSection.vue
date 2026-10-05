<template>
  <section id="proveedores" ref="root" class="pt" :class="{ live: inView, still: reduced }" aria-labelledby="pt-title">
    <div class="pt-glow" aria-hidden="true">
      <span class="g1"></span>
      <span class="g2"></span>
    </div>

    <!-- ═══ Encabezado + portal animado ═══ -->
    <div class="pt-wrap pt-hero">
      <div class="pt-copy" :class="{ in: seen.hero }" data-pt="hero">
        <p class="pt-kicker"><span class="dot" aria-hidden="true"></span> Proveedores oficiales</p>
        <h2 id="pt-title">Vende Mi Tiendita en tu zona y gana <em>en cada cobro</em></h2>
        <p class="pt-lede">
          Lleva el punto de venta a las tiendas, farmacias y ferreterías que conoces. Cada vez que una tienda que trajiste paga su
          plan, te llevas una comisión — <strong>mes con mes, mientras siga con nosotros</strong>.
        </p>
        <ul class="pt-points">
          <li><b>10% → 20%</b> de cada cobro, según las tiendas que cierres</li>
          <li><b>Tu propio portal</b> para ver tiendas, comisiones y a tu equipo</li>
          <li><b>Sin cuota</b> ni inventario: solo tu código y tu enlace</li>
        </ul>
        <div class="pt-actions">
          <slot name="actions" />
        </div>
      </div>

      <div class="pt-device" :class="{ in: seen.hero }" aria-label="Así se ve tu portal de proveedor" role="img">
        <div class="dev-top">
          <span class="dev-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Portal de socios</span>
        </div>
        <div class="dev-body">
          <div class="dev-code">
            <small>Tu código</small>
            <strong>MT-4F7K2Q</strong>
          </div>
          <div class="dev-kpis">
            <div>
              <small>Por cobrar</small>
              <strong class="num">{{ money(ticker.total) }}</strong>
            </div>
            <div>
              <small>Tiendas</small>
              <strong class="num">{{ ticker.stores }}</strong>
            </div>
            <div>
              <small>Comisión</small>
              <strong class="num">{{ Math.round(rateFor(ticker.stores) * 100) }}%</strong>
            </div>
          </div>
          <ul class="dev-feed" aria-hidden="true">
            <li v-for="item in ticker.feed" :key="item.key" class="feed-item">
              <span class="ava" :style="{ '--h': item.hue }">{{ item.initials }}</span>
              <span class="what">
                <b>{{ item.store }}</b>
                <small>{{ item.label }}</small>
              </span>
              <span class="plus">+{{ money(item.amount) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- ═══ Simulador ═══ -->
    <div class="pt-wrap">
      <div class="pt-sim" :class="{ in: seen.sim }" data-pt="sim">
        <div class="sim-head">
          <p class="pt-kicker">Haz cuentas</p>
          <h3>¿Cuánto puedes ganar?</h3>
          <p>Mueve la barra: cuántas tiendas tienes pagando y qué plan usan.</p>
        </div>

        <div class="sim-grid">
          <div class="sim-controls">
            <label class="sim-range">
              <span>Tiendas pagando <b class="num">{{ stores }}</b></span>
              <input v-model.number="stores" type="range" min="1" max="80" step="1" :style="{ '--fill': `${((stores - 1) / 79) * 100}%` }" />
              <span class="ticks" aria-hidden="true"><i>1</i><i>20</i><i>40</i><i>60</i><i>80</i></span>
            </label>
            <fieldset class="sim-plans">
              <legend>Plan que usan</legend>
              <label v-for="p in planOptions" :key="p.id" :class="{ on: plan === p.id }">
                <input v-model="plan" type="radio" name="pt-plan" :value="p.id" />
                <span>{{ p.name }}</span>
                <small>{{ money(p.price) }}/mes</small>
              </label>
            </fieldset>
          </div>

          <div class="sim-result" aria-live="polite">
            <div class="res-main">
              <small>Ganarías al mes</small>
              <strong class="num">{{ money(shown.month) }}</strong>
              <span class="res-rate">a <b>{{ Math.round(rate * 100) }}%</b> por cobro</span>
            </div>
            <div class="res-row">
              <div>
                <small>Al año</small>
                <b class="num">{{ money(shown.year) }}</b>
              </div>
              <div>
                <small>Por tienda</small>
                <b class="num">{{ money(perStore) }}</b>
              </div>
            </div>
            <p v-if="nextTier" class="res-next">
              Con <b>{{ nextTier.missing }}</b> {{ nextTier.missing === 1 ? "tienda más" : "tiendas más" }} subes a
              <b>{{ Math.round(nextTier.rate * 100) }}%</b> y ganarías <b>{{ money(nextTier.month) }}</b> al mes.
            </p>
            <p v-else class="res-next">Estás en el <b>nivel máximo</b>: 20% de cada cobro.</p>
          </div>
        </div>
        <p class="sim-note">Ejemplo con todas las tiendas pagando ese plan cada mes. La comisión se calcula sobre lo que paga cada tienda.</p>
      </div>
    </div>

    <!-- ═══ Escalera ═══ -->
    <div class="pt-wrap">
      <div class="pt-ladder" :class="{ in: seen.ladder }" data-pt="ladder">
        <div class="ladder-copy">
          <p class="pt-kicker">Tu comisión sube sola</p>
          <h3>Mientras más tiendas cierras, más ganas en cada cobro</h3>
          <p>
            Una <b>venta cerrada</b> es una tienda que ya pagó al menos una vez. Cada cobro usa el nivel que tengas en ese momento,
            y lo que ya ganaste no baja.
          </p>
        </div>
        <ol class="ladder-bars">
          <li v-for="(t, i) in LADDER" :key="t.from" :style="{ '--h': `${(t.rate / 0.2) * 100}%`, '--i': i }" :class="{ hit: stores >= t.from }">
            <span class="bar"><b>{{ Math.round(t.rate * 100) }}%</b></span>
            <small>{{ t.from === 0 ? "al empezar" : `${t.from}+ tiendas` }}</small>
          </li>
        </ol>
      </div>
    </div>

    <!-- ═══ Cómo funciona ═══ -->
    <div class="pt-wrap">
      <div class="pt-steps" :class="{ in: seen.steps }" data-pt="steps">
        <p class="pt-kicker">Cómo empiezas</p>
        <h3>De la solicitud a tu primera comisión</h3>
        <ol>
          <li v-for="(s, i) in STEPS" :key="s.title" :style="{ '--i': i }">
            <span class="step-n">{{ i + 1 }}</span>
            <div>
              <b>{{ s.title }}</b>
              <p>{{ s.text }}</p>
            </div>
          </li>
        </ol>
      </div>
    </div>

    <!-- ═══ Qué incluye el portal ═══ -->
    <div class="pt-wrap">
      <div class="pt-features" :class="{ in: seen.features }" data-pt="features">
        <p class="pt-kicker">Tu portal de proveedor</p>
        <h3>Todo para atender a tus tiendas sin perder ninguna</h3>
        <ul>
          <li v-for="(f, i) in FEATURES" :key="f.title" :style="{ '--i': i }">
            <span class="f-ico" aria-hidden="true" v-html="f.icon"></span>
            <b>{{ f.title }}</b>
            <p>{{ f.text }}</p>
          </li>
        </ul>
      </div>
    </div>

    <!-- ═══ Preguntas ═══ -->
    <div class="pt-wrap">
      <div class="pt-faq" :class="{ in: seen.faq }" data-pt="faq">
        <p class="pt-kicker">Preguntas frecuentes</p>
        <h3>Lo que más nos preguntan</h3>
        <details v-for="q in FAQ" :key="q.q">
          <summary>{{ q.q }}</summary>
          <p>{{ q.a }}</p>
        </details>
        <div class="pt-actions center">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

const props = defineProps({
  // Precios de los planes (de la API o los de respaldo de la landing)
  plans: { type: Array, default: () => [] },
});

// Misma escalera que el servidor (backend/services/referral.tiers.js)
const LADDER = [
  { from: 0, rate: 0.1 },
  { from: 5, rate: 0.12 },
  { from: 10, rate: 0.14 },
  { from: 20, rate: 0.16 },
  { from: 35, rate: 0.18 },
  { from: 50, rate: 0.2 },
];

const STEPS = [
  { title: "Mándanos tu solicitud", text: "Te registras como proveedor o nos escribes por WhatsApp. No cuesta nada." },
  { title: "Te activamos tu código", text: "Revisamos tu solicitud y te damos tu número de referencia, tu enlace y acceso a tu portal." },
  { title: "Registras tiendas", text: "Compartes tu enlace; la tienda crea su cuenta con 14 días gratis y queda ligada a ti." },
  { title: "Ganas en cada cobro", text: "Cuando la tienda paga su plan, la comisión aparece en tu portal. Te pagamos lo acumulado." },
];

const ico = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const FEATURES = [
  { title: "Tiendas que piden atención", text: "Pago atrasado, prueba por vencer o sin entrar: te avisamos antes de que se vayan.", icon: ico('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>') },
  { title: "Comisiones al día", text: "Cada cobro de tus tiendas con tu porcentaje, lo que está por cobrar y lo que ya te pagamos.", icon: ico('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>') },
  { title: "Equipo de asesores", text: "Agrega a tu gente, reparte tiendas y decide quién ve el dinero.", icon: ico('<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="3.2"/><path d="M22 21v-2a3.6 3.6 0 00-3-3.5"/>') },
  { title: "Seguimiento con notas", text: "Anota llamadas, acuerdos y pendientes de cada tienda; todo tu equipo lo ve.", icon: ico('<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>') },
  { title: "Enlace y WhatsApp", text: "Comparte tu enlace en un toque. La tienda que se registra con él queda contigo.", icon: ico('<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/>') },
  { title: "Cuenta protegida", text: "Verificación en dos pasos obligatoria: tus datos y los de tus tiendas, seguros.", icon: ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>') },
];

const FAQ = [
  { q: "¿Cuánto cuesta ser proveedor?", a: "Nada. No hay cuota de inscripción ni mensualidad. Solo revisamos tu solicitud antes de activar tu código." },
  { q: "¿Sobre qué se calcula mi comisión?", a: "Sobre cada cobro que hace una tienda que trajiste: su suscripción mensual o anual y los pagos que registremos de ella. Empiezas en 10% y subes hasta 20% conforme cierras tiendas." },
  { q: "¿Hasta cuándo gano por una tienda?", a: "Mientras la tienda siga pagando su plan. Si cancela, dejas de recibir por ella; lo que ya ganaste se queda." },
  { q: "¿Cómo y cuándo me pagan?", a: "En tu portal ves cada comisión: lo que está por cobrar y lo que ya te pagamos. Liquidamos lo acumulado por transferencia y queda registrado cada pago." },
  { q: "¿Puedo tener vendedores trabajando conmigo?", a: "Sí. Desde tu portal agregas asesores: ven y atienden tus tiendas, y tú decides quién maneja el dinero y el equipo." },
  { q: "¿Qué pasa si una tienda se registra sin mi código?", a: "Escríbenos: si la trajiste tú, la asignamos a tu cuenta para que sus cobros cuenten para ti." },
];

const money = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const rateFor = (n) => LADDER.reduce((r, t) => (n >= t.from ? t.rate : r), LADDER[0].rate);

// ── Simulador ──
const planOptions = computed(() => {
  const list = (props.plans || [])
    .filter((p) => ["basic", "growth", "pro"].includes(p.id))
    .map((p) => ({ id: p.id, name: p.name, price: Number(p.price ?? p.priceMonth) || 0 }))
    .filter((p) => p.price > 0);
  return list.length
    ? list
    : [
        { id: "basic", name: "Básico", price: 349 },
        { id: "growth", name: "Crecimiento", price: 700 },
        { id: "pro", name: "Pro", price: 1350 },
      ];
});
const stores = ref(12);
const plan = ref("growth");
const price = computed(() => planOptions.value.find((p) => p.id === plan.value)?.price || planOptions.value[0].price);
const rate = computed(() => rateFor(stores.value));
const perStore = computed(() => price.value * rate.value);
const month = computed(() => stores.value * perStore.value);
const nextTier = computed(() => {
  const next = LADDER.find((t) => t.from > stores.value);
  if (!next) return null;
  return { missing: next.from - stores.value, rate: next.rate, month: next.from * price.value * next.rate };
});

// Los montos cuentan hacia el valor nuevo (en vez de saltar)
const shown = reactive({ month: 0, year: 0 });
let tweenFrame = 0;
function tweenTo(target) {
  cancelAnimationFrame(tweenFrame);
  if (reduced.value) {
    shown.month = target;
    shown.year = target * 12;
    return;
  }
  const from = shown.month;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 650);
    const e = 1 - Math.pow(1 - t, 3);
    shown.month = from + (target - from) * e;
    shown.year = shown.month * 12;
    if (t < 1) tweenFrame = requestAnimationFrame(step);
  };
  tweenFrame = requestAnimationFrame(step);
}
watch(month, (v) => seen.sim && tweenTo(v));

// ── Portal de ejemplo: comisiones que van llegando ──
const STORES = ["Abarrotes Lupita", "Farmacia Santa Rosa", "Ferretería El Tornillo", "Minisúper La Esquina", "Papelería Nuevo Siglo", "Cremería Los Alpes", "Verdulería Fresca", "Tienda Don Chuy"];
const ticker = reactive({ total: 1840, stores: 12, feed: [] });
let tickerTimer = 0;
let seq = 0;
function pushFeed() {
  const store = STORES[seq % STORES.length];
  const prices = [349, 700, 1350];
  const amount = Math.round(prices[seq % 3] * rateFor(ticker.stores));
  const label = seq % 4 === 3 ? "Nueva tienda con tu código" : "Pagó su plan";
  if (seq % 4 === 3) ticker.stores += 1;
  ticker.total += amount;
  ticker.feed = [
    { key: seq, store, label, amount, initials: store.split(" ").slice(0, 2).map((w) => w[0]).join(""), hue: (seq * 47) % 360 },
    ...ticker.feed,
  ].slice(0, 4);
  seq += 1;
}

// ── Aparecer al entrar en pantalla ──
const root = ref(null);
const inView = ref(false);
const reduced = ref(false);
const seen = reactive({ hero: false, sim: false, ladder: false, steps: false, features: false, faq: false });
let observer = null;
let sectionObserver = null;

function startTicker() {
  if (tickerTimer || reduced.value) return;
  tickerTimer = window.setInterval(() => {
    if (!document.hidden && inView.value) pushFeed();
  }, 2600);
}

onMounted(() => {
  const landing = root.value?.closest(".landing");
  reduced.value =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || landing?.dataset.motion === "reduce";
  for (let i = 0; i < 3; i += 1) pushFeed();

  if (reduced.value || !("IntersectionObserver" in window)) {
    Object.keys(seen).forEach((k) => (seen[k] = true));
    inView.value = true;
    shown.month = month.value;
    shown.year = month.value * 12;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const key = entry.target.dataset.pt;
        if (key && !seen[key]) {
          seen[key] = true;
          if (key === "sim") tweenTo(month.value);
        }
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
  );
  root.value.querySelectorAll("[data-pt]").forEach((node) => observer.observe(node));
  sectionObserver = new IntersectionObserver(([entry]) => (inView.value = entry.isIntersecting), { threshold: 0.05 });
  sectionObserver.observe(root.value);
  startTicker();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  sectionObserver?.disconnect();
  clearInterval(tickerTimer);
  cancelAnimationFrame(tweenFrame);
});
</script>

<style scoped>
.pt {
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --pt-accent: var(--timber-accent, #e08a1e);
  position: relative;
  z-index: 1;
  padding: 1.5rem 0 3rem;
  overflow: clip;
}
.pt-glow { position: absolute; inset: 0; pointer-events: none; z-index: -1; }
.pt-glow span { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.35; }
.pt-glow .g1 { width: 26rem; height: 26rem; top: 2rem; right: -6rem; background: color-mix(in srgb, var(--timber-primary) 55%, transparent); }
.pt-glow .g2 { width: 22rem; height: 22rem; top: 40%; left: -8rem; background: color-mix(in srgb, var(--pt-accent) 45%, transparent); }
.pt.live:not(.still) .pt-glow .g1 { animation: pt-float 14s ease-in-out infinite alternate; }
.pt.live:not(.still) .pt-glow .g2 { animation: pt-float 18s ease-in-out infinite alternate-reverse; }
@keyframes pt-float { to { transform: translate(-3rem, 2rem) scale(1.15); } }

.pt-wrap { max-width: 64rem; margin: 0 auto; padding: 2rem 1.15rem; }
.pt-kicker {
  display: inline-flex; align-items: center; gap: 0.45rem; margin: 0;
  font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--timber-primary);
}
.pt-kicker .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--pt-accent); box-shadow: 0 0 0 0 var(--pt-accent); }
.pt.live:not(.still) .pt-kicker .dot { animation: pt-ping 1.8s ease-out infinite; }
@keyframes pt-ping { 70% { box-shadow: 0 0 0 0.6rem transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
.num { font-variant-numeric: tabular-nums; }

h2, h3 { font-family: var(--font-display); letter-spacing: -0.035em; line-height: 1.12; margin: 0.35rem 0 0; }
h2 { font-size: clamp(1.7rem, 3.6vw, 2.6rem); font-weight: 800; }
h2 em { font-style: normal; background: linear-gradient(100deg, var(--timber-primary), var(--pt-accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
h3 { font-size: clamp(1.3rem, 2.6vw, 1.85rem); font-weight: 800; }

/* Aparecer: cada bloque entra al verlo (sin animación si el usuario lo pidió) */
[data-pt], .pt-device { transition: opacity 0.8s var(--ease), translate 0.8s var(--ease); }
.pt:not(.still) [data-pt]:not(.in), .pt:not(.still) .pt-device:not(.in) { opacity: 0; translate: 0 2rem; }
.pt:not(.still) .pt-device:not(.in) { translate: 2rem 1rem; }

/* ── Encabezado ── */
.pt-hero { display: grid; gap: 2rem; align-items: center; padding-top: 3rem; }
@media (min-width: 56rem) { .pt-hero { grid-template-columns: 1.1fr 0.9fr; } }
.pt-lede { margin: 0.8rem 0 0; max-width: 34rem; color: var(--timber-muted); font-size: 1.02rem; line-height: 1.6; }
.pt-points { display: grid; gap: 0.5rem; margin: 1.1rem 0 0; padding: 0; list-style: none; }
.pt-points li { position: relative; padding-left: 1.6rem; color: var(--timber-ink); font-size: 0.95rem; }
.pt-points li::before {
  content: "✓"; position: absolute; left: 0; top: 0.05rem; width: 1.15rem; height: 1.15rem; display: grid; place-items: center;
  border-radius: 50%; font-size: 0.7rem; font-weight: 900; color: #fff; background: var(--timber-primary);
}
.pt-points b { color: var(--timber-primary); }
.pt-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.4rem; }
.pt-actions.center { justify-content: center; margin-top: 1.6rem; }

/* Portal de ejemplo */
.pt-device {
  position: relative; border-radius: 1.4rem; overflow: hidden;
  background: color-mix(in srgb, var(--timber-panel) 92%, transparent);
  border: 1px solid var(--timber-line);
  box-shadow: 0 30px 60px -20px rgba(8, 20, 40, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}
.pt.live:not(.still) .pt-device.in { animation: pt-bob 6s ease-in-out infinite; }
@keyframes pt-bob { 50% { transform: translateY(-8px); } }
.dev-top { display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.9rem; background: var(--timber-topbar, #12305a); color: #fff; font-weight: 800; font-size: 0.82rem; }
.dev-dots { display: inline-flex; gap: 0.3rem; }
.dev-dots i { width: 0.55rem; height: 0.55rem; border-radius: 50%; background: rgba(255, 255, 255, 0.35); }
.dev-body { display: grid; gap: 0.75rem; padding: 1rem; }
.dev-code { display: flex; align-items: baseline; justify-content: space-between; padding: 0.7rem 0.85rem; border-radius: 0.9rem; border: 1px dashed var(--timber-line); background: color-mix(in srgb, var(--timber-primary) 6%, transparent); }
.dev-code small, .dev-kpis small { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--timber-muted); }
.dev-code strong { font-size: 1.25rem; font-weight: 900; letter-spacing: 0.08em; color: var(--timber-primary); }
.dev-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.dev-kpis > div { display: grid; gap: 0.15rem; padding: 0.6rem 0.7rem; border-radius: 0.8rem; background: var(--timber-surface, rgba(0, 0, 0, 0.03)); }
.dev-kpis strong { font-size: 1.05rem; font-weight: 900; color: var(--timber-ink); }
.dev-kpis > div:first-child strong { color: var(--timber-success, #1f8a4c); }
.dev-feed { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; min-height: 12.5rem; }
.feed-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.65rem; border-radius: 0.8rem; border: 1px solid var(--timber-line); background: var(--timber-panel); }
.pt:not(.still) .feed-item:first-child { animation: pt-in 0.6s var(--ease); }
@keyframes pt-in { from { opacity: 0; transform: translateY(-0.8rem) scale(0.97); background: color-mix(in srgb, var(--timber-success, #1f8a4c) 14%, var(--timber-panel)); } }
.feed-item .ava { width: 2rem; height: 2rem; flex: none; display: grid; place-items: center; border-radius: 0.6rem; font-size: 0.72rem; font-weight: 900; color: hsl(var(--h) 55% 32%); background: hsl(var(--h) 70% 90%); }
.feed-item .what { display: grid; min-width: 0; flex: 1; }
.feed-item .what b { font-size: 0.84rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-item .what small { font-size: 0.72rem; color: var(--timber-muted); font-weight: 600; }
.feed-item .plus { font-weight: 900; font-size: 0.86rem; color: var(--timber-success, #1f8a4c); font-variant-numeric: tabular-nums; }

/* ── Simulador ── */
.pt-sim { padding: clamp(1.2rem, 3vw, 2rem); border-radius: 1.5rem; border: 1px solid var(--timber-line); background: var(--timber-panel); box-shadow: 0 20px 50px -30px rgba(8, 20, 40, 0.35); }
.sim-head p:last-child { margin: 0.5rem 0 0; color: var(--timber-muted); }
.sim-grid { display: grid; gap: 1.5rem; margin-top: 1.4rem; }
@media (min-width: 52rem) { .sim-grid { grid-template-columns: 1fr 1fr; align-items: center; } }
.sim-controls { display: grid; gap: 1.3rem; }
.sim-range { display: grid; gap: 0.6rem; font-weight: 700; }
.sim-range > span:first-child { display: flex; justify-content: space-between; align-items: baseline; }
.sim-range b { font-size: 1.6rem; font-weight: 900; color: var(--timber-primary); }
.sim-range input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 0.6rem; border-radius: 999px; cursor: pointer;
  background: linear-gradient(90deg, var(--timber-primary) var(--fill), var(--timber-line) var(--fill));
}
.sim-range input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: #fff;
  border: 4px solid var(--timber-primary); box-shadow: 0 4px 12px rgba(8, 20, 40, 0.3); transition: transform 0.15s;
}
.sim-range input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.12); }
.sim-range input[type="range"]::-moz-range-thumb { width: 1.3rem; height: 1.3rem; border-radius: 50%; background: #fff; border: 4px solid var(--timber-primary); }
.sim-range input[type="range"]:focus-visible { outline: 3px solid color-mix(in srgb, var(--timber-primary) 40%, transparent); outline-offset: 4px; }
.ticks { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--timber-muted); font-weight: 700; }
.ticks i { font-style: normal; }
.sim-plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0; padding: 0; border: 0; }
.sim-plans legend { margin-bottom: 0.5rem; font-weight: 700; }
.sim-plans label {
  display: grid; gap: 0.1rem; padding: 0.7rem 0.6rem; border-radius: 0.9rem; cursor: pointer; text-align: center;
  border: 2px solid var(--timber-line); transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.sim-plans label:hover { transform: translateY(-2px); }
.sim-plans label.on { border-color: var(--timber-primary); background: color-mix(in srgb, var(--timber-primary) 8%, var(--timber-panel)); }
.sim-plans label:focus-within { outline: 3px solid color-mix(in srgb, var(--timber-primary) 40%, transparent); outline-offset: 2px; }
.sim-plans input { position: absolute; opacity: 0; pointer-events: none; }
.sim-plans span { font-weight: 800; font-size: 0.92rem; }
.sim-plans small { font-size: 0.75rem; color: var(--timber-muted); font-weight: 600; }

.sim-result {
  display: grid; gap: 1rem; padding: 1.3rem; border-radius: 1.2rem; color: #fff;
  background: linear-gradient(140deg, var(--timber-primary), color-mix(in srgb, var(--timber-primary) 55%, #071426));
  box-shadow: 0 24px 50px -24px color-mix(in srgb, var(--timber-primary) 70%, transparent);
}
.res-main { display: grid; gap: 0.1rem; }
.res-main small, .res-row small { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.8; }
.res-main strong { font-family: var(--font-display); font-size: clamp(2.2rem, 6vw, 3.2rem); font-weight: 900; letter-spacing: -0.03em; line-height: 1; }
.res-rate { font-weight: 700; opacity: 0.9; }
.res-rate b { padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--pt-accent); color: #1a1208; }
.res-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.res-row > div { display: grid; gap: 0.1rem; padding: 0.65rem 0.75rem; border-radius: 0.9rem; background: rgba(255, 255, 255, 0.12); }
.res-row b { font-size: 1.15rem; font-weight: 900; }
.res-next { margin: 0; font-size: 0.9rem; line-height: 1.45; opacity: 0.95; }
.sim-note { margin: 1rem 0 0; font-size: 0.8rem; color: var(--timber-muted); }

/* ── Escalera ── */
.pt-ladder { display: grid; gap: 1.6rem; align-items: end; }
@media (min-width: 52rem) { .pt-ladder { grid-template-columns: 0.9fr 1.1fr; } }
.ladder-copy p:last-child { margin: 0.6rem 0 0; color: var(--timber-muted); line-height: 1.55; }
.ladder-bars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem; align-items: end; height: 15rem; margin: 0; padding: 0; list-style: none; }
.ladder-bars li { display: grid; grid-template-rows: 1fr auto; gap: 0.4rem; height: 100%; text-align: center; }
.ladder-bars .bar {
  align-self: end; display: grid; place-items: start center; padding-top: 0.5rem;
  height: var(--h); border-radius: 0.8rem 0.8rem 0.3rem 0.3rem; color: #fff;
  background: linear-gradient(180deg, color-mix(in srgb, var(--timber-primary) 70%, #fff), var(--timber-primary));
  transform-origin: bottom; transition: transform 0.9s var(--ease) calc(var(--i) * 0.12s), filter 0.3s, box-shadow 0.3s;
}
.ladder-bars b { font-size: 0.95rem; font-weight: 900; }
.ladder-bars small { font-size: 0.7rem; font-weight: 700; color: var(--timber-muted); }
.pt:not(.still) .pt-ladder:not(.in) .bar { transform: scaleY(0.04); }
.ladder-bars li:not(.hit) .bar { filter: grayscale(0.7) opacity(0.5); }
.ladder-bars li.hit:last-of-type .bar,
.ladder-bars li.hit:not(:has(~ li.hit)) .bar { box-shadow: 0 0 0 3px var(--pt-accent), 0 14px 30px -10px var(--pt-accent); }

/* ── Pasos ── */
.pt-steps ol { position: relative; display: grid; gap: 1rem; margin: 1.4rem 0 0; padding: 0; list-style: none; }
@media (min-width: 52rem) { .pt-steps ol { grid-template-columns: repeat(4, 1fr); } }
.pt-steps ol::before {
  content: ""; position: absolute; left: 1.2rem; top: 1.2rem; bottom: 1.2rem; width: 3px; border-radius: 3px;
  background: linear-gradient(var(--timber-primary), var(--pt-accent)); transform-origin: top; transition: transform 1.4s var(--ease);
}
@media (min-width: 52rem) {
  .pt-steps ol::before { left: 1.2rem; right: calc(25% - 1.45rem); top: 1.2rem; bottom: auto; width: auto; height: 3px; transform-origin: left; }
}
.pt:not(.still) .pt-steps:not(.in) ol::before { transform: scaleY(0); }
@media (min-width: 52rem) { .pt:not(.still) .pt-steps:not(.in) ol::before { transform: scaleX(0); } }
.pt-steps li { position: relative; display: flex; gap: 0.8rem; align-items: flex-start; }
@media (min-width: 52rem) { .pt-steps li { flex-direction: column; } }
.step-n {
  position: relative; z-index: 1; flex: none; width: 2.4rem; height: 2.4rem; display: grid; place-items: center; border-radius: 50%;
  font-weight: 900; color: #fff; background: var(--timber-primary); box-shadow: 0 0 0 5px var(--timber-bg, #f4f1ea);
  transition: transform 0.5s var(--ease) calc(0.25s + var(--i) * 0.25s), background 0.3s;
}
.pt:not(.still) .pt-steps:not(.in) .step-n { transform: scale(0); }
.pt-steps li:last-child .step-n { background: var(--pt-accent); color: #1a1208; }
.pt-steps li b { display: block; font-size: 1rem; }
.pt-steps li p { margin: 0.25rem 0 0; color: var(--timber-muted); font-size: 0.9rem; line-height: 1.5; }

/* ── Portal: funciones ── */
.pt-features ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.8rem; margin: 1.4rem 0 0; padding: 0; list-style: none; }
.pt-features li {
  display: grid; gap: 0.35rem; padding: 1.1rem; border-radius: 1.1rem; border: 1px solid var(--timber-line); background: var(--timber-panel);
  transition: transform 0.25s var(--ease), box-shadow 0.25s, border-color 0.25s, opacity 0.7s var(--ease) calc(var(--i) * 0.08s), translate 0.7s var(--ease) calc(var(--i) * 0.08s);
}
.pt:not(.still) .pt-features:not(.in) li { opacity: 0; translate: 0 1.2rem; }
.pt-features li:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--timber-primary) 40%, var(--timber-line)); box-shadow: 0 18px 30px -20px rgba(8, 20, 40, 0.4); }
.f-ico { width: 2.6rem; height: 2.6rem; display: grid; place-items: center; border-radius: 0.8rem; color: var(--timber-primary); background: color-mix(in srgb, var(--timber-primary) 10%, transparent); }
.pt-features li b { font-size: 0.98rem; }
.pt-features li p { margin: 0; color: var(--timber-muted); font-size: 0.88rem; line-height: 1.5; }

/* ── Preguntas ── */
.pt-faq { max-width: 46rem; margin: 0 auto; text-align: center; }
.pt-faq details { margin-top: 0.6rem; border: 1px solid var(--timber-line); border-radius: 1rem; background: var(--timber-panel); text-align: left; overflow: hidden; }
.pt-faq details:first-of-type { margin-top: 1.3rem; }
.pt-faq summary { position: relative; padding: 0.95rem 2.6rem 0.95rem 1.1rem; font-weight: 800; cursor: pointer; list-style: none; }
.pt-faq summary::-webkit-details-marker { display: none; }
.pt-faq summary::after {
  content: "+"; position: absolute; right: 1rem; top: 50%; translate: 0 -50%; width: 1.6rem; height: 1.6rem; display: grid; place-items: center;
  border-radius: 50%; font-weight: 900; color: var(--timber-primary); background: color-mix(in srgb, var(--timber-primary) 10%, transparent); transition: rotate 0.25s var(--ease);
}
.pt-faq details[open] summary::after { rotate: 45deg; }
.pt-faq details p { margin: 0; padding: 0 1.1rem 1rem; color: var(--timber-muted); line-height: 1.55; }
.pt-faq details[open] p { animation: pt-open 0.35s var(--ease); }
@keyframes pt-open { from { opacity: 0; transform: translateY(-0.4rem); } }

.pt.still *, .pt.still *::before, .pt.still *::after { animation: none !important; transition: none !important; }
</style>
