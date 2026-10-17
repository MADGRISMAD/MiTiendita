import { createApp } from "vue";
import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import App from "./App.vue";
// Fuentes dentro del instalador (sin Google Fonts: la app funciona sin internet)
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/400-italic.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/figtree/800.css";
import "@fontsource/caveat/700.css";
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
import { desktopStore, loadDesktopStatus } from "./desktopStore";
import { startOfflineRuntime } from "./offlineSync";
import { startErrorReporting } from "./errorReport";
import { startPrintStation } from "./printStation";

import Login from "./views/LoginComponent.vue";

import NotFoundView from "./views/NotFoundView.vue";

const authMeta = (roles?: string[]) => ({
  requiresAuth: true,
  requiresSetup: true,
  roles,
});

const routes: RouteRecordRaw[] = [
  // Versión instalable: la app abre directo en el inicio de sesión.
  { path: "/", name: "login", component: Login, alias: "/login" },
  { path: "/register", name: "register", component: () => import("./views/RegisterComponent.vue") },
  { path: "/licencia", name: "license", component: () => import("./views/LicenseView.vue") },
  { path: "/forgot", name: "forgot", component: () => import("./views/ForgotPasswordView.vue") },
  { path: "/reset/:token", name: "reset", component: () => import("./views/ResetPasswordView.vue") },
  { path: "/invite/:token", name: "invite", component: () => import("./views/InviteAcceptView.vue") },
  { path: "/terminos", name: "terms", component: () => import("./views/LegalView.vue"), props: { page: "terms" } },
  { path: "/privacidad", name: "privacy", component: () => import("./views/LegalView.vue"), props: { page: "privacy" } },
  { path: "/ayuda", name: "help", component: () => import("./views/HelpView.vue") },
  { path: "/setup", name: "setup", component: () => import("./views/SetupWizard.vue"), meta: { requiresAuth: true } },
  { path: "/dashboard", name: "dashboard", component: () => import("./views/DashboardView.vue"), meta: authMeta(["admin", "cashier"]) },
  { path: "/pos", name: "pos", component: () => import("./views/MenuComponent.vue"), meta: authMeta(["admin", "cashier"]), props: { initialMode: "pos" } },
  { path: "/products", name: "products", component: () => import("./views/MenuComponent.vue"), meta: authMeta(["admin"]), props: { initialMode: "manage" } },
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
  "login",
  "register",
  "license",
  "forgot",
  "reset",
  "invite",
  "terms",
  "privacy",
  "notFound",
]);

router.beforeEach(async (to) => {
  // Versión instalable: sin activar → Activar; licencia de otra computadora → Reactivar
  await loadDesktopStatus();
  if (desktopStore.required) {
    const blocked = desktopStore.status === "other_device" || desktopStore.status === "invalid";
    if (blocked && to.name !== "license") return { name: "license" };
    if (!blocked && to.name === "license") return { name: "login" };
    if (!desktopStore.hasStore && !blocked && !["register", "terms", "privacy"].includes(String(to.name))) return { name: "register" };
    if (desktopStore.hasStore && desktopStore.status === "ok" && to.name === "register") return { name: "login" };
  }
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

  if (to.name === "setup") {
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
startErrorReporting();
startPrintStation();

startOfflineRuntime();


export { clearSession };
export { apiClient as default } from "./apiService";
