<template>
  <div class="pos-shell" :class="{ desk: isDesk }">
    <header class="pos-top">
      <div class="brand">
        <img :src="logoSrc" alt="" class="brand-logo" />
        <div class="brand-text">
          <p class="brand-name hide-mobile"><BrandName tone="dark" /></p>
          <p class="brand-venue">{{ businessName }}</p>
        </div>
      </div>

      <!-- Nav PC (rail horizontal en top) -->
      <nav class="top-nav only-pc" aria-label="Navegación">
        <router-link
          v-for="item in dock"
          :key="'top-' + item.to"
          :to="item.to"
          class="top-nav-item"
          active-class=""
          exact-active-class="router-link-active"
        >
          <span class="dock-ico" v-html="item.icon"></span>
          {{ item.label }}
        </router-link>
      </nav>

      <div class="top-actions">
        <span class="clock hide-mobile">{{ clock }}</span>
        <button
          type="button"
          class="icon-btn only-pc"
          :title="isDark ? 'Tema claro' : 'Tema oscuro'"
          @click="toggleUiTheme"
        >
          {{ isDark ? '☀' : '☾' }}
        </button>
        <button v-if="moreItems.length" type="button" class="icon-btn" @click="moreOpen = !moreOpen" aria-label="Más opciones">
          Más
        </button>
        <button type="button" class="icon-btn ghost only-pc" @click="logout">Salir</button>
      </div>
    </header>

    <div class="pos-body">
      <div v-if="billingBanner" class="billing-banner" :class="billingBanner.tone">
        <span>{{ billingBanner.text }}</span>
        <router-link to="/billing">Facturación</router-link>
      </div>

      <div v-if="moreOpen" class="more-sheet" @click.self="moreOpen = false">
        <div class="more-panel">
          <h3>Más opciones</h3>
          <p class="more-clock only-mobile">{{ clock }}</p>
          <button type="button" class="more-link theme-btn hide-pc" @click="toggleUiTheme">
            Tema: {{ isDark ? 'Oscuro' : 'Claro' }}
          </button>
          <router-link
            v-for="item in moreItems"
            :key="item.to"
            :to="item.to"
            class="more-link"
            @click="moreOpen = false"
          >
            {{ item.label }}
          </router-link>
          <button type="button" class="more-link danger hide-pc" @click="logout">
            Cerrar sesión
          </button>
        </div>
      </div>

      <main class="pos-content">
        <slot />
      </main>
    </div>

    <!-- Dock solo móvil y tablet -->
    <nav class="pos-dock hide-pc" aria-label="Navegación principal">
      <router-link
        v-for="item in dock"
        :key="item.to"
        :to="item.to"
        class="dock-item"
        active-class=""
        exact-active-class="router-link-active"
      >
        <span class="dock-ico" v-html="item.icon"></span>
        <span class="dock-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { venueStore } from "../venueStore";
import BrandName from "./BrandName.vue";
import { themeStore, toggleUiTheme } from "../themeStore";
import { clearSession, canAccessRoute, hasRole, isPlatformAdmin } from "../authStore";
import { apiService } from "../apiService";

const route = useRoute();
const router = useRouter();
const moreOpen = ref(false);
const now = ref(new Date());
const billingStatus = ref(null);
let timer;

const isDesk = computed(() =>
  ["pos", "products", "orders"].includes(String(route.name || ""))
);

const ownerMode = computed(() => isPlatformAdmin());
const businessName = computed(() => (ownerMode.value ? "Soporte" : venueStore.businessName || "Mi negocio"));
const logoSrc = computed(() => venueStore.logoUrl || "/logo.svg");
const isDark = computed(() => themeStore.mode === "dark");
const clock = computed(() =>
  now.value.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
);

const billingBanner = computed(() => {
  const s = billingStatus.value;
  if (!s || !hasRole("admin", "cashier")) return null;
  if (s.billingStatus === "past_due") {
    return { tone: "danger", text: "Pago pendiente — regulariza tu suscripción." };
  }
  if (s.billingStatus === "suspended") {
    return { tone: "danger", text: "Cuenta suspendida — contacta a Mi Tiendita o paga tu plan." };
  }
  if (s.billingStatus === "trialing") {
    const days = Number(s.trialDaysLeft);
    return {
      tone: days <= 3 ? "danger" : "warn",
      text:
        days <= 0
          ? "Tu prueba terminó. Activa un plan para seguir cobrando."
          : `Prueba: te quedan ${days} día(s). Activa un plan cuando quieras.`,
    };
  }
  if (s.cancelAtPeriodEnd && s.currentPeriodEnd) {
    return {
      tone: "warn",
      text: `La suscripción no se renovará. Acceso hasta ${new Date(s.currentPeriodEnd).toLocaleDateString("es-MX")}.`,
    };
  }
  return null;
});

const ico = {
  sell: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16l-1.2 12.2a2 2 0 01-2 1.8H7.2a2 2 0 01-2-1.8L4 7z"/><path d="M8 7V5a4 4 0 018 0v2"/></svg>`,
  products: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-2.2-1.4L12 21l-3.8-1.4L6 21V3z"/><path d="M9 8h6M9 12h6"/></svg>`,
};

