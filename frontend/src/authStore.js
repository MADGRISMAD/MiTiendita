import { reactive } from "vue";
import { clearBillingStatus } from "./billingStore";

const STORAGE_KEY = "timber_auth";

// Los roles de restaurante ya no existen: una sesión guardada con uno de ellos pasa a cajero
function normalizeRole(role) {
  return ["hosstess", "waiter", "kitchen"].includes(role) ? "cashier" : role || null;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, role: null, tenantId: null, partnerId: null, partnerName: null, username: null, email: null };
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token || null,
      role: normalizeRole(parsed.role),
      tenantId: parsed.tenantId || null,
      partnerId: parsed.partnerId || null,
      partnerName: parsed.partnerName || null,
      username: parsed.username || null,
      email: parsed.email || null,
    };
  } catch {
    return { token: null, role: null, tenantId: null, partnerId: null, partnerName: null, username: null, email: null };
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
      partnerId: authStore.partnerId,
      partnerName: authStore.partnerName,
      username: authStore.username,
      email: authStore.email,
    })
  );
}

export function setSession({ token, role, tenantId, partnerId, username, email }) {
  authStore.token = token || null;
  authStore.role = normalizeRole(role);
  authStore.tenantId = tenantId || null;
  if (partnerId !== undefined) authStore.partnerId = partnerId || null;
  authStore.username = username || null;
  authStore.email = email || null;
  persist();
}

export function clearSession() {
  authStore.token = null;
  authStore.role = null;
  authStore.tenantId = null;
  authStore.partnerId = null;
  authStore.partnerName = null;
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

/** Nombre del socio para la barra superior (llega con el inicio del portal). */
export function setPartnerName(name) {
  authStore.partnerName = name || null;
  persist();
}

export function isPartnerAdmin() {
  return authStore.role === "partner_admin";
}

export function isPartner() {
  return authStore.role === "partner_admin" || authStore.role === "partner_staff";
}

/** Home y permisos orientados a POS de abarrotes */
export const roleHome = {
  admin: "pos",
  cashier: "pos",
  platform_admin: "platform",
  platform_support: "platform",
  partner_admin: "partner",
  partner_staff: "partner",
};

export const routeRoles = {
  dashboard: ["admin", "cashier"],
  pos: ["admin", "cashier"],
  products: ["admin"],
  staff: ["admin"],
  orders: ["admin", "cashier"],
  settings: ["admin"],
  setup: ["admin"],
  billing: ["admin", "cashier"],
  platform: ["platform_admin", "platform_support"],
  platformSupport: ["platform_admin", "platform_support"],
  platformClients: ["platform_admin", "platform_support"],
  platformClient: ["platform_admin", "platform_support"],
  platformFinance: ["platform_admin"],
  platformTeam: ["platform_admin"],
  platformReferrers: ["platform_admin"],
  platformReferrer: ["platform_admin"],
  partner: ["partner_admin", "partner_staff"],
  partnerClients: ["partner_admin", "partner_staff"],
  partnerClient: ["partner_admin", "partner_staff"],
  partnerTeam: ["partner_admin", "partner_staff"],
  partnerCommissions: ["partner_admin"],
  printOrder: ["admin", "cashier"],
  printOffline: ["admin", "cashier"],
  printCash: ["admin", "cashier"],
  customers: ["admin", "cashier"],
  recipes: ["admin"],
  inventory: ["admin", "cashier"],
};

export function canAccessRoute(name) {
  const allowed = routeRoles[name];
  if (!allowed) return true;
  return hasRole(...allowed);
}

export function homeForRole(role = authStore.role) {
  return roleHome[role] || "pos";
}
