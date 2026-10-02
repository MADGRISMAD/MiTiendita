<template>
  <div class="tk-view">
    <div class="tk-bar">
      <button type="button" class="tk-btn" @click="close" title="Cerrar (Esc)">
        <PosIcon name="back" :size="18" />
        Cerrar
      </button>
      <div class="tk-bar-title">
        <strong>{{ session ? `Corte de caja #${folio}` : 'Corte de caja' }}</strong>
        <small v-if="session">{{ verdict.title }} · {{ shortDate(session.closedAt || session.openedAt) }}</small>
      </div>
      <div class="tk-seg" role="group" aria-label="Ancho del papel">
        <button type="button" :aria-pressed="paper === '80'" @click="setPaper('80')">80<span class="tk-mm"> mm</span></button>
        <button type="button" :aria-pressed="paper === '58'" @click="setPaper('58')">58<span class="tk-mm"> mm</span></button>
      </div>
      <button type="button" class="tk-btn primary tk-print" :disabled="!session" @click="print">
        <PosIcon name="printer" :size="18" />
        Imprimir
      </button>
    </div>

    <div class="tk-stage">
      <div class="tk-sheet">
        <article class="tk-paper" :class="{ w58: paper === '58' }">
          <p v-if="loading" class="tk-state">Cargando corte…</p>
          <p v-else-if="err" class="tk-state err">{{ err }}</p>

          <template v-else-if="session">
            <TicketHeader />

            <div class="tk-band">
              <span>Corte de caja</span>
              <small>{{ closed ? 'Z · Final' : 'X · Parcial' }}</small>
            </div>

            <div class="tk-stub">
              <div>
                <span>Turno</span>
                <strong class="tk-mono">Nº {{ folio }}</strong>
              </div>
              <div>
                <span>{{ dayName(session.openedAt) }}</span>
                <p class="tk-stub-date">{{ shortDate(session.openedAt) }}</p>
              </div>
            </div>

            <!-- Línea de tiempo del turno -->
            <div class="cc-shift">
              <div>
                <span>Abrió</span>
                <strong>{{ clock(session.openedAt) }}</strong>
                <em>{{ session.openedBy || '—' }}</em>
              </div>
              <div class="cc-track" aria-hidden="true">
                <i></i>
                <small>{{ duration }}</small>
              </div>
              <div class="r">
                <span>{{ closed ? 'Cerró' : 'Corte' }}</span>
                <strong>{{ clock(session.closedAt || printedAt) }}</strong>
                <em>{{ closed ? session.closedBy || '—' : 'Caja abierta' }}</em>
              </div>
            </div>

            <div class="cc-kpis">
              <div><strong>{{ paidOrders.length }}</strong><span>Ventas</span></div>
              <div><strong>{{ articles }}</strong><span>Artículos</span></div>
              <div><strong>{{ moneyShort(average) }}</strong><span>Promedio</span></div>
            </div>

            <p class="tk-sec">Ventas por forma de pago</p>
            <div class="cc-methods">
              <div v-for="m in methods" :key="m.key" class="cc-method">
                <div class="tk-line">
                  <span>{{ m.label }}</span><i class="tk-dots"></i><span>{{ money(m.amount) }}</span>
                </div>
                <div class="cc-bar" aria-hidden="true"><i :style="{ width: `${m.share}%` }"></i></div>
              </div>
            </div>

            <div class="tk-total">
              <span>Vendido</span>
              <strong><sup>$</sup>{{ num(totalSold) }}</strong>
            </div>
            <div class="cc-after">
              <div class="tk-line">
                <span>IVA incluido</span><i class="tk-dots"></i><span>{{ money(taxCollected) }}</span>
              </div>
              <div v-if="cardExtraTotal" class="tk-line">
                <span>Comisiones por tarjeta cobradas</span><i class="tk-dots"></i><span>{{ money(cardExtraTotal) }}</span>
              </div>
              <div v-if="voided.length" class="tk-line">
                <span>Devueltas o canceladas ({{ voided.length }})</span><i class="tk-dots"></i><span>{{ money(voidedTotal) }}</span>
              </div>
            </div>

            <!-- Cuadre del cajón, como cuenta hecha a mano -->
            <p class="tk-sec">Cuadre del cajón</p>
            <div class="cc-sum">
              <div class="cc-row"><i></i><span>Fondo inicial</span><b>{{ money(session.openingFloat) }}</b></div>
              <div class="cc-row"><i>+</i><span>Ventas en efectivo</span><b>{{ money(cashSales) }}</b></div>
              <div v-if="cashRefunds" class="cc-row"><i>−</i><span>Devoluciones en efectivo</span><b>{{ money(cashRefunds) }}</b></div>
              <div class="cc-row eq"><i>=</i><span>Debe haber</span><b>{{ money(expectedCash) }}</b></div>
              <div v-if="closed" class="cc-row counted"><i></i><span>Se contó</span><b>{{ money(session.countedCash) }}</b></div>
            </div>

            <div class="tk-stamp-row">
              <div class="tk-stamp" :class="{ solid: verdict.solid }">
                <b>{{ verdict.word }}</b>
                <small>{{ verdict.sub }}</small>
              </div>
            </div>

            <div v-if="session.notes" class="cc-notes">
              <span>Observaciones</span>
              <p>{{ session.notes }}</p>
            </div>

            <template v-if="orders.length">
              <p class="tk-sec">Tickets del turno · {{ orders.length }}</p>
              <div class="cc-list">
                <div v-for="o in orders" :key="o.id" class="cc-tk" :class="{ void: isVoid(o) }">
                  <span>{{ clock(o.paidAt || o.createdAt) }}</span>
                  <span class="tk-mono">#{{ folioOf(o.id) }}</span>
                  <span>{{ isVoid(o) ? 'DEV' : o.paymentStatus === 'paid' ? methodShort(o.paymentMethod) : 'PEND' }}</span>
                  <b>{{ num(o.total) }}</b>
                </div>
              </div>
            </template>

            <div class="cc-sign">
              <div><i></i><span>Entregó</span><em>{{ session.closedBy || session.openedBy || '' }}</em></div>
              <div><i></i><span>Recibió</span><em>&nbsp;</em></div>
            </div>

            <p class="tk-note">Impreso {{ shortDate(printedAt) }} · {{ clock(printedAt) }}</p>
            <div class="tk-foot">
              <TicketBarcode :value="`Z${folio}`" :caption="`Z${folio}`" />
              <p class="tk-made">Hecho con <b>Mi Tiendita</b></p>
            </div>
          </template>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import "../ticket.css";
