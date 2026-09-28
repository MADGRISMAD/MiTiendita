<template>
  <AppShell>
    <div class="billing t-page">
      <header class="head">
        <div class="head-copy">
          <p class="kicker">Facturación</p>
          <h1>Planes de Mi Tiendita</h1>
          <p class="lede">
            Celular, tablet o PC. Sin instalar.
            <InventarioMagicoTerm /> y <InventarioMagicoTerm kind="precio" /> van incluidos en los tres planes.
          </p>
        </div>
        <div v-if="!loading && !err" class="head-tools">
          <div class="switch" role="group" aria-label="Periodo">
            <button type="button" :class="{ on: interval === 'month' }" @click="interval = 'month'">
              Mensual
            </button>
            <button type="button" :class="{ on: interval === 'year' }" @click="interval = 'year'">
              Anual
              <em>−2 meses</em>
            </button>
          </div>
          <button
            v-if="status.mpConfigured && status.mpPreapprovalId"
            type="button"
            class="sync-btn"
            :disabled="busy"
            @click="syncNow"
          >
            Sincronizar pago
          </button>
        </div>
      </header>

      <div v-if="loading" class="state">Cargando…</div>
      <div v-else-if="err" class="state err">{{ err }}</div>
      <template v-else>
        <p v-if="flash" class="flash" :class="{ ok: flashOk }">{{ flash }}</p>

        <section class="status-bar">
          <div class="account" :class="{ warn: !status.active }">
            <span class="dot" />
            <div>
              <strong>{{ statusLabel }}</strong>
              <span>
                <template v-if="status.billingStatus === 'trialing'">
                  {{ status.trialDaysLeft }} días de prueba
                </template>
                <template v-else-if="status.currentPeriodEnd">
                  hasta {{ formatDate(status.currentPeriodEnd) }}
                </template>
                · {{ planName(status.plan) }}
              </span>
            </div>
          </div>
          <div v-if="status.limits" class="usage">
            <p>
              <strong>Usuarios</strong>
              {{ status.limits.users?.used || 0 }} / {{ capLabel(status.limits.users?.max) }}
            </p>
            <p>
              <strong>Productos</strong>
              {{ status.limits.products?.used || 0 }} / {{ capLabel(status.limits.products?.max) }}
            </p>
            <p>
              <strong>Magia</strong>
              {{ status.aiQuotaLabel }}
            </p>
          </div>
        </section>

        <p v-if="status.cancelAtPeriodEnd" class="cancel-note">
          Esta suscripción no se renovará.
          <template v-if="status.currentPeriodEnd">
            Sigues activo hasta {{ formatDate(status.currentPeriodEnd) }}.
          </template>
          Elige un plan de nuevo si cambias de opinión.
        </p>

        <p v-if="interval === 'year'" class="year-tip">
          Anual: pagas una vez y te olvidas. Básico <strong>$3,490</strong> · Crecimiento
          <strong>$5,990</strong> · Pro <strong>$8,990</strong>.
        </p>

        <label v-if="status.mpConfigured && status.mpSandbox" class="payer-box">
          <span>Correo del comprador de prueba (Mercado Pago)</span>
          <input
            v-model="payerEmail"
            type="email"
            placeholder="el que te dio MP al crear el usuario Comprador"
            autocomplete="off"
          />
          <small>
            En sandbox no sirve tu Gmail real. Crea un usuario
            <strong>Comprador</strong> en tu app →
            <em>Cuentas de prueba</em> y pega aquí su correo.
          </small>
        </label>

        <div class="plans">
          <article
            v-for="p in plans"
            :key="p.id"
            class="plan"
            :class="{ hot: p.highlight, current: status.plan === p.id && status.active && matchesInterval(p) }"
          >
            <header class="plan-top">
              <div>
                <p v-if="p.badge" class="badge">{{ p.badge }}</p>
                <h2>{{ p.name }}</h2>
                <p class="tag">{{ p.tagline }}</p>
              </div>
              <div class="price-block">
                <template v-if="interval === 'month'">
                  <p class="price">${{ formatInt(p.price) }}</p>
                  <p class="per">MXN / mes</p>
                </template>
                <template v-else>
                  <p class="price">${{ formatInt(p.priceYear) }}</p>
                  <p class="per">MXN / año · ~${{ formatInt(p.monthlyFromYear) }}/mes</p>
                </template>
              </div>
            </header>

            <p class="magic">
              <InventarioMagicoTerm /> · <InventarioMagicoTerm kind="precio" /> · <strong>{{ p.aiQuotaLabel }}</strong>
            </p>

            <p class="pitch">{{ p.pitch }}</p>

            <ul>
              <li v-for="(f, i) in p.features" :key="i">{{ f }}</li>
            </ul>

            <button
              type="button"
              class="cta"
              :disabled="busy || (status.plan === p.id && status.active && !status.cancelAtPeriodEnd && matchesInterval(p))"
              @click="startCheckout(p.id)"
            >
              {{ ctaLabel(p) }}
            </button>
          </article>
        </div>

        <div class="bottom">
          <section class="extras">
            <p>
              <strong>Hardware</strong>
              Si lo necesitas, te vendemos tablet, impresora o escáner.
            </p>
          </section>
          <section class="extras">
            <p>
              <strong>Licencia perpetua</strong>
              Pago único, sin cuota mensual. No incluye Inventario Mágico ni Precio Mágico.
              Si te interesa, escríbenos desde Configuración → Soporte.
            </p>
          </section>
          <section v-if="canCancel" class="extras cancel-box">
            <p>
              <strong>Cancelar renovación</strong>
              Sigues usando el sistema hasta el fin del periodo pagado.
            </p>
            <button type="button" class="cancel-btn" :disabled="busy" @click="cancelPlan">
              Cancelar suscripción
            </button>
          </section>
        </div>

        <section v-if="history.length" class="history">
          <h3>Historial</h3>
          <ul>
            <li v-for="ev in history" :key="ev.id">
              <div>
                <strong>{{ eventLabel(ev.type) }}</strong>
                <span>{{ ev.note || planName(ev.plan) }}</span>
              </div>
              <time>{{ formatDate(ev.at) }}</time>
            </li>
          </ul>
        </section>

        <p v-if="status.mpConfigured && status.mpSandbox" class="dev sandbox">
          Mercado Pago en <strong>modo prueba (sandbox)</strong>. Usa tarjetas de test de MP.
        </p>
        <p v-else-if="status.mpConfigured" class="dev live">
          Mercado Pago conectado · cobros reales.
        </p>
        <p v-else class="dev">
          Modo desarrollo: al activar se simula el pago (sin Mercado Pago).
          Configura <code>MP_ACCESS_TOKEN</code> en el backend para cobrar de verdad.
        </p>
      </template>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import InventarioMagicoTerm from "../components/InventarioMagicoTerm.vue";
