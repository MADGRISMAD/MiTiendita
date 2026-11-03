<template><span hidden></span></template>

<script setup>
// Al entrar (y al volver a la pestaña): si alguien te entregó una caja, confirma el efectivo.
// No bloquea la venta: si algo falla, se ignora y se vuelve a intentar después.
import { onBeforeUnmount, onMounted, watch } from "vue";
import { apiService, apiErrorMessage } from "../apiService";
import { authStore, hasRole } from "../authStore";
import { money } from "../textUtils";
import { alertDialog, confirmDialog, promptDialog } from "../dialog";

let busy = false;
// Cortes ya mostrados en esta sesión: no se repiten hasta recargar (siguen pendientes en el servidor)
const shown = new Set();

async function review(cut) {
  const ok = await confirmDialog(
    `Recibes la Caja ${cut.registerId} con ${money(cut.countedCash)} en efectivo\n\nCuenta el efectivo antes de confirmar.`,
    { confirmLabel: "Confirmar", cancelLabel: "No coincide", tone: "info" }
  );
  if (ok) {
    await apiService.confirmCashCut(cut.id);
    return;
  }
  const raw = await promptDialog("¿Cuánto efectivo hay en la caja?", { confirmLabel: "Enviar", placeholder: "0.00" });
  if (raw == null) return; // queda pendiente para la próxima vez
  const n = Number(String(raw).replace(",", "."));
  if (String(raw).trim() === "" || !Number.isFinite(n) || n < 0) {
    await alertDialog("Escribe una cifra válida.");
    return;
  }
  await apiService.confirmCashCut(cut.id, n);
  await alertDialog("Registramos la diferencia; el dueño la verá en los cortes.");
}

async function check() {
  if (busy || !authStore.token || !authStore.tenantId || !hasRole("admin", "cashier")) return;
  busy = true;
  try {
    let list = [];
    try {
      list = await apiService.pendingCashCuts();
    } catch {
      return; // sin conexión o sin permiso: no estorba al cobrar
    }
    for (const cut of Array.isArray(list) ? list : []) {
      if (shown.has(cut.id)) continue;
      shown.add(cut.id);
      try {
        await review(cut);
      } catch (e) {
        shown.delete(cut.id); // un fallo sí se puede reintentar
        await alertDialog(apiErrorMessage(e, "No se pudo confirmar la caja."));
        break;
      }
    }
  } finally {
    busy = false;
  }
}

const onVisible = () => {
  if (document.visibilityState === "visible") check();
};
watch(() => authStore.token, check);
onMounted(() => {
  check();
  document.addEventListener("visibilitychange", onVisible);
});
onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisible));
</script>
