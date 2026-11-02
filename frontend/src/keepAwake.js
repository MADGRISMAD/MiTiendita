// Mantiene la pantalla encendida mientras se vende: si el equipo se duerme, el navegador suelta la impresora y la báscula.
let lock = null;
let wanted = false;

async function request() {
  if (!wanted || lock || typeof navigator === "undefined" || !navigator.wakeLock) return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => (lock = null));
  } catch {
    /* sin permiso (batería baja, pestaña oculta): no pasa nada */
  }
}

function onVisible() {
  if (document.visibilityState === "visible") request();
}

export function keepScreenOn() {
  if (wanted) return;
  wanted = true;
  document.addEventListener("visibilitychange", onVisible);
  request();
}

export function allowScreenOff() {
  wanted = false;
  document.removeEventListener("visibilitychange", onVisible);
  lock?.release().catch(() => {});
  lock = null;
}
