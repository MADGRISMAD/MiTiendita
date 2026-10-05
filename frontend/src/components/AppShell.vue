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
          <em v-if="item.badge" class="nav-badge" :aria-label="`${item.badge} por responder`">{{ item.badge > 99 ? '99+' : item.badge }}</em>
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
        <button
          v-if="moreItems.length || ownerMode"
          type="button"
          class="icon-btn"
          :class="{ 'only-pc': moreInDock }"
          aria-label="Más opciones"
          @click="moreOpen = !moreOpen"
        >
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
      <div v-if="offlineBanner" class="billing-banner" :class="offlineBanner.tone" role="status">
        <span>{{ offlineBanner.text }}<small v-if="offlineBanner.last" class="sync-last"> · {{ offlineBanner.last }}</small></span>
        <span v-if="offlineBanner.upload || offlineBanner.review" class="banner-acts">
          <button v-if="offlineBanner.upload" type="button" :disabled="offlineStore.syncing" @click="flushOfflineSales({ force: true })">
            Subir ahora
          </button>
          <router-link v-if="offlineBanner.review && canAccessRoute('orders')" to="/orders">Revisar</router-link>
        </span>
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
          <WhatsAppHelp compact class="more-wa" @open="moreOpen = false" />
          <button type="button" class="more-link danger hide-pc" @click="logout">
            Cerrar sesión
          </button>
        </div>
      </div>

      <main class="pos-content">
        <slot />
      </main>
    </div>

    <!-- Pestañas: barra inferior en celular, riel lateral en tablet -->
    <nav class="pos-dock hide-pc" aria-label="Navegación principal" :style="{ '--tabs': dockCount }">
      <router-link
        v-for="item in dock"
        :key="item.to"
        :to="item.to"
        class="dock-item"
        active-class=""
        exact-active-class="router-link-active"
      >
        <span class="dock-ico" v-html="item.icon"></span>
        <em v-if="item.badge" class="nav-badge dot" :aria-label="`${item.badge} por responder`">{{ item.badge > 99 ? '99+' : item.badge }}</em>
        <span class="dock-label">{{ item.label }}</span>
      </router-link>
      <button
        v-if="moreInDock"
        type="button"
        class="dock-item dock-more"
        :class="{ 'router-link-active': moreOpen || onMoreRoute }"
        :aria-expanded="moreOpen"
        @click="moreOpen = !moreOpen"
      >
        <span class="dock-ico" v-html="ico.more"></span>
        <span class="dock-label">Más</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { venueStore } from "../venueStore";
import BrandName from "./BrandName.vue";
import WhatsAppHelp from "./WhatsAppHelp.vue";
import { themeStore, toggleUiTheme } from "../themeStore";
import { authStore, canAccessRoute, hasRole, isPartner, isPartnerAdmin, isPlatformAdmin, isPlatformStaff } from "../authStore";
import { apiService, logoutSession } from "../apiService";
import { applyBillingStatus } from "../billingStore";
import { offlineStore } from "../offlineFlags";
import { platformStore } from "../platform/platformStore";
import { flushOfflineSales } from "../offlineSync";

const route = useRoute();
const router = useRouter();
const moreOpen = ref(false);
const now = ref(new Date());
const billingStatus = ref(null);
let timer;

const isDesk = computed(() =>
  ["pos", "products", "orders"].includes(String(route.name || ""))
);

// Cuentas fuera de una tienda (plataforma y socios): sin caja, facturación ni ventas sin conexión
const ownerMode = computed(() => isPlatformStaff() || isPartner());
const businessName = computed(() => {
  if (!ownerMode.value) return venueStore.businessName || "Mi negocio";
  if (isPartner()) return authStore.partnerName || "Portal de socios";
  return isPlatformAdmin() ? "Admin" : "Soporte";
});
const logoSrc = computed(() => venueStore.logoUrl || "/logo.svg");
const isDark = computed(() => themeStore.mode === "dark");
const clock = computed(() => {
  const tz = venueStore.timezone || "America/Mexico_City";
  try {
    return now.value.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  } catch {
    return now.value.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }
});

