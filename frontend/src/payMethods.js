// Formas de pago que la tienda puede apagar en Ajustes (para que no salgan en las ventanas de cobro).
// Se guarda la lista de las apagadas: así, una forma de pago nueva en el futuro nace encendida.
export const PAY_METHOD_OPTIONS = [
  { id: "cash", label: "Efectivo", hint: "Dinero en la mano; calcula el cambio." },
  { id: "card", label: "Tarjeta", hint: "Terminal o tarjeta (con la comisión si la activaste)." },
  { id: "transfer", label: "Transferencia", hint: "SPEI, con folio opcional." },
  { id: "split", label: "Mixto", hint: "Parte en efectivo y parte con tarjeta. Necesita Efectivo y Tarjeta encendidos." },
  { id: "credit", label: "Fiado", hint: "A cuenta del cliente; necesita internet." },
  { id: "other", label: "Otro", hint: "Vales, cheques o lo que no sea de arriba." },
];
export const PAY_METHOD_IDS = PAY_METHOD_OPTIONS.map((m) => m.id);

/** Lista limpia de formas de pago apagadas (solo las que existen, sin repetir y sin apagarlas todas). */
export function cleanDisabled(list) {
  const off = [...new Set((Array.isArray(list) ? list : []).filter((id) => PAY_METHOD_IDS.includes(id)))];
  return off.length >= PAY_METHOD_IDS.length ? off.slice(0, PAY_METHOD_IDS.length - 1) : off;
}

/** ¿Se ofrece esta forma de pago? Mixto solo existe si Efectivo y Tarjeta están encendidos. */
export function payMethodOn(id, disabled) {
  const off = new Set(cleanDisabled(disabled));
  if (off.has(id)) return false;
  if (id === "split") return !off.has("cash") && !off.has("card");
  return true;
}

/** Deja solo las formas de pago encendidas; si por error no queda ninguna, devuelve la lista tal cual. */
export function onlyEnabled(methods, disabled) {
  const shown = methods.filter((m) => payMethodOn(m.id, disabled));
  return shown.length ? shown : methods;
}

/** La que se elige al abrir el cobro: Efectivo si está encendido, y si no, la primera encendida. */
export function defaultPayMethod(methods, disabled) {
  const shown = onlyEnabled(methods, disabled);
  return (shown.find((m) => m.id === "cash") || shown[0])?.id || "cash";
}
