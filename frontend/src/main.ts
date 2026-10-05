import { createApp } from "vue";
import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import App from "./App.vue";
import "./index.css";
import "./breakpoints.css";
import { fetchVenueSettings, isSetupComplete } from "./venueStore";
import "./themeStore";
import {
  canAccessRoute,
  clearSession,
  homeForRole,
  isAuthenticated,
} from "./authStore";
import "./apiService";
import { startOfflineRuntime } from "./offlineSync";

import Login from "./views/LoginComponent.vue";
import LandingView from "./views/LandingView.vue";

const PLATFORM_STAFF = ["platform_admin", "platform_support"];
const PARTNER_ROLES = ["partner_admin", "partner_staff"];
import NotFoundView from "./views/NotFoundView.vue";

const authMeta = (roles?: string[]) => ({
  requiresAuth: true,
  requiresSetup: true,
  roles,
});

const routes: RouteRecordRaw[] = [
  { path: "/", name: "landing", component: LandingView },
  { path: "/login", name: "login", component: Login },
  { path: "/register", name: "register", component: () => import("./views/RegisterComponent.vue") },
  { path: "/forgot", name: "forgot", component: () => import("./views/ForgotPasswordView.vue") },
  { path: "/reset/:token", name: "reset", component: () => import("./views/ResetPasswordView.vue") },
  { path: "/invite/:token", name: "invite", component: () => import("./views/InviteAcceptView.vue") },
  { path: "/terminos", name: "terms", component: () => import("./views/LegalView.vue"), props: { page: "terms" } },
  { path: "/privacidad", name: "privacy", component: () => import("./views/LegalView.vue"), props: { page: "privacy" } },
  { path: "/ayuda", name: "help", component: () => import("./views/HelpView.vue") },
  { path: "/factura/:token", name: "factura", component: () => import("./views/InvoiceRequestView.vue") },
  { path: "/setup", name: "setup", component: () => import("./views/SetupWizard.vue"), meta: { requiresAuth: true } },
  { path: "/dashboard", name: "dashboard", component: () => import("./views/DashboardView.vue"), meta: authMeta(["admin", "cashier"]) },
  // POS abarrotes
  { path: "/pos", name: "pos", component: () => import("./views/MenuComponent.vue"), meta: authMeta(["admin", "cashier"]), props: { initialMode: "pos" } },
  { path: "/products", name: "products", component: () => import("./views/MenuComponent.vue"), meta: authMeta(["admin"]), props: { initialMode: "manage" } },
  // Redirects legacy restaurant routes
  { path: "/main", redirect: "/pos" },
  { path: "/menu", redirect: "/pos" },
  { path: "/meseros", redirect: "/pos" },
  { path: "/kitchen", redirect: "/orders" },
  { path: "/waitlist", redirect: "/dashboard" },
  { path: "/staff", name: "staff", component: () => import("./views/StaffView.vue"), meta: authMeta(["admin"]) },
  { path: "/orders", name: "orders", component: () => import("./views/OrdersView.vue"), meta: authMeta(["admin", "cashier"]) },
  { path: "/settings", name: "settings", component: () => import("./views/SettingsView.vue"), meta: authMeta(["admin"]) },
  { path: "/customers", name: "customers", component: () => import("./views/CustomersView.vue"), meta: authMeta(["admin", "cashier"]) },
  { path: "/inventory", name: "inventory", component: () => import("./views/InventoryView.vue"), meta: authMeta(["admin", "cashier"]) },
  { path: "/reports", redirect: "/dashboard" },
  {
    path: "/billing",
    name: "billing",
    component: () => import("./views/BillingView.vue"),
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  // Área de plataforma (equipo de Mi Tiendita): cada pantalla en su archivo
  {
    path: "/platform",
    name: "platform",
    component: () => import("./views/platform/PlatformToday.vue"),
    meta: { requiresAuth: true, roles: PLATFORM_STAFF, owner: true },
  },
  {
    path: "/platform/soporte",
    name: "platformSupport",
    component: () => import("./views/platform/PlatformSupport.vue"),
    meta: { requiresAuth: true, roles: PLATFORM_STAFF, owner: true },
  },
  {
    path: "/platform/clientes",
    name: "platformClients",
    component: () => import("./views/platform/PlatformClients.vue"),
    meta: { requiresAuth: true, roles: PLATFORM_STAFF, owner: true },
  },
  {
    path: "/platform/clientes/:id",
    name: "platformClient",
    component: () => import("./views/platform/PlatformClients.vue"),
    meta: { requiresAuth: true, roles: PLATFORM_STAFF, owner: true },
  },
  {
    path: "/platform/finanzas",
    name: "platformFinance",
    component: () => import("./views/platform/PlatformFinance.vue"),
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/platform/vendedores",
    name: "platformReferrers",
    component: () => import("./views/platform/PlatformReferrers.vue"),
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/platform/vendedores/:id",
    name: "platformReferrer",
    component: () => import("./views/platform/PlatformReferrers.vue"),
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  // Portal de socios (vendedores/proveedores de Mi Tiendita)
  { path: "/socio", name: "partner", component: () => import("./views/partner/PartnerHome.vue"), meta: { requiresAuth: true, roles: PARTNER_ROLES, owner: true } },
  { path: "/socio/clientes", name: "partnerClients", component: () => import("./views/partner/PartnerClients.vue"), meta: { requiresAuth: true, roles: PARTNER_ROLES, owner: true } },
  { path: "/socio/clientes/:id", name: "partnerClient", component: () => import("./views/partner/PartnerClients.vue"), meta: { requiresAuth: true, roles: PARTNER_ROLES, owner: true } },
  { path: "/socio/comisiones", name: "partnerCommissions", component: () => import("./views/partner/PartnerCommissions.vue"), meta: { requiresAuth: true, roles: ["partner_admin"], owner: true } },
  { path: "/socio/equipo", name: "partnerTeam", component: () => import("./views/partner/PartnerTeam.vue"), meta: { requiresAuth: true, roles: PARTNER_ROLES, owner: true } },
  {
    path: "/platform/equipo",
    name: "platformTeam",
    component: () => import("./views/platform/PlatformTeam.vue"),
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  // Direcciones de antes
  { path: "/platform/ganancias", redirect: { name: "platformFinance", query: { v: "ingresos" } } },
  { path: "/platform/ia", redirect: { name: "platformFinance", query: { v: "ia" } } },
  { path: "/platform/gastos", redirect: { name: "platformFinance", query: { v: "gastos" } } },
  {
    path: "/print/order/:id",
    name: "printOrder",
    component: () => import("./views/PrintOrderView.vue"),
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  {
    path: "/print/offline/:clientSaleId",
    name: "printOffline",
    component: () => import("./views/PrintOrderView.vue"),
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  {
    path: "/print/cash/:id",
    name: "printCash",
    component: () => import("./views/PrintCashCloseView.vue"),
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "notFound",
    component: NotFoundView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: "smooth" };
    return { top: 0 };
  },
});

const publicNames = new Set([
  "landing",
  "login",
  "register",
  "forgot",
  "reset",
  "invite",
  "factura",
  "terms",
  "privacy",
  "notFound",
]);

// Un enlace con ?ref= (de un vendedor) se guarda aunque la persona navegue antes de registrarse
router.beforeEach((to) => {
  const ref = typeof to.query.ref === "string" ? to.query.ref.trim() : "";
  if (ref && /^[A-Za-z0-9-]{4,12}$/.test(ref)) {
    try {
      localStorage.setItem("mt_ref", ref);
    } catch {
      /* sin almacenamiento */
    }
  }
  return true;
});

router.beforeEach(async (to) => {
  if (publicNames.has(String(to.name))) {
    if (isAuthenticated() && (to.name === "login" || to.name === "register")) {
      return { name: homeForRole() };
    }
    return true;
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    return { name: "login" };
  }

  if (to.meta.roles && !canAccessRoute(String(to.name))) {
    return { name: homeForRole() };
  }

  if (to.name === "setup" || to.name === "billing" || to.matched.some((record) => record.meta.owner)) {
    return true;
  }

  if (to.meta.requiresSetup) {
    await fetchVenueSettings();
    if (!isSetupComplete()) {
      return { name: "setup" };
    }
  }

  return true;
});

const app = createApp(App);
app.use(router);
app.mount("#app");

startOfflineRuntime();

if (import.meta.env.PROD) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {});
}

export { clearSession };
export { apiClient as default } from "./apiService";