import { apiService } from "../apiService";
import { hasRole } from "../authStore";

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const busy = ref(false);
const err = ref("");
const flash = ref("");
const flashOk = ref(true);
const interval = ref(route.query.interval === "year" ? "year" : "month");
const status = ref({
  plan: "basic",
  billingStatus: "trialing",
  trialDaysLeft: 14,
  active: true,
  mpConfigured: false,
  mpSandbox: false,
  cancelAtPeriodEnd: false,
  limits: null,
});
const plans = ref([]);
const history = ref([]);
const payerEmail = ref("");

const canCancel = computed(
  () =>
    hasRole("admin") &&
    status.value.billingStatus === "active" &&
    !status.value.cancelAtPeriodEnd
);

const statusLabel = computed(() => {
  const map = {
    trialing: "Prueba activa",
    active: "Suscripción activa",
    past_due: "Pago pendiente",
    suspended: "Cuenta suspendida",
  };
  return map[status.value.billingStatus] || status.value.billingStatus;
});

function planName(id) {
  return plans.value.find((p) => p.id === id)?.name || id;
}

function formatInt(n) {
  return Number(n || 0).toLocaleString("es-MX");
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function matchesInterval(p) {
  const si = status.value.interval || "month";
  return interval.value === si;
}

function ctaLabel(p) {
  const current = status.value.plan === p.id && status.value.active && !status.value.cancelAtPeriodEnd && matchesInterval(p);
  if (current) return "Plan actual";
  if (status.value.cancelAtPeriodEnd && status.value.plan === p.id) return `Reactivar ${p.name}`;
  if (status.value.billingStatus === "trialing") return `Empezar con ${p.name}`;
  if (!status.value.mpConfigured) return `Activar ${p.name}`;
  return interval.value === "year" ? `Cambiar a ${p.name} anual` : `Cambiar a ${p.name}`;
}

function capLabel(n) {
  return n == null ? "Ilimitado" : String(n);
}

function eventLabel(type) {
  return (
    {
      checkout: "Checkout iniciado",
      activated: "Pago confirmado",
      cancelled: "Cancelación",
      webhook: "Actualización Mercado Pago",
      trial_started: "Prueba iniciada",
    }[type] || type
  );
}

async function load() {
  loading.value = true;
  err.value = "";
  try {
    const [s, p, h] = await Promise.all([
      apiService.getBillingStatus(),
      apiService.getBillingPlans(),
      apiService.getBillingHistory().catch(() => ({ events: [] })),
    ]);
    status.value = s;
    plans.value = p.plans || [];
    history.value = h.events || [];
    if (!payerEmail.value && s.mpPayerEmail) payerEmail.value = s.mpPayerEmail;
  } catch (e) {
    err.value = e.response?.data?.message || e.response?.data || "No se pudo cargar facturación";
  } finally {
    loading.value = false;
  }
}

async function startCheckout(plan) {
  busy.value = true;
  flash.value = "";
  try {
    if (status.value.mpSandbox && !String(payerEmail.value || "").trim()) {
      flashOk.value = false;
      flash.value =
        "En modo prueba indica el correo del usuario Comprador de Mercado Pago (Cuentas de prueba).";
      busy.value = false;
      return;
    }
    const res = await apiService.billingCheckout(
      plan,
      String(payerEmail.value || "").trim() || undefined,
      interval.value
    );
    if (res.mock || !status.value.mpConfigured) {
      await apiService.billingDevActivate(plan, res.preapprovalId, interval.value);
      await load();
      flashOk.value = true;
      flash.value = `Plan ${planName(plan)} activado (modo desarrollo).`;
      return;
    }
    const url = status.value.mpSandbox
      ? res.sandbox_init_point || res.init_point
      : res.init_point || res.sandbox_init_point;
    if (url) {
      if (res.localReturn) {
        flashOk.value = true;
        flash.value =
          "Se abrirá Mercado Pago. Al terminar, vuelve a esta pestaña y pulsa «Sincronizar pago».";
      }
      window.location.href = url;
    } else alert("No se recibió link de Mercado Pago");
  } catch (e) {
    const msg = e.response?.data || "Error al iniciar pago";
    flashOk.value = false;
    flash.value = String(msg);
    if (String(msg).toLowerCase().includes("payer") || String(msg).toLowerCase().includes("collector")) {
      flash.value =
        "En sandbox el pagador debe ser un usuario de prueba de MP (no tu correo real). Crea un Comprador en Cuentas de prueba y usa ese email.";
    }
  } finally {
    busy.value = false;
  }
}

async function handleReturnFromMp() {
  flash.value = "Confirmando pago con Mercado Pago…";
  flashOk.value = true;
  try {
    // Reintentos cortos: a veces MP tarda un segundo en autorizar
    let last = null;
    for (let i = 0; i < 4; i++) {
      last = await apiService.billingSync();
      if (last?.billingStatus === "active" || last?.active) break;
      if (!last?.pending) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
    await load();
    if (last?.active || status.value.active) {
      flashOk.value = true;
      flash.value = "Suscripción activada. ¡Listo para cobrar!";
    } else if (last?.pending) {
      flashOk.value = true;
      flash.value =
        "Pago pendiente en Mercado Pago. Si ya pagaste, espera un momento y recarga esta página.";
    } else {
      flashOk.value = true;
      flash.value = "Volviste de Mercado Pago. Si el pago no se refleja, usa «Sincronizar pago».";
    }
  } catch (e) {
    flashOk.value = false;
    flash.value = e.response?.data || "No se pudo confirmar el pago todavía. Intenta sincronizar.";
    await load();
  }
  router.replace({ path: "/billing" });
}

async function cancelPlan() {
  if (
    !confirm(
      "¿Cancelar la renovación? Sigues usando Mi Tiendita hasta el fin del periodo ya pagado."
    )
  ) {
    return;
  }
  busy.value = true;
  flash.value = "";
  try {
    const res = await apiService.billingCancel();
    await load();
    flashOk.value = true;
    flash.value = res.message || "Suscripción cancelada. No habrá más cargos automáticos.";
  } catch (e) {
    flashOk.value = false;
    flash.value = e.response?.data || "No se pudo cancelar";
  } finally {
    busy.value = false;
  }
}

async function syncNow() {
  busy.value = true;
  flash.value = "";
  try {
    const last = await apiService.billingSync();
    await load();
    flashOk.value = Boolean(last?.active);
    flash.value = last?.active
      ? "Suscripción sincronizada y activa."
      : `Estado MP: ${last?.mpStatus || "desconocido"}.`;
  } catch (e) {
    flashOk.value = false;
    flash.value = e.response?.data || "No se pudo sincronizar";
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await load();
  if (route.query.mock === "1" && route.query.plan) {
    try {
      const iv = route.query.interval === "year" ? "year" : "month";
      await apiService.billingDevActivate(String(route.query.plan), undefined, iv);
      await load();
      flashOk.value = true;
      flash.value = "Plan activado (simulación).";
      router.replace({ path: "/billing" });
    } catch {
      /* ignore */
    }
  } else if (route.query.mp === "return") {
    await handleReturnFromMp();
  }
});
</script>

<style scoped>
.billing {
  width: 100%;
  max-width: none;
  margin: 0;
  min-height: 100%;
  display: grid;
  align-content: start;
  gap: 1rem;
  overflow: auto;
  padding: 0.15rem 0 1.25rem;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem 1.5rem;
}
.head-copy { min-width: min(100%, 22rem); flex: 1 1 18rem; }
.head-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}
.kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--timber-accent);
}
.head h1 {
  margin: 0.2rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.55rem, 2.6vw, 2.15rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.12;
  color: var(--timber-ink);
}
.lede {
  margin: 0.45rem 0 0;
  max-width: 40rem;
  font-size: 1rem;
  line-height: 1.45;
  color: var(--timber-muted);
}

