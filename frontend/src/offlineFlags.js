import { reactive } from "vue";

const LAST_SYNC_KEY = "timber_last_sync";

function readLastSync() {
  try {
    return Number(localStorage.getItem(LAST_SYNC_KEY)) || 0;
  } catch {
    return 0;
  }
}

export const offlineStore = reactive({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  /** Ventas de este dispositivo esperando subir */
  pending: 0,
  /** Ventas que el servidor rechazó (necesitan revisión) */
  failed: 0,
  syncing: false,
  lastError: "",
  /** Hora de la última venta subida bien */
  lastSyncAt: readLastSync(),
  /** El servidor pidió volver a iniciar sesión para poder subir */
  authNeeded: false,
});

export function noteOnline() {
  offlineStore.online = true;
}

export function noteOffline() {
  offlineStore.online = false;
}

export function noteSynced(at = Date.now()) {
  offlineStore.lastSyncAt = at;
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(at));
  } catch {
    /* ignore */
  }
}
