// Corte X: cuadra el efectivo al entregar la caja sin cerrarla.
/** Contado menos esperado, a centavos (evita 0.1+0.2). */
export function cutDifference(counted, expected) {
  return Math.round((Number(counted) - Number(expected)) * 100) / 100 + 0; // + 0 evita -0
}
/** 'cuadra' | 'sobra' | 'falta' según la diferencia. */
export function cutLabel(diff) {
  const d = Math.round(Number(diff) * 100);
  return d === 0 ? "cuadra" : d > 0 ? "sobra" : "falta";
}

/**
 * Contra qué se juzga el corte final. Sin Cortes X es la sesión completa; con cortes, solo el tramo del último cajero
 * (`lastSegment` viene del servidor). Devuelve lo esperado del tramo y la diferencia que decide el aviso de «no cuadra».
 */
export function closeBasis(counted, sessionExpected, lastSegment) {
  const hasSegment = Boolean(lastSegment) && Number.isFinite(Number(lastSegment.expected));
  const expected = hasSegment ? Number(lastSegment.expected) : Number(sessionExpected);
  return { hasSegment, expected, difference: cutDifference(counted, expected) };
}

/** Mensaje que bloquea la entrega según la cola sin conexión (filas con `status`), o '' si no hay bloqueo. */
export function syncBlockMessage(rows) {
  if (!rows || !rows.length) return "";
  if (rows.every((r) => r.status === "failed")) {
    return "Hay ventas con error de sincronización; revísalas o pide ayuda a soporte antes de entregar la caja";
  }
  return "Hay ventas sin sincronizar; espera a que se envíen antes de entregar la caja";
}
