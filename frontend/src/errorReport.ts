// Avisa al servidor cuando la pantalla truena (JavaScript del navegador), para que llegue a Sentry con la tienda.
// Solo con sesión iniciada, máximo 5 avisos por apertura de la app y nunca lanza errores propios.
import axios from "axios";
import { isAuthenticated } from "./authStore";

let sent = 0;
const seen = new Set<string>();

function report(message: string, stack = "") {
  try {
    const key = message.slice(0, 120);
    if (sent >= 5 || seen.has(key) || !isAuthenticated()) return;
    seen.add(key);
    sent += 1;
    axios
      .post("/client-errors", { message, stack, url: location.href, route: location.pathname })
      .catch(() => {});
  } catch {
    /* reportar nunca debe fallar */
  }
}

export function startErrorReporting() {
  window.addEventListener("error", (e) => report(e.message || "Error", e.error?.stack || ""));
  window.addEventListener("unhandledrejection", (e) => {
    const r: any = e.reason;
    report(r?.message || String(r || "Promesa rechazada"), r?.stack || "");
  });
}
