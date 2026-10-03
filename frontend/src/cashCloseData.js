// Datos del corte de caja + impresión directa sin abrir otra ventana.
import { apiService } from "./apiService";
import { storeClock, storeParts } from "./storeTime";
import { venueStore } from "./venueStore";
import { folioOf } from "./ticketShell";
import { printCashCloseDirect } from "./thermalPrinter";

const SHORT = { cash: "EFEC", card: "TARJ", transfer: "TRANSF", split: "MIXTO", other: "OTRO" };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nf = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (n) => nf.format(Number(n || 0));
const money = (n) => `$${num(n)}`;
const methodShort = (m) => SHORT[m] || "—";
const isVoid = (o) => o.paymentStatus === "refunded" || o.status === "cancelled";
const validDate = (d) => {
  const dt = d ? new Date(d) : null;
  return dt && !Number.isNaN(dt.getTime()) ? dt : null;
};
const shortDate = (d) => {
  const p = storeParts(d, venueStore.timezone);
  return p ? `${String(p.day).padStart(2, "0")} ${MONTHS[p.month - 1]} ${p.year}` : "";
};
const clock = (d) => storeClock(d, venueStore.timezone) || "—";

/** Arma el objeto que espera buildCashClose() (escpos.js). */
export function buildCashCloseData(session, orders, printedAt = new Date()) {
  const s = session;
  const closed = Boolean(s.closedAt) || s.status === "closed";
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const voided = orders.filter(isVoid);

  // Reparto local (corte parcial): en pago mixto la parte de tarjeta va a tarjeta y el resto a efectivo
  const local = { cash: 0, card: 0, transfer: 0, other: 0, total: 0 };
  for (const o of paid) {
    const amount = Number(o.total || 0);
    const method = o.paymentMethod || "other";
    if (method === "split") {
      const cardPart = Math.min(amount, Math.max(0, Number(o.cardAmount || 0)));
      local.card += cardPart;
      local.cash += amount - cardPart;
    } else if (local[method] != null && method !== "total") {
      local[method] += amount;
    } else {
      local.other += amount;
    }
    local.total += amount;
  }

  const opening = Number(s.openingFloat || 0);
  const cashRefunds = Number(s.cashRefunds || 0);
  const expectedCash =
    closed && s.expectedCash != null ? Number(s.expectedCash) : opening + local.cash - cashRefunds;
  const cashSales = expectedCash - opening + cashRefunds;
  const cardSales = closed ? Number(s.expectedCard || 0) : local.card;
  const transferSales = closed ? Number(s.expectedTransfer || 0) : local.transfer;
  const otherSales = closed ? Number(s.expectedOther || 0) : local.other;
  const totalSold = closed && s.expectedTotal != null ? Number(s.expectedTotal) : local.total;

  const methods = [
    { label: "Efectivo", amount: cashSales, always: true },
    { label: "Tarjeta", amount: cardSales },
    { label: "Transferencia", amount: transferSales },
    { label: "Otros", amount: otherSales },
  ]
    .filter((m) => m.always || m.amount > 0)
    .map(({ label, amount }) => ({ label, amount }));

  const articles = paid.reduce(
    (sum, o) =>
      sum +
      (o.items || []).reduce((a, i) => {
        const q = Number(i.quantity || 0);
        return a + (Number.isInteger(q) ? q : 1);
      }, 0),
    0
  );

  let verdictWord = "Parcial";
  let verdictSub = "Caja sigue abierta";
  if (closed) {
    const diff = Number(s.difference || 0);
    if (Math.abs(diff) < 0.005) {
      verdictWord = "Cuadra";
      verdictSub = "Al centavo";
    } else if (diff < 0) {
      verdictWord = "Faltan";
      verdictSub = money(-diff);
    } else {
      verdictWord = "Sobran";
      verdictSub = money(diff);
    }
  }

  const a = validDate(s.openedAt);
  const b = validDate(s.closedAt) || printedAt;
  let duration = "";
  if (a) {
    const mins = Math.max(0, Math.round((b - a) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    duration = h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  }

  return {
    closed,
    folio: folioOf(s.id),
    dateText: shortDate(s.openedAt),
    openedClock: clock(s.openedAt),
    openedBy: s.openedBy || "-",
    closedClock: clock(s.closedAt || printedAt),
    closedBy: s.closedBy || "-",
    deliveredBy: s.closedBy || s.openedBy || "",
    duration,
    salesCount: paid.length,
    articles,
    average: paid.length ? totalSold / paid.length : 0,
    methods,
    totalSold,
    taxCollected: paid.reduce((sum, o) => sum + Number(o.tax || 0), 0),
    cardExtraTotal: paid.reduce((sum, o) => sum + Number(o.cardExtraTax || 0), 0),
    voidedCount: voided.length,
    voidedTotal: voided.reduce((sum, o) => sum + Number(o.total || 0), 0),
    opening,
    cashSales,
    cashRefunds,
    expectedCash,
    countedCash: Number(s.countedCash || 0),
    verdictWord,
    verdictSub,
    notes: s.notes || "",
    tickets: orders.map((o) => ({
      clock: clock(o.paidAt || o.createdAt),
      folio: folioOf(o.id),
      kind: isVoid(o) ? "DEV" : o.paymentStatus === "paid" ? methodShort(o.paymentMethod) : "PEND",
      amount: num(o.total),
      void: isVoid(o),
    })),
    printedText: `${shortDate(printedAt)} ${clock(printedAt)}`,
  };
}

/** Descarga el turno y sus tickets y lo imprime directo en la térmica. Lanza error si falla. */
export async function printCashCloseById(id) {
  const sid = String(id);
  const session = await apiService.getCashSessionById(sid);
  const all = await apiService.getOrders().catch(() => []);
  const orders = (Array.isArray(all) ? all : [])
    .filter((o) => String(o.cashSessionId || "") === sid)
    .sort((x, y) => new Date(x.paidAt || x.createdAt) - new Date(y.paidAt || y.createdAt));
  await printCashCloseDirect(buildCashCloseData(session, orders));
}