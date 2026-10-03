// Cola de atención: lo que el equipo debería mirar primero, de lo más urgente a lo menos.
// Sin imports: la prueba del backend lo carga como módulo (backend/test/platform-ui.test.js).

const DAY = 86400000;
const HOUR = 3600000;
const SEVERITY = { bad: 0, warn: 1, info: 2 };

function at(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * @param tenants  clientes (de /platform/tenants)
 * @param tickets  tickets que esperan respuesta de quien mira (de /platform/support)
 * @returns {{ items: Array, counts: object }}
 *   item: { key, kind, tone, tenantId, businessName, title, detail, since, ticketId? }
 */
export function buildAttention({ tenants = [], tickets = [], now = Date.now() } = {}) {
  const items = [];

  for (const t of tickets) {
    if (t.status && t.status !== "open") continue;
    const since = at(t.updatedAt);
    const waited = since == null ? 0 : now - since;
    items.push({
      key: `ticket-${t.tenantId}-${t.ticketId}`,
      kind: "ticket",
      tone: waited >= DAY ? "bad" : waited >= 4 * HOUR ? "warn" : "info",
      tenantId: t.tenantId,
      businessName: t.businessName,
      title: t.subject || "Ticket sin asunto",
      detail: t.preview || "",
      since,
      ticketId: t.ticketId,
    });
  }

  for (const c of tenants) {
    const status = c.billingStatus || "trialing";
    const base = { tenantId: c.id, businessName: c.businessName };
    if (status === "past_due") {
      items.push({
        ...base,
        key: `due-${c.id}`,
        kind: "past_due",
        tone: "warn",
        title: "Pago atrasado",
        detail: `${c.planName || "Plan"}${c.ownerName ? ` · ${c.ownerName}` : ""}`,
        since: at(c.currentPeriodEnd),
      });
    } else if (status === "trialing" && !c.isPerpetual) {
      const end = at(c.trialEndsAt);
      if (end != null) {
        const days = Math.ceil((end - now) / DAY);
        if (days < 0) {
          items.push({
            ...base,
            key: `trial-over-${c.id}`,
            kind: "trial_over",
            tone: "bad",
            title: `Prueba vencida hace ${-days} ${-days === 1 ? "día" : "días"}`,
            detail: "Sigue sin plan: ofrécele ayuda o suspéndela.",
            since: end,
          });
        } else if (days <= 3) {
          items.push({
            ...base,
            key: `trial-${c.id}`,
            kind: "trial_ending",
            tone: "warn",
            title: days === 0 ? "Su prueba termina hoy" : `Su prueba termina en ${days} ${days === 1 ? "día" : "días"}`,
            detail: c.ownerName ? `Escríbele a ${c.ownerName} antes de que se quede sin acceso.` : "Escríbele antes de que se quede sin acceso.",
            since: end,
          });
        }
      }
    } else if (status === "active" && !c.isPerpetual) {
      // Paga, pero nadie entra: es la señal más temprana de que se va a dar de baja
      const seen = at(c.lastSeenAt);
      const created = at(c.createdAt);
      const quiet = seen != null ? now - seen : created != null && now - created > 14 * DAY ? now - created : 0;
      if (quiet >= 14 * DAY) {
        items.push({
          ...base,
          key: `quiet-${c.id}`,
          kind: "quiet",
          tone: "info",
          title: `Nadie entra desde hace ${Math.floor(quiet / DAY)} días`,
          detail: "Paga su plan pero no lo usa: pregúntale si necesita ayuda.",
          since: seen ?? created,
        });
      }
    }
  }

  items.sort((a, b) => {
    const s = SEVERITY[a.tone] - SEVERITY[b.tone];
    if (s) return s;
    // Lo que lleva más tiempo esperando va primero
    return (a.since ?? now) - (b.since ?? now);
  });

  const counts = {
    tickets: items.filter((i) => i.kind === "ticket").length,
    pastDue: items.filter((i) => i.kind === "past_due").length,
    trials: items.filter((i) => i.kind === "trial_ending" || i.kind === "trial_over").length,
    quiet: items.filter((i) => i.kind === "quiet").length,
    urgent: items.filter((i) => i.tone === "bad").length,
  };
  return { items, counts };
}