const ownerDock = [
  { to: "/platform", name: "platform", label: "Resumen", icon: ico.cash },
  { to: "/platform/clientes", name: "platformClients", label: "Clientes", icon: ico.products },
  { to: "/platform/ganancias", name: "platformRevenue", label: "Ganancias", icon: ico.sell },
  { to: "/platform/ia", name: "platformAi", label: "Gastos IA", icon: ico.spark },
  { to: "/platform/gastos", name: "platformExpenses", label: "Gastos", icon: ico.receipt },
];

const allDock = [
  { to: "/pos", name: "pos", label: "Vender", icon: ico.sell },
  { to: "/products", name: "products", label: "Productos", icon: ico.products },
  { to: "/orders", name: "orders", label: "Caja", icon: ico.cash },
];

const allMore = [
  { to: "/dashboard", name: "dashboard", label: "Resumen / Dashboard" },
  { to: "/staff", name: "staff", label: "Empleados" },
  { to: "/billing", name: "billing", label: "Facturación / Planes" },
  { to: "/settings", name: "settings", label: "Configuración" },
];

const dock = computed(() => (ownerMode.value ? ownerDock : allDock.filter((i) => canAccessRoute(i.name))));
const moreItems = computed(() => allMore.filter((i) => canAccessRoute(i.name)));

function logout() {
  moreOpen.value = false;
  clearSession();
  router.push("/");
}

async function loadBilling() {
  if (!hasRole("admin", "cashier")) return;
  try {
    billingStatus.value = await apiService.getBillingStatus();
  } catch {
    billingStatus.value = null;
  }
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
  loadBilling();
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.pos-shell {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background:
    radial-gradient(ellipse 70% 45% at 100% 0%, color-mix(in srgb, var(--timber-primary) 10%, transparent), transparent 55%),
    var(--timber-surface);
  font-family: var(--font-sans);
  color: var(--timber-ink);
}

.billing-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.billing-banner.warn {
  background: color-mix(in srgb, #e08a1e 28%, var(--timber-panel));
  color: var(--timber-ink);
}
.billing-banner.danger {
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
}
.billing-banner a {
  color: inherit;
  font-weight: 800;
  text-decoration: underline;
}

.pos-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.65rem;
  padding: 0.35rem 0.65rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
  z-index: 30;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.brand-logo {
  width: 2rem;
  height: 2rem;
  border-radius: 0.45rem;
  object-fit: cover;
  flex-shrink: 0;
}
.brand-name {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: -0.03em;
  text-transform: none;
  color: color-mix(in srgb, var(--timber-topbar-text) 62%, #7eb0e8);
  font-weight: 700;
}
.brand-venue {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 42vw;
}

.top-nav {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  justify-content: center;
  min-width: 0;
}
.top-nav-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.4rem;
  padding: 0 0.85rem;
  border-radius: 0.55rem;
  color: color-mix(in srgb, var(--timber-topbar-text) 78%, transparent);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.88rem;
}
.top-nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.clock {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.95rem;
  opacity: 0.9;
  margin-right: 0.15rem;
}
.icon-btn {
  min-height: 2.35rem;
  min-width: 2.6rem;
  padding: 0 0.65rem;
  border: none;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.12);
  color: var(--timber-topbar-text);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.icon-btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.pos-body {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pos-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 0.55rem 0.65rem;
  display: flex;
  flex-direction: column;
}
.pos-content > * {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pos-shell.desk .pos-content {
  padding: 0;
}

.pos-dock {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
  padding: 0.28rem 0.4rem calc(0.32rem + env(safe-area-inset-bottom, 0px));
  background: var(--timber-dock);
  border-top: 1px solid var(--timber-line);
  z-index: 30;
  flex-shrink: 0;
}
.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.08rem;
  min-height: 3.15rem;
  border-radius: 0.65rem;
  text-decoration: none;
  color: var(--timber-dock-text);
  font-weight: 700;
  font-size: 0.72rem;
}
.dock-item.router-link-active {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  box-shadow: var(--timber-shadow);
}
.dock-ico { display: grid; place-items: center; }

.more-sheet {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(10, 18, 32, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 3.25rem 0.65rem 1rem;
}
.more-panel {
  width: min(22rem, 92vw);
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 1rem;
  padding: 1rem;
  display: grid;
  gap: 0.4rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  border: 1px solid var(--timber-line);
}
.more-panel h3 {
  margin: 0 0 0.25rem;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}
.more-clock {
  margin: 0 0 0.35rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--timber-muted);
}
.more-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.9rem 0.85rem;
  border-radius: 0.7rem;
  text-decoration: none;
  color: var(--timber-ink);
  font-weight: 600;
  font-size: 1rem;
  background: var(--timber-primary-soft);
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.more-link.danger {
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
}
.theme-btn {
  background: color-mix(in srgb, var(--timber-accent) 18%, var(--timber-panel));
}

/* —— Tablet —— */
@media (min-width: 768px) and (max-width: 1099.98px) {
  .pos-top { padding: 0.4rem 0.85rem; }
  .brand-venue { max-width: 28vw; font-size: 1.05rem; }
  .dock-item { min-height: 3.5rem; font-size: 0.8rem; }
  .pos-shell:not(.desk) .pos-content { padding: 0.75rem 1rem; }
}

/* —— PC —— */
@media (min-width: 1100px) {
  .pos-shell {
    grid-template-rows: auto minmax(0, 1fr);
  }
  .pos-top { padding: 0.45rem 1rem; gap: 1rem; }
  .brand-venue { max-width: 16rem; font-size: 1.05rem; }
  .pos-shell:not(.desk) .pos-content { padding: 0.9rem 1.25rem; }
}
</style>
