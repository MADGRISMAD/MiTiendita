import { createApp } from "vue";
import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import App from "./App.vue";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
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
import Register from "./views/RegisterComponent.vue";
import LandingView from "./views/LandingView.vue";
import MenuView from "./views/MenuComponent.vue";
import SetupWizard from "./views/SetupWizard.vue";
import DashboardView from "./views/DashboardView.vue";
import StaffView from "./views/StaffView.vue";
import OrdersView from "./views/OrdersView.vue";
import SettingsView from "./views/SettingsView.vue";
import InviteAcceptView from "./views/InviteAcceptView.vue";
import ForgotPasswordView from "./views/ForgotPasswordView.vue";
import ResetPasswordView from "./views/ResetPasswordView.vue";
import PrintOrderView from "./views/PrintOrderView.vue";
import PrintCashCloseView from "./views/PrintCashCloseView.vue";
import InvoiceRequestView from "./views/InvoiceRequestView.vue";
import BillingView from "./views/BillingView.vue";
import PlatformAdminView from "./views/PlatformAdminView.vue";
import NotFoundView from "./views/NotFoundView.vue";
import LegalView from "./views/LegalView.vue";
import HelpView from "./views/HelpView.vue";
import CustomersView from "./views/CustomersView.vue";
import InventoryView from "./views/InventoryView.vue";

const authMeta = (roles?: string[]) => ({
  requiresAuth: true,
  requiresSetup: true,
  roles,
});

const routes: RouteRecordRaw[] = [
  { path: "/", name: "landing", component: LandingView },
  { path: "/login", name: "login", component: Login },
  { path: "/register", name: "register", component: Register },
  { path: "/forgot", name: "forgot", component: ForgotPasswordView },
  { path: "/reset/:token", name: "reset", component: ResetPasswordView },
  { path: "/invite/:token", name: "invite", component: InviteAcceptView },
  { path: "/terminos", name: "terms", component: LegalView, props: { page: "terms" } },
  { path: "/privacidad", name: "privacy", component: LegalView, props: { page: "privacy" } },
  { path: "/ayuda", name: "help", component: HelpView },
  { path: "/factura/:token", name: "factura", component: InvoiceRequestView },
  { path: "/setup", name: "setup", component: SetupWizard, meta: { requiresAuth: true } },
  { path: "/dashboard", name: "dashboard", component: DashboardView, meta: authMeta(["admin", "cashier"]) },
  // POS abarrotes
  { path: "/pos", name: "pos", component: MenuView, meta: authMeta(["admin", "cashier"]), props: { initialMode: "pos" } },
  { path: "/products", name: "products", component: MenuView, meta: authMeta(["admin"]), props: { initialMode: "manage" } },
  // Redirects legacy restaurant routes
  { path: "/main", redirect: "/pos" },
  { path: "/menu", redirect: "/pos" },
  { path: "/meseros", redirect: "/pos" },
  { path: "/kitchen", redirect: "/orders" },
  { path: "/waitlist", redirect: "/dashboard" },
  { path: "/staff", name: "staff", component: StaffView, meta: authMeta(["admin"]) },
  { path: "/orders", name: "orders", component: OrdersView, meta: authMeta(["admin", "cashier"]) },
  { path: "/settings", name: "settings", component: SettingsView, meta: authMeta(["admin"]) },
  { path: "/customers", name: "customers", component: CustomersView, meta: authMeta(["admin", "cashier"]) },
  { path: "/inventory", name: "inventory", component: InventoryView, meta: authMeta(["admin", "cashier"]) },
  { path: "/reports", redirect: "/dashboard" },
  {
    path: "/billing",
    name: "billing",
    component: BillingView,
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  {
    path: "/platform",
    name: "platform",
    component: PlatformAdminView,
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/platform/clientes",
    name: "platformClients",
    component: PlatformAdminView,
    meta: { requiresAuth: true, roles: ["platform_admin", "platform_support"], owner: true },
  },
  {
    path: "/platform/equipo",
    name: "platformTeam",
    component: PlatformAdminView,
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/platform/ganancias",
    name: "platformRevenue",
    component: PlatformAdminView,
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/platform/ia",
    name: "platformAi",
    component: PlatformAdminView,
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/platform/gastos",
    name: "platformExpenses",
    component: PlatformAdminView,
    meta: { requiresAuth: true, roles: ["platform_admin"], owner: true },
  },
  {
    path: "/print/order/:id",
    name: "printOrder",
    component: PrintOrderView,
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  {
    path: "/print/offline/:clientSaleId",
    name: "printOffline",
    component: PrintOrderView,
    meta: { requiresAuth: true, roles: ["admin", "cashier"] },
  },
  {
    path: "/print/cash/:id",
    name: "printCash",
    component: PrintCashCloseView,
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

const vuetify = createVuetify({
  components,
  directives,
});

const app = createApp(App);
app.use(router);
app.use(vuetify);
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
