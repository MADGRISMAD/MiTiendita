import { reactive } from "vue";
import { apiService } from "./apiService";
import { authStore, setSession } from "./authStore";
import { clearBillingStatus } from "./billingStore";
import { offlineStore } from "./offlineFlags";

/**
 * Sucursales de la organización del dueño, para el submenú del menú «Más».
 * Se guarda por tienda: si cambia la sesión (otra cuenta u otra sucursal) se vuelve a pedir.
 */
export const orgStore = reactive({
  tenantId: null,
  loaded: false,
  isOwner: false,
  organization: null,
  branches: [],
});

let inflight = null;

/** Guarda el resumen que devuelve GET /org (o las acciones de crear, dar de baja y reactivar). */
export function applyOrg(overview) {
  orgStore.tenantId = authStore.tenantId;
  orgStore.loaded = true;
  orgStore.isOwner = Boolean(overview?.isOwner);
  orgStore.organization = overview?.organization || null;
  orgStore.branches = Array.isArray(overview?.branches) ? overview.branches : [];
}

export function resetOrg() {
  orgStore.tenantId = null;
  orgStore.loaded = false;
  orgStore.isOwner = false;
  orgStore.organization = null;
  orgStore.branches = [];
}

/** Carga las sucursales una vez por tienda. Solo administradores de tienda; falla en silencio (el menú sigue igual). */
export function loadOrg({ force = false } = {}) {
  if (authStore.role !== "admin" || !authStore.tenantId) return Promise.resolve();
  if (orgStore.tenantId !== authStore.tenantId) resetOrg();
  if (orgStore.loaded && !force) return Promise.resolve();
  if (!inflight) {
    inflight = apiService
      .getOrganization()
      .then(applyOrg)
      .catch(() => {})
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Entra a otra sucursal: abre una sesión nueva como la cuenta de esa sucursal y recarga todo, para que nada de la
 * tienda anterior se quede en pantalla. Lanza el error del servidor si no se pudo (el que llama lo muestra).
 */
export async function enterBranch(branch) {
  if (
    offlineStore.pending > 0 &&
    !window.confirm(`Hay ${offlineStore.pending} ventas de esta tienda sin subir en este equipo. Se subirán cuando vuelvas a ella. ¿Cambiar de sucursal de todos modos?`)
  ) {
    return false;
  }
  const session = await apiService.switchBranch(branch.id);
  setSession(session);
  clearBillingStatus();
  resetOrg();
  try {
    localStorage.removeItem("timber_venue_settings");
  } catch {
    /* sin almacenamiento: se vuelve a pedir al servidor */
  }
  window.location.assign("/pos");
  return true;
}
