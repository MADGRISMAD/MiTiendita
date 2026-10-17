// Dónde se imprime lo que se cobra en ESTE dispositivo (se guarda en el navegador, como la impresora).
//  - local:   en este mismo dispositivo (como siempre)
//  - remote:  se manda a la «estación de impresión» (la computadora que tiene la impresora)
//  - station: esta computadora recibe e imprime los tickets que mandan los demás dispositivos
import { reactive } from "vue";

const KEY = "timber_print_route";

function newId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* sigue abajo */
  }
  return `st-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      mode: ["local", "remote", "station"].includes(raw.mode) ? raw.mode : "local",
      stationId: typeof raw.stationId === "string" && raw.stationId ? raw.stationId : newId(),
    };
  } catch {
    return { mode: "local", stationId: newId() };
  }
}

export const printRoute = reactive(read());

export function savePrintRoute(patch = {}) {
  Object.assign(printRoute, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode: printRoute.mode, stationId: printRoute.stationId }));
  } catch {
    /* sin almacenamiento: queda mientras la pestaña esté abierta */
  }
}
// Deja guardado el identificador la primera vez
savePrintRoute();
