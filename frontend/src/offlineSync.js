import { authStore } from "./authStore";
import { apiService } from "./apiService";
import { isNetworkError } from "./net";
import * as db from "./offlineDb";
import { noteOffline, noteOnline, offlineStore } from "./offlineFlags";

export { offlineStore, noteOffline, noteOnline };

let flushing = false;
let started = false;

export async function refreshPendingCount() {
  try {
    offlineStore.pending = await db.countPending(authStore.tenantId);
  } catch {
    offlineStore.pending = 0;
  }
  return offlineStore.pending;
}

export async function flushOfflineSales() {
  if (flushing) return;
  if (!authStore.token || !authStore.tenantId) {
    await refreshPendingCount();
    return;
  }
  flushing = true;
  offlineStore.syncing = true;
  try {
    const pending = await db.listPending(authStore.tenantId);
    for (const sale of pending) {
      try {
        const order = await apiService.syncSale(sale.payload);
        await db.markSynced(sale.clientSaleId, order?.id);
        offlineStore.lastError = "";
        noteOnline();
      } catch (error) {
        if (isNetworkError(error)) {
          noteOffline();
          break;
        }
        const status = error.response?.status;
        if (status === 401 || status === 403) break;
        const raw = error.response?.data;
        const msg =
          (typeof raw === "string" && raw) ||
          raw?.message ||
          error.message ||
          "No se pudo sincronizar una venta";
        await db.markFailed(sale.clientSaleId, msg);
        offlineStore.lastError = msg;
      }
    }
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

export { db as offlineDb };

export function startOfflineRuntime() {
  if (started || typeof window === "undefined") return;
  started = true;
  refreshPendingCount();
  window.addEventListener("online", () => {
    noteOnline();
    flushOfflineSales();
  });
  window.addEventListener("offline", noteOffline);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flushOfflineSales();
  });
  flushOfflineSales();
}