.state {
  padding: 1.25rem;
  border-radius: 1rem;
  background: var(--timber-panel);
  color: var(--timber-muted);
}
.state.err { color: var(--timber-danger); }

.status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.25rem;
  padding: 0.85rem 1.05rem;
  border-radius: 1rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
}
.account {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.9rem;
  color: var(--timber-muted);
}
.account strong { display: block; color: var(--timber-ink); font-weight: 800; }
.account span { font-size: 0.82rem; }
.dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--timber-success);
  flex-shrink: 0;
}
.account.warn .dot { background: var(--timber-warning); }

.usage {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 1.4rem;
  font-size: 0.86rem;
  color: var(--timber-muted);
}
.usage p { margin: 0; }
.usage strong { color: var(--timber-ink); margin-right: 0.25rem; }

.switch {
  display: inline-flex;
  padding: 0.2rem;
  border-radius: 999px;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
}
.switch button {
  border: none;
  background: transparent;
  min-height: 2.55rem;
  padding: 0 1.15rem;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--timber-muted);
}
.switch button em {
  margin-left: 0.35rem;
  font-style: normal;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.75;
}
.switch button.on {
  background: var(--timber-ink);
  color: var(--timber-panel);
}

.year-tip {
  margin: 0;
  font-size: 0.9rem;
  color: var(--timber-muted);
}
.year-tip strong { color: var(--timber-ink); }
.payer-box {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem 1rem;
  border-radius: 0.9rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.payer-box input {
  min-height: 2.6rem;
  border-radius: 0.65rem;
  border: 1px solid var(--timber-line);
  padding: 0.55rem 0.75rem;
  font: inherit;
  font-weight: 600;
  color: var(--timber-ink);
  background: var(--timber-panel-elevated);
}
.payer-box small {
  font-weight: 600;
  line-height: 1.4;
  color: var(--timber-muted);
}

.plans {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: 1fr;
  width: 100%;
}
@media (min-width: 760px) {
  .plans { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.plan {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 100%;
  padding: 1.35rem 1.25rem 1.2rem;
  border-radius: 1.15rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  position: relative;
}
.plan.hot {
  border-color: transparent;
  background:
    linear-gradient(var(--timber-panel), var(--timber-panel)) padding-box,
    linear-gradient(145deg, var(--timber-primary), var(--timber-accent)) border-box;
  border: 2px solid transparent;
  box-shadow: 0 18px 40px color-mix(in srgb, var(--timber-primary) 18%, transparent);
}
.plan.current::after {
  content: "Tu plan";
  position: absolute;
  top: 0.85rem;
  right: 0.9rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-primary);
}

.plan-top {
  display: grid;
  gap: 0.75rem;
}
@media (min-width: 1100px) {
  .plan-top {
    grid-template-columns: 1fr auto;
    align-items: start;
  }
}
.badge {
  margin: 0 0 0.35rem;
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1a1208;
  background: var(--timber-accent);
  padding: 0.22rem 0.45rem;
  border-radius: 0.35rem;
}
.plan h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 1.6vw, 1.55rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.tag {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--timber-muted);
  line-height: 1.35;
}
.price {
  margin: 0;
  font-size: clamp(2.1rem, 2.8vw, 2.55rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.per {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--timber-muted);
}

.magic {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--timber-primary);
  padding: 0.5rem 0.7rem;
  border-radius: 0.55rem;
  background: var(--timber-primary-soft);
}
.magic strong { color: var(--timber-ink); }

.pitch {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--timber-ink);
  font-weight: 600;
}

