// Estación de impresión: esta computadora recibe los tickets que cobran los otros dispositivos y los imprime
// con su impresora (la misma de Configuración → Impresora).
// Pide trabajos con una petición larga: el servidor contesta en cuanto llega uno, así el ticket sale al instante
// aunque la pestaña esté en segundo plano (los temporizadores del navegador se frenan ahí, las respuestas no).
import { reactive, watch } from "vue";
import { apiService } from "./apiService";
import { authStore, hasRole, isAuthenticated } from "./authStore";
import { printRoute } from "./printRoute";
import { directPrinting, printReceiptDirect } from "./thermalPrinter";

export const stationState = reactive({ running: false, waiting: false, printed: 0, lastTicketAt: null, error: "" });

let generation = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function shouldRun() {
  return printRoute.mode === "station" && isAuthenticated() && hasRole("admin", "cashier");
}

function stationName() {
  return `Computadora ${String(printRoute.stationId).slice(0, 4)}`;
}

async function handle(job) {
  const send = (ok, error) => apiService.reportPrintResult(job.id, { stationId: printRoute.stationId, ok, error }).catch(() => {});
  if (!directPrinting()) {
    await send(false, "Esta computadora no tiene la impresora térmica configurada (Configuración → Impresora).");
    stationState.error = "Llegó un ticket pero esta computadora no tiene impresora térmica configurada.";
    return;
  }
  try {
    await printReceiptDirect(job.order, { openDrawer: job.openDrawer });
    await send(true);
    stationState.printed += 1;
    stationState.lastTicketAt = Date.now();
    stationState.error = "";
  } catch (error) {
    await send(false, error?.message || "La impresora no respondió.");
    stationState.error = `No se pudo imprimir un ticket: ${error?.message || "la impresora no respondió"}`;
  }
}

async function loop(gen) {
  stationState.running = true;
  while (gen === generation) {
    if (!shouldRun()) break;
    try {
      stationState.waiting = true;
      const { job } = await apiService.claimPrintJob(printRoute.stationId, stationName());
      stationState.waiting = false;
      if (gen !== generation) break;
      if (job) await handle(job);
    } catch (error) {
      stationState.waiting = false;
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        stationState.error = "La sesión terminó. Vuelve a entrar para seguir recibiendo tickets.";
        break;
      }
      stationState.error = "Sin conexión con el servidor. Reintentando…";
      await wait(5000);
    }
  }
  if (gen === generation) {
    stationState.running = false;
    stationState.waiting = false;
  }
}

/** Arranca o detiene la estación según la configuración y la sesión. */
export function syncPrintStation() {
  if (shouldRun()) {
    if (!stationState.running) loop(++generation);
  } else if (stationState.running) {
    generation += 1;
    stationState.running = false;
    stationState.waiting = false;
  }
}

/** Para main.ts: revisa al abrir la app y cada vez que cambia la sesión o el modo. */
export function startPrintStation() {
  syncPrintStation();
  watch(() => [printRoute.mode, authStore.token], syncPrintStation);
}
