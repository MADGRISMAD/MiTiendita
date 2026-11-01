// Ventanas de la app (reemplazan confirm / alert / prompt del navegador, que se ven feas y no se pueden personalizar).
// Se usan con await desde cualquier parte:
//   if (!(await confirmDialog("¿Quitar este producto?\n\nNo se puede deshacer.", { confirmLabel: "Quitar", tone: "danger" }))) return;
//   await alertDialog("No se pudo guardar.");
//   const nombre = await promptDialog("Nombre de la categoría");   // null si cancelan
// El texto se separa en párrafos: el primero es el título y el resto el detalle. AppDialogHost (en App.vue) las dibuja.
import { reactive } from "vue";

export const dialogState = reactive({ current: null });
const queue = [];

function next() {
  dialogState.current = queue.shift() || null;
}

function push(kind, text, opts = {}) {
  const [title = "", ...rest] = String(text == null ? "" : text).trim().split(/\n\s*\n/);
  return new Promise((resolve) => {
    queue.push({
      kind,
      title: title.trim(),
      message: rest.join("\n\n").trim(),
      tone: "warn", // 'warn' | 'danger' | 'info'
      confirmLabel: kind === "alert" ? "Entendido" : "Aceptar",
      cancelLabel: "Cancelar",
      placeholder: "",
      value: "",
      multiline: false,
      hideCancel: false,
      ...opts,
      resolve,
    });
    if (!dialogState.current) next();
  });
}

/** Resuelve la ventana que está en pantalla y pasa a la siguiente (si hay varias en fila). */
export function answerDialog(value) {
  const d = dialogState.current;
  if (!d) return;
  dialogState.current = null;
  d.resolve(value);
  next();
}

/** ¿Seguro?  → true si aceptan, false si cancelan. */
export const confirmDialog = (text, opts) => push("confirm", text, opts);
/** Aviso con un solo botón. */
export const alertDialog = (text, opts) => push("alert", text, { tone: "info", ...opts }).then(() => undefined);
/** Pide un texto → el texto escrito, o null si cancelan. */
export const promptDialog = (text, opts) => push("prompt", text, { tone: "info", ...opts });