import { apiService } from "../apiService";
import { fetchVenueSettings } from "../venueStore";
import { useTicketShell, folioOf } from "../ticketShell";
import PosIcon from "../components/PosIcon.js";
import TicketHeader from "../components/TicketHeader.vue";
import TicketBarcode from "../components/TicketBarcode.vue";

const route = useRoute();
const { paper, setPaper, print, close } = useTicketShell("/orders");

const session = ref(null);
const orders = ref([]);
const loading = ref(true);
const err = ref("");
const printedAt = new Date();

const folio = computed(() => folioOf(session.value?.id));
const closed = computed(() => Boolean(session.value?.closedAt) || session.value?.status === "closed");

const paidOrders = computed(() => orders.value.filter((o) => o.paymentStatus === "paid"));
function isVoid(o) {
  return o.paymentStatus === "refunded" || o.status === "cancelled";
}
const voided = computed(() => orders.value.filter(isVoid));
const voidedTotal = computed(() => voided.value.reduce((s, o) => s + Number(o.total || 0), 0));

// Mismo reparto que el servidor: en pago mixto la parte de tarjeta va a tarjeta y el resto a efectivo
const local = computed(() => {
  const t = { cash: 0, card: 0, transfer: 0, other: 0, total: 0 };
  for (const o of paidOrders.value) {
    const amount = Number(o.total || 0);
    const method = o.paymentMethod || "other";
    if (method === "split") {
      const cardPart = Math.min(amount, Math.max(0, Number(o.cardAmount || 0)));
      t.card += cardPart;
      t.cash += amount - cardPart;
    } else if (t[method] != null && method !== "total") {
      t[method] += amount;
    } else {
      t.other += amount;
    }
    t.total += amount;
  }
  return t;
});

