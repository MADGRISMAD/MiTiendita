// Aviso de «hay una nueva versión» (como en MiConsultorio): la app nueva se descarga sola en segundo plano,
// pero NO se aplica hasta que la persona toque «Actualizar», para no cortar una venta a medias.
// La computadora de la caja (que se deja abierta todo el día) también se entera: se busca al volver a la
// pestaña y cada media hora.
import { reactive } from "vue";

export const updateState = reactive({ available: false, checking: false, lastCheckAt: null, error: "" });

let applyFn = null;
let registration = null;
let lastAuto = 0;
const AUTO_EVERY_MS = 30 * 60 * 1000;

/** Versión de esta copia de la app (se define al compilar). */
export const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "desarrollo";
export const appBuiltAt = typeof __APP_BUILT_AT__ !== "undefined" ? __APP_BUILT_AT__ : null;

/** Busca una versión nueva. Con `force` aunque se haya buscado hace poco. */
export async function checkForUpdate({ force = false } = {}) {
  if (!registration || updateState.checking) return;
  if (!force && Date.now() - lastAuto < 5 * 60 * 1000) return;
  lastAuto = Date.now();
  updateState.checking = true;
  updateState.error = "";
  try {
    await registration.update();
  } catch {
    updateState.error = "No se pudo buscar actualizaciones (¿sin internet?).";
  } finally {
    updateState.checking = false;
    updateState.lastCheckAt = Date.now();
  }
}

/** Aplica la versión nueva y recarga la app. */
export function applyUpdate() {
  if (applyFn) applyFn(true);
  else window.location.reload();
}

/** Para main.ts: registra el service worker y vigila las versiones nuevas (solo en producción). */
export function initAppUpdate() {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      applyFn = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateState.available = true;
        },
        onRegisteredSW(_url, reg) {
          registration = reg || null;
          if (!registration) return;
          setInterval(() => checkForUpdate(), AUTO_EVERY_MS);
        },
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - lastAuto > AUTO_EVERY_MS) checkForUpdate();
      });
      window.addEventListener("online", () => checkForUpdate());
    })
    .catch(() => {});
}
