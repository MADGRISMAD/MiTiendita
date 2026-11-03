// Estado del selector de caja (RegisterPickerDialog) y funciones puras que lo alimentan.
import { reactive } from "vue";
import { registerStore } from "./registerStore";

export const pickerState = reactive({ open: false, notice: "", blocked: {}, forced: false });

/** Aviso para el selector según el código de error del servidor; '' si el código no pide elegir caja. */
export function pickerNotice(code, data = {}) {
  if (code === "register_unknown") return "Esta caja ya no está disponible. Elige otra.";
  if (code === "register_in_use") return `Abierta por ${data?.openedBy || "otro usuario"} en otro equipo`;
  return "";
}

/** ¿Hay que pedir la caja? Más de una caja en el plan y esta computadora aún no eligió. */
export function needsChoice(data, hasChoice) {
  return !hasChoice && Array.isArray(data?.registers) && data.registers.length > 1;
}

/** Nombre de la caja de esta computadora para el encabezado; '' si el negocio tiene una sola. */
export function registerLabel(data, current) {
  const list = Array.isArray(data?.registers) ? data.registers : [];
  if (list.length < 2) return "";
  const r = list.find((x) => x.number === current);
  return r?.name || `Caja ${current}`;
}

/** Lo llama el interceptor ante un 409: register_unknown o register_in_use abren el selector. */
export function noteRegisterError(data) {
  const code = data?.code;
  const notice = pickerNotice(code, data);
  if (!notice) return;
  if (code === "register_in_use") {
    pickerState.blocked = { ...pickerState.blocked, [registerStore.current()]: notice };
  } else {
    registerStore.clear();
  }
  pickerState.notice = code === "register_unknown" ? notice : "";
  pickerState.forced = code === "register_unknown";
  pickerState.open = true;
}