.plan ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
  flex: 1 1 auto;
  align-content: start;
}
.plan li {
  position: relative;
  padding-left: 1.05rem;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--timber-muted);
}
.plan li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--timber-accent);
}

.cta {
  margin-top: auto;
  min-height: 3rem;
  border: none;
  border-radius: 0.75rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  width: 100%;
}
.plan.hot .cta {
  background: var(--timber-ink);
  color: var(--timber-panel);
}
.cta:disabled { opacity: 0.55; cursor: wait; }

.bottom {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 1fr;
}
@media (min-width: 860px) {
  .bottom { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.dev {
  margin: 0;
  font-size: 0.78rem;
  color: var(--timber-muted);
}
.dev.sandbox {
  padding: 0.55rem 0.75rem;
  border-radius: 0.65rem;
  background: var(--timber-warning-soft);
  color: var(--timber-warning);
}
.dev.live {
  padding: 0.55rem 0.75rem;
  border-radius: 0.65rem;
  background: var(--timber-success-soft);
  color: var(--timber-success);
}
.dev code { font-size: 0.85em; }
.flash {
  margin: 0;
  padding: 0.7rem 0.85rem;
  border-radius: 0.7rem;
  background: var(--timber-warning-soft);
  color: var(--timber-warning);
  font-weight: 700;
  font-size: 0.9rem;
}
.flash.ok {
  background: var(--timber-success-soft);
  color: var(--timber-success);
}
.sync-btn {
  border: 1px solid var(--timber-line);
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 999px;
  min-height: 2.55rem;
  padding: 0 1rem;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}
.sync-btn:disabled { opacity: 0.6; }

.extras {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.05rem;
  border-radius: 0.9rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--timber-muted);
}
.extras p { margin: 0; }
.extras strong { display: block; margin-bottom: 0.2rem; color: var(--timber-ink); }

.cancel-note {
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 0.75rem;
  background: var(--timber-warning-soft);
  color: var(--timber-warning);
  font-weight: 700;
  font-size: 0.88rem;
}
.cancel-box {
  align-content: start;
}
.cancel-btn {
  justify-self: start;
  border: 1px solid color-mix(in srgb, var(--timber-danger) 40%, var(--timber-line));
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
  border-radius: 0.7rem;
  min-height: 2.4rem;
  padding: 0 0.9rem;
  font-weight: 800;
  cursor: pointer;
}
.history h3 {
  margin: 0 0 0.55rem;
  font-family: var(--font-display);
  font-size: 1.05rem;
}
.history ul { list-style: none; margin: 0; padding: 0; }
.history li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--timber-line);
  font-size: 0.88rem;
}
.history strong { display: block; color: var(--timber-ink); }
.history span { color: var(--timber-muted); font-size: 0.8rem; }
.history time { color: var(--timber-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
