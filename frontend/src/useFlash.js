// Aviso breve de «listo» (4 s) que repetían Clientes, Equipo, Inventario y Configuración.
import { ref } from "vue";

export function useFlash(ms = 4000) {
  const flash = ref("");
  let timer = null;
  function say(message) {
    flash.value = message;
    clearTimeout(timer);
    timer = setTimeout(() => (flash.value = ""), ms);
  }
  return { flash, say };
}