const cashRefunds = computed(() => Number(session.value?.cashRefunds || 0));
const opening = computed(() => Number(session.value?.openingFloat || 0));
const expectedCash = computed(() =>
  closed.value && session.value?.expectedCash != null
    ? Number(session.value.expectedCash)
    : opening.value + local.value.cash - cashRefunds.value
);
const cashSales = computed(() => expectedCash.value - opening.value + cashRefunds.value);
const cardSales = computed(() => (closed.value ? Number(session.value?.expectedCard || 0) : local.value.card));
const transferSales = computed(() =>
  closed.value ? Number(session.value?.expectedTransfer || 0) : local.value.transfer
);
const otherSales = computed(() => (closed.value ? Number(session.value?.expectedOther || 0) : local.value.other));
const totalSold = computed(() =>
  closed.value && session.value?.expectedTotal != null ? Number(session.value.expectedTotal) : local.value.total
);

const methods = computed(() => {
  const list = [
    { key: "cash", label: "Efectivo", amount: cashSales.value },
    { key: "card", label: "Tarjeta", amount: cardSales.value },
    { key: "transfer", label: "Transferencia", amount: transferSales.value },
    { key: "other", label: "Otros", amount: otherSales.value },
  ].filter((m) => m.key === "cash" || m.amount > 0);
  const max = Math.max(...list.map((m) => m.amount), 0);
  return list.map((m) => ({ ...m, share: max > 0 ? Math.max(2, Math.round((m.amount / max) * 100)) : 0 }));
});

const articles = computed(() =>
  paidOrders.value.reduce(
    (s, o) =>
      s +
      (o.items || []).reduce((a, i) => {
        const q = Number(i.quantity || 0);
        return a + (Number.isInteger(q) ? q : 1);
      }, 0),
    0
  )
);
const average = computed(() => (paidOrders.value.length ? totalSold.value / paidOrders.value.length : 0));
const taxCollected = computed(() => paidOrders.value.reduce((s, o) => s + Number(o.tax || 0), 0));
const cardExtraTotal = computed(() => paidOrders.value.reduce((s, o) => s + Number(o.cardExtraTax || 0), 0));

const verdict = computed(() => {
  if (!closed.value) {
    return { word: "Parcial", sub: "Caja sigue abierta", title: "Corte parcial", solid: false };
  }
  const diff = Number(session.value?.difference || 0);
  if (Math.abs(diff) < 0.005) return { word: "Cuadra", sub: "Al centavo", title: "Cuadró", solid: false };
  if (diff < 0) return { word: "Faltan", sub: money(-diff), title: `Faltaron ${money(-diff)}`, solid: true };
  return { word: "Sobran", sub: money(diff), title: `Sobraron ${money(diff)}`, solid: true };
});

const duration = computed(() => {
  const a = validDate(session.value?.openedAt);
  const b = validDate(session.value?.closedAt) || printedAt;
  if (!a) return "";
  const mins = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
});

const SHORT = { cash: "EFEC", card: "TARJ", transfer: "TRANSF", split: "MIXTO", other: "OTRO" };
function methodShort(m) {
  return SHORT[m] || "—";
}
const moneyFmt = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function num(n) {
  return moneyFmt.format(Number(n || 0));
}
function money(n) {
  return `$${num(n)}`;
}
function moneyShort(n) {
  const v = Number(n || 0);
  return v >= 1000 ? `$${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(v)}` : money(v);
}
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
function validDate(d) {
  const dt = d ? new Date(d) : null;
  return dt && !Number.isNaN(dt.getTime()) ? dt : null;
}
function shortDate(d) {
  const dt = validDate(d);
  return dt ? `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}` : "";
}
function clock(d) {
  const dt = validDate(d);
  return dt ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "—";
}
function dayName(d) {
  const dt = validDate(d);
  return dt ? DAYS[dt.getDay()] : "Fecha";
}