const billingBanner = computed(() => {
  const s = billingStatus.value;
  if (!s || !hasRole("admin", "cashier")) return null;
  if (s.plan === "perpetual" || s.isPerpetual) return null;
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

const offlineBanner = computed(() => {
  if (ownerMode.value) return null;
  const n = offlineStore.pending;
  const f = offlineStore.failed;
  const ventas = (k) => `${k} ${k === 1 ? "venta" : "ventas"}`;
  const withErr = f ? ` · ${ventas(f)} con error` : "";
  const last = lastSyncText.value;
  if (!offlineStore.online) {
    return {
      tone: "warn",
      text: n
        ? `Sin internet · la caja sigue. ${ventas(n)} por subir${withErr}.`
        : `Sin internet · puedes cobrar con el catálogo guardado${withErr}.`,
      review: f > 0,
    };
  }
  if (offlineStore.authNeeded && n) {
    return { tone: "danger", text: `No se pudieron subir ${ventas(n)}: vuelve a iniciar sesión o revisa tu suscripción.`, review: true };
  }
  if (offlineStore.syncing && n) return { tone: "warn", text: `Subiendo ${ventas(n)}…` };
  if (n) return { tone: "warn", text: `${ventas(n)} de este dispositivo por subir${withErr}.`, upload: true, review: f > 0, last };
  if (f) return { tone: "danger", text: `${ventas(f)} de este dispositivo ${f === 1 ? "no se pudo subir" : "no se pudieron subir"}.`, review: true, last };
  return null;
});
// "última subida 10:42" (o con fecha si no fue hoy)
const lastSyncText = computed(() => {
  const at = offlineStore.lastSyncAt;
  if (!at) return "";
  const d = new Date(at);
  const today = new Date(now.value);
  const hm = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === today.toDateString()
    ? `última subida ${hm}`
    : `última subida ${d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} ${hm}`;
});

const ico = {
  sell: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16l-1.2 12.2a2 2 0 01-2 1.8H7.2a2 2 0 01-2-1.8L4 7z"/><path d="M8 7V5a4 4 0 018 0v2"/></svg>`,
  products: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z"/></svg>`,
  receipt: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2.2-1.4L12 21l-3.8-1.4L6 21V3z"/><path d="M9 8h6M9 12h6"/></svg>`,
  more: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>`,
  people: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="3.2"/><path d="M22 21v-2a3.6 3.6 0 00-3-3.5"/><path d="M16 3.2a3.2 3.2 0 010 6.2"/></svg>`,
  home: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2.5-8h13L21 13"/><path d="M3 13v6h18v-6h-5l-1.5 2h-5L8 13H3z"/></svg>`,
};

// Plataforma: soporte ve lo de atender; el admin, además, el dinero y el equipo
const supportDock = [
  { to: "/platform", name: "platform", label: "Hoy", icon: ico.home },
  { to: "/platform/soporte", name: "platformSupport", label: "Soporte", icon: ico.inbox },
  { to: "/platform/clientes", name: "platformClients", label: "Clientes", icon: ico.products },
];
const adminDock = [
  ...supportDock,
  { to: "/platform/finanzas", name: "platformFinance", label: "Finanzas", icon: ico.cash },
  { to: "/platform/vendedores", name: "platformReferrers", label: "Vendedores", icon: ico.tag },
  { to: "/platform/equipo", name: "platformTeam", label: "Equipo", icon: ico.people },
];

// Socios: el dueño ve además sus comisiones; el equipo es visible para todos, solo el dueño lo cambia
const partnerStaffDock = [
  { to: "/socio", name: "partner", label: "Inicio", icon: ico.home },
  { to: "/socio/clientes", name: "partnerClients", label: "Mis tiendas", icon: ico.products },
  { to: "/socio/equipo", name: "partnerTeam", label: "Equipo", icon: ico.people },
];
const partnerAdminDock = [
  partnerStaffDock[0],
  partnerStaffDock[1],
  { to: "/socio/comisiones", name: "partnerCommissions", label: "Comisiones", icon: ico.cash },
  partnerStaffDock[2],
];

const allDock = [
  { to: "/pos", name: "pos", label: "Vender", icon: ico.sell },
  { to: "/products", name: "products", label: "Productos", icon: ico.products },
  { to: "/orders", name: "orders", label: "Caja", icon: ico.cash },
];

const allMore = [
  { to: "/dashboard", name: "dashboard", label: "Resumen / Reportes" },
  { to: "/inventory", name: "inventory", label: "Inventario / Proveedores" },
  { to: "/customers", name: "customers", label: "Clientes" },
  { to: "/staff", name: "staff", label: "Empleados" },
  { to: "/billing", name: "billing", label: "Facturación / Planes" },
  { to: "/settings", name: "settings", label: "Configuración" },
  { to: "/ayuda", name: "help", label: "Ayuda" },
];

const dock = computed(() => {
  if (!ownerMode.value) return allDock.filter((i) => canAccessRoute(i.name));
  if (isPartner()) return isPartnerAdmin() ? partnerAdminDock : partnerStaffDock;
  const items = isPlatformAdmin() ? adminDock : supportDock;
  // Tickets por responder sobre «Soporte»
  return items.map((i) => (i.name === "platformSupport" ? { ...i, badge: platformStore.waiting || 0 } : i));
});
const moreItems = computed(() => allMore.filter((i) => canAccessRoute(i.name)));
// "Más" vive con las demás pestañas cuando caben (celular y tablet)
const moreInDock = computed(() => (moreItems.value.length > 0 || ownerMode.value) && dock.value.length <= 4);
const dockCount = computed(() => dock.value.length + (moreInDock.value ? 1 : 0));
const onMoreRoute = computed(() => moreItems.value.some((i) => i.name === route.name));

function logout() {
  moreOpen.value = false;
  logoutSession().finally(() => router.push("/"));
}

async function loadBilling() {
  if (ownerMode.value) return;
  try {
    billingStatus.value = await apiService.getBillingStatus();
    applyBillingStatus(billingStatus.value);
  } catch {
    billingStatus.value = null;
  }
}

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date();
  }, 30000);
  loadBilling();
  flushOfflineSales();
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.nav-badge {
  min-width: 1.15rem;
  height: 1.15rem;
  margin-left: 0.35rem;
  padding: 0 0.3rem;
  border-radius: 99px;
  background: var(--timber-danger);
  color: #fff;
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 800;
  line-height: 1.15rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.nav-badge.dot {
  position: absolute;
  top: 0.15rem;
  left: calc(50% + 0.55rem);
  margin: 0;
}
.dock-item { position: relative; }
.more-wa {
  margin: 0.4rem 0;
}
.pos-shell {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  display: grid;
  grid-template-areas: "top" "body" "dock";
  grid-template-columns: minmax(0, 1fr);
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
.billing-banner .sync-last { font-weight: 500; opacity: 0.8; }
.banner-acts { display: inline-flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
.banner-acts button {
  min-height: 2rem;
  padding: 0 0.7rem;
  border: 1px solid currentColor;
  border-radius: 0.55rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.banner-acts button:disabled { opacity: 0.5; cursor: default; }

.pos-top {
  grid-area: top;
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
  gap: 0.25rem;
  flex: 1;
  justify-content: center;
  min-width: 0;
}
.top-nav-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.5rem;
  padding: 0 0.95rem;
  border-radius: 0.7rem;
  color: color-mix(in srgb, var(--timber-topbar-text) 72%, transparent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.15s ease, color 0.15s ease;
}
.top-nav-item .dock-ico {
  width: auto;
  height: auto;
  background: none;
}
.top-nav-item:hover {
  color: var(--timber-topbar-text);
  background: rgba(255, 255, 255, 0.07);
}
.top-nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
  font-weight: 700;
}
.top-nav-item.router-link-active::after {
  content: "";
  position: absolute;
  left: 0.95rem;
  right: 0.95rem;
  bottom: -0.38rem;
  height: 3px;
  border-radius: 3px;
  background: var(--timber-accent);
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
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.icon-btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.pos-body {
  grid-area: body;
  min-width: 0;
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
  padding-bottom: calc(0.55rem + env(safe-area-inset-bottom, 0px));
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
  grid-area: dock;
  display: grid;
  grid-template-columns: repeat(var(--tabs, 4), minmax(0, 1fr));
  gap: 0.15rem;
  padding: 0.3rem 0.35rem calc(0.35rem + env(safe-area-inset-bottom, 0px));
  background: var(--timber-dock);
  border-top: 1px solid var(--timber-line);
  z-index: 30;
}
.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 3.25rem;
  padding: 0.25rem 0.15rem;
  border: none;
  border-radius: 0.75rem;
  background: transparent;
  color: var(--timber-dock-text);
  font: inherit;
  font-weight: 600;
  font-size: 0.72rem;
  text-decoration: none;
  cursor: pointer;
}
.pos-dock[style*="--tabs: 6"] .dock-item,
.pos-dock[style*="--tabs: 7"] .dock-item { font-size: 0.64rem; }
.pos-dock[style*="--tabs: 6"] .dock-ico,
.pos-dock[style*="--tabs: 7"] .dock-ico { width: 2.5rem; }
.dock-ico {
  display: grid;
  place-items: center;
  width: 3.4rem;
  height: 1.95rem;
  border-radius: 999px;
  transition: background 0.15s ease, color 0.15s ease;
}
.dock-label {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dock-item.router-link-active {
  color: var(--timber-primary);
  font-weight: 700;
}
.dock-item.router-link-active .dock-ico {
  background: var(--timber-primary-soft);
}
.dock-item:active .dock-ico { background: color-mix(in srgb, var(--timber-primary) 10%, transparent); }

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

/* —— Celular: "Más" sale desde abajo, junto a las pestañas —— */
@media (max-width: 767.98px) {
  .more-sheet {
    align-items: flex-end;
    justify-content: center;
    padding: 0 0 calc(4.3rem + env(safe-area-inset-bottom, 0px));
  }
  .more-panel { width: calc(100% - 1.3rem); }
}

/* —— Tablet: pestañas en un riel a la izquierda —— */
@media (min-width: 768px) and (max-width: 1099.98px) {
  .pos-shell {
    grid-template-areas: "top top" "dock body";
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  .pos-top { padding: 0.4rem 0.85rem; }
  .brand-venue { max-width: 36vw; font-size: 1.05rem; }
  .pos-dock {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: 5.4rem;
    padding: 0.7rem 0.35rem calc(0.7rem + env(safe-area-inset-bottom, 0px));
    border-top: none;
    border-right: 1px solid var(--timber-line);
  }
  .dock-more { margin-top: auto; }
  .dock-item { min-height: 3.9rem; font-size: 0.74rem; }
  .pos-shell:not(.desk) .pos-content { padding: 0.75rem 1rem; }
  .more-sheet {
    justify-content: flex-start;
    align-items: flex-end;
    padding: 1rem 1rem 1rem 6rem;
  }
}

/* —— PC —— */
@media (min-width: 1100px) {
  .pos-shell {
    grid-template-areas: "top" "body";
    grid-template-rows: auto minmax(0, 1fr);
  }
  .pos-top { padding: 0.45rem 1rem; gap: 1rem; }
  .brand-venue { max-width: 16rem; font-size: 1.05rem; }
  .pos-shell:not(.desk) .pos-content { padding: 0.9rem 1.25rem; }
}
</style>
