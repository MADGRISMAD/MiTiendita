import { reactive } from "vue";
import { clearBillingStatus } from "./billingStore";

const STORAGE_KEY = "timber_auth";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, role: null, tenantId: null, username: null, email: null };
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token || null,
      role: parsed.role || null,
      tenantId: parsed.tenantId || null,
      username: parsed.username || null,
      email: parsed.email || null,
    };
  } catch {
    return { token: null, role: null, tenantId: null, username: null, email: null };
  }
}

export const authStore = reactive({
  ...load(),
});

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: authStore.token,
      role: authStore.role,
      tenantId: authStore.tenantId,
      username: authStore.username,
      email: authStore.email,
    })
  );
}

export function setSession({ token, role, tenantId, username, email }) {
  authStore.token = token || null;
  authStore.role = role || null;
  authStore.tenantId = tenantId || null;
  authStore.username = username || null;
  authStore.email = email || null;
  persist();
}

export function clearSession() {
  authStore.token = null;
  authStore.role = null;
  authStore.tenantId = null;
  authStore.username = null;
  authStore.email = null;
  localStorage.removeItem(STORAGE_KEY);
  clearBillingStatus();
}

export function isAuthenticated() {
  return Boolean(authStore.token);
}

export function hasRole(...roles) {
  if (!roles.length) return true;
  return roles.includes(authStore.role);
}

export function isPlatformAdmin() {
  return authStore.role === "platform_admin";
}

export function isPlatformSupport() {
  return authStore.role === "platform_support";
}

export function isPlatformStaff() {
  return isPlatformAdmin() || isPlatformSupport();
}

/** Home y permisos orientados a POS de abarrotes */
export const roleHome = {
  admin: "pos",
  hosstess: "pos",
  waiter: "pos",
  kitchen: "pos",
  cashier: "pos",
  platform_admin: "platform",
  platform_support: "platformClients",
};

export const routeRoles = {
  dashboard: ["admin", "cashier"],
  pos: ["admin", "cashier", "waiter", "hosstess", "kitchen"],
  products: ["admin"],
  menu: ["admin", "cashier", "waiter"],
  main: ["admin", "cashier"],
  staff: ["admin"],
  orders: ["admin", "cashier"],
  kitchen: ["admin"],
  waitlist: ["admin"],
  settings: ["admin"],
  setup: ["admin"],
  billing: ["admin", "cashier"],
  platform: ["platform_admin"],
  platformClients: ["platform_admin", "platform_support"],
  platformTeam: ["platform_admin"],
  platformRevenue: ["platform_admin"],
  platformAi: ["platform_admin"],
  platformExpenses: ["platform_admin"],
  printOrder: ["admin", "cashier"],
  printCash: ["admin", "cashier"],
  customers: ["admin", "cashier"],
};

export function canAccessRoute(name) {
  const allowed = routeRoles[name];
  if (!allowed) return true;
  return hasRole(...allowed);
}

export function homeForRole(role = authStore.role) {
  return roleHome[role] || "pos";
}
