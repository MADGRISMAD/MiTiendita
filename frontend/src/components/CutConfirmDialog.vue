<template><span hidden></span></template>

<script setup>
// Al entrar (y al volver a la pestaña): si alguien te entregó una caja, confirma el efectivo.
// No bloquea la venta: si algo falla, se ignora y se vuelve a intentar después.
import { onBeforeUnmount, onMounted, watch } from "vue";
import { apiService } from "../apiService";
import { authStore } from "../authStore";
import { alertDialog, confirmDialog, promptDialog } from "../dialog";

let busy = false;
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

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
  if (busy || !authStore.token || !authStore.tenantId) return;
  busy = true;
  try {
    const list = await apiService.pendingCashCuts();
    for (const cut of Array.isArray(list) ? list : []) await review(cut);
  } catch {
    /* sin conexión o sin permiso: no estorba al cobrar */
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