onMounted(async () => {
  try {
    await fetchVenueSettings().catch(() => {});
    const id = String(route.params.id);
    session.value = await apiService.getCashSessionById(id);
    const all = await apiService.getOrders().catch(() => []);
    orders.value = (Array.isArray(all) ? all : [])
      .filter((o) => String(o.cashSessionId || "") === id)
      .sort((a, b) => new Date(a.paidAt || a.createdAt) - new Date(b.paidAt || b.createdAt));
    if (route.query.autoprint === "1") {
      setTimeout(() => window.print(), 400);
    }
  } catch (e) {
    const msg = e?.response?.data;
    err.value = typeof msg === "string" && msg ? msg : "No se pudo cargar el corte.";
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
/* Turno: abrió ●━━━━● cerró */
.cc-shift {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 2mm;
  margin-top: 3mm;
}
.cc-shift > div:not(.cc-track) { display: grid; line-height: 1.15; }
.cc-shift .r { text-align: right; }
.cc-shift span {
  font-size: 0.72em;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.cc-shift strong { font-size: 1.35em; font-weight: 900; }
.cc-shift em {
  max-width: 22mm;
  overflow: hidden;
  font-size: 0.82em;
  font-style: normal;
  font-weight: 700;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.cc-track {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.8mm;
}
.cc-track i {
  position: relative;
  width: 100%;
  height: 0;
  border-top: 2px solid #000;
}
.cc-track i::before,
.cc-track i::after {
  content: "";
  position: absolute;
  top: -1.3mm;
  width: 2.2mm;
  height: 2.2mm;
  border-radius: 50%;
  background: #000;
  transform: translateY(-1px);
}
.cc-track i::before { left: -0.4mm; }
.cc-track i::after { right: -0.4mm; background: #fff; border: 2px solid #000; }
.cc-track small {
  font-size: 0.8em;
  font-weight: 800;
  white-space: nowrap;
}

.cc-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 3mm;
  border: 1.5px solid #000;
  border-radius: 1.2mm;
}
.cc-kpis div {
  display: grid;
  justify-items: center;
  padding: 1.4mm 0.5mm;
  min-width: 0;
}
.cc-kpis div + div { border-left: 1.5px dashed #000; }
.cc-kpis strong {
  max-width: 100%;
  overflow: hidden;
  font-size: 1.25em;
  font-weight: 900;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-kpis span {
  font-size: 0.68em;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.cc-methods { display: grid; gap: 1.6mm; }
.cc-bar {
  height: 2.2mm;
  margin-top: 0.6mm;
  border: 1.2px solid #000;
  border-radius: 0.6mm;
}
.cc-bar i {
  display: block;
  height: 100%;
  background: #000;
}
.cc-after { margin-top: 1.6mm; font-size: 0.92em; }

/* Suma con signos a la izquierda y raya antes del resultado */
.cc-sum {
  display: grid;
  gap: 0.8mm;
}
.cc-row {
  display: grid;
  grid-template-columns: 3.4mm minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 1mm;
}
.cc-row i {
  font-style: normal;
  font-weight: 900;
  text-align: center;
}
.cc-row b { font-weight: 800; white-space: nowrap; }
.cc-row.eq {
  margin-top: 0.6mm;
  padding-top: 1mm;
  border-top: 1.5px solid #000;
  font-size: 1.12em;
  font-weight: 900;
}
.cc-row.eq b { font-weight: 900; }
.cc-row.counted {
  margin-top: 0.8mm;
  padding: 1mm 0;
  border-top: 1.5px dashed #000;
  border-bottom: 1.5px dashed #000;
  font-size: 1.12em;
  font-weight: 800;
}

.cc-notes {
  margin-top: 2.5mm;
  padding: 1.4mm 2mm;
  border-left: 3px solid #000;
}
.cc-notes span {
  font-size: 0.72em;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.cc-notes p {
  font-family: "Caveat", "Segoe Print", cursive;
  font-size: 1.45em;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.cc-list { display: grid; font-size: 0.9em; }
.cc-tk {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  gap: 2mm;
  padding: 0.5mm 0;
}
.cc-tk + .cc-tk { border-top: 1px dotted #000; }
.cc-tk b { font-weight: 800; text-align: right; }
.cc-tk.void b { text-decoration: line-through; }
.cc-tk.void span:nth-child(3) { font-weight: 900; }

.cc-sign {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4mm;
  margin-top: 9mm;
}
.cc-sign div { display: grid; justify-items: center; text-align: center; }
.cc-sign i { width: 100%; border-top: 1.5px solid #000; margin-bottom: 0.6mm; }
.cc-sign span {
  font-size: 0.72em;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.cc-sign em {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.82em;
  font-style: normal;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
