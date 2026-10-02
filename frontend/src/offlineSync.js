import { authStore } from "./authStore";
import { apiService } from "./apiService";
import { isNetworkError } from "./net";
import * as db from "./offlineDb";
import { noteOffline, noteOnline, noteSynced, offlineStore } from "./offlineFlags";

export { offlineStore, noteOffline, noteOnline };

const LOCK_NAME = "mitiendita-offline-sync";
const RETRY_EVERY_MS = 30_000;
const BASE_WAIT_MS = 15_000;
const MAX_WAIT_MS = 5 * 60_000;

let flushing = false;
let started = false;
let timer = null;

// El servidor está caído o saturado: vale la pena volver a intentar más tarde
function isTransient(status) {
  return !status || status >= 500 || status === 408 || status === 429;
}
function waitFor(attempts) {
  return Math.min(MAX_WAIT_MS, BASE_WAIT_MS * 2 ** Math.max(0, attempts));
}
function messageOf(error) {
  const raw = error?.response?.data;
  return (typeof raw === "string" && raw) || raw?.message || error?.message || "No se pudo subir la venta";
}

export async function refreshPendingCount() {
  try {
    const rows = await db.listUnsynced(authStore.tenantId);
    offlineStore.pending = rows.filter((r) => r.status === "pending").length;
    offlineStore.failed = rows.filter((r) => r.status === "failed").length;
  } catch {
    offlineStore.pending = 0;
    offlineStore.failed = 0;
  }
  return offlineStore.pending;
}

async function runFlush({ force }) {
  const pending = await db.listPending(authStore.tenantId);
  const now = Date.now();
  // En orden: si la más vieja aún espera su reintento, las demás esperan con ella
  for (const sale of pending) {
    if (!force && Number(sale.nextTryAt) > now) break;
    try {
      const order = await apiService.syncSale(sale.payload);
      await db.markSynced(sale.clientSaleId, order?.id);
      offlineStore.lastError = "";
      offlineStore.authNeeded = false;
      noteOnline();
      noteSynced();
    } catch (error) {
      if (isNetworkError(error)) {
        noteOffline();
        break;
      }
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        offlineStore.authNeeded = true;
        break;
      }
      const msg = messageOf(error);
      offlineStore.lastError = msg;
      if (isTransient(status)) {
        await db.markRetry(sale.clientSaleId, msg, waitFor(Number(sale.attempts) || 0));
        break;
      }
      // El servidor la rechazó (p. ej. producto inválido): queda para revisión, no se borra
      await db.markFailed(sale.clientSaleId, msg);
    }
  }
}

/** Sube la cola de ventas hechas sin internet. Con force no respeta la espera entre reintentos. */
export async function flushOfflineSales({ force = false } = {}) {
  if (flushing) return;
  if (!authStore.token || !authStore.tenantId) {
    await refreshPendingCount();
    return;
  }
  flushing = true;
  offlineStore.syncing = true;
  try {
    // Una sola pestaña sube la cola a la vez; el servidor ya ignora repetidas por clientSaleId
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (lock) await runFlush({ force });
      });
    } else {
      await runFlush({ force });
    }
  } catch {
    /* IndexedDB no disponible: nada que subir */
  } finally {
    flushing = false;
    offlineStore.syncing = false;
    await refreshPendingCount();
  }
}

export async function queueSale(payload) {
  const tenantId = authStore.tenantId;
  const clientSaleId = payload.clientSaleId;
  await db.enqueueSale({
    clientSaleId,
    tenantId,
    payload,
    createdAt: Date.now(),
  });
  await refreshPendingCount();
}

/** Ventas de este dispositivo que no están en el servidor, para mostrarlas en Caja. */
export async function listDeviceSales() {
  try {
    return await db.listUnsynced(authStore.tenantId);
  } catch {
    return [];
  }
}

/** Vuelve a intentar una venta (o todas las que dieron error) en este momento. */
export async function retrySales(ids = null) {
  const rows = await listDeviceSales();
  const targets = rows.filter((r) => (ids ? ids.includes(r.clientSaleId) : true));
  for (const r of targets) await db.requeueSale(r.clientSaleId);
  await refreshPendingCount();
  await flushOfflineSales({ force: true });
}

export { db as offlineDb };

export function startOfflineRuntime() {
  if (started || typeof window === "undefined") return;
  started = true;
  refreshPendingCount();
  window.addEventListener("online", () => {
    noteOnline();
    flushOfflineSales({ force: true });
  });
  window.addEventListener("offline", noteOffline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushOfflineSales();
  });
  // Por si la red "volvió" sin avisar (wifi con portal, servidor que se recupera)
  timer = setInterval(() => {
    if (offlineStore.pending > 0 && navigator.onLine !== false) flushOfflineSales();
  }, RETRY_EVERY_MS);
  flushOfflineSales();
}

export function stopOfflineRuntime() {
  clearInterval(timer);
  timer = null;
  started = false;
}
