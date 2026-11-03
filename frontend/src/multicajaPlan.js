// Qué ve el dueño en Ajustes → MultiCaja según su plan: bloqueada (Básico), contacto (Perpetua) o el panel con hasta `limit` cajas.
export function multicajaMode(plan, limit) {
  if (plan === "perpetual") return "contact";
  const max = Number(limit);
  if (plan === "basic" || !Number.isFinite(max) || max < 2) return "locked";
  return "panel";
}

/** Cantidades de cajas que se pueden elegir: 1 hasta el límite del plan. */
export function allowedCounts(limit) {
  const max = Math.max(1, Math.floor(Number(limit) || 1));
  return Array.from({ length: max }, (_, i) => i + 1);
}
