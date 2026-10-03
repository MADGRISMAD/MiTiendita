// Contadores que ve toda el área de plataforma (la navegación pinta el de tickets por responder).
import { reactive } from "vue";
import { apiService } from "../apiService";

export const platformStore = reactive({
  /** Tickets que esperan respuesta de quien está dentro. null = aún no se sabe. */
  waiting: null,
  error: "",
});

let timer = null;
let inflight = null;

/** Cuenta los tickets por responder (barato: una llamada). Seguro llamarlo varias veces. */
export function refreshWaiting() {
  if (inflight) return inflight;
  inflight = apiService
    .platformSupport({ status: "open", limit: 1 })
    .then((r) => {
      platformStore.waiting = Number(r?.counts?.open) || 0;
      platformStore.error = r?.inboxError || "";
    })
    .catch(() => {
      /* sin red: se queda el último número */
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Mantiene el contador al día mientras se está en el área (cada minuto). */
export function watchWaiting() {
  refreshWaiting();
  if (timer) return;
  timer = setInterval(() => {
    if (typeof document === "undefined" || !document.hidden) refreshWaiting();
  }, 60000);
}

export function stopWatchingWaiting() {
  clearInterval(timer);
  timer = null;
}
