<template>
  <div class="tk-view">
    <div class="tk-bar">
      <button type="button" class="tk-btn" @click="close" title="Cerrar (Esc)">
        <PosIcon name="back" :size="18" />
        Cerrar
      </button>
      <div class="tk-bar-title">
        <strong>{{ order ? `Ticket #${folio}` : 'Ticket' }}</strong>
        <small v-if="order">{{ statusText }} · {{ money(order.total) }}</small>
      </div>
      <div class="tk-seg" role="group" aria-label="Ancho del papel">
        <button type="button" :aria-pressed="paper === '80'" @click="setPaper('80')">80<span class="tk-mm"> mm</span></button>
        <button type="button" :aria-pressed="paper === '58'" @click="setPaper('58')">58<span class="tk-mm"> mm</span></button>
      </div>
      <button type="button" class="tk-btn primary tk-print" :disabled="!order" @click="print">
        <PosIcon name="printer" :size="18" />
        Imprimir
      </button>
    </div>

    <div class="tk-stage">
      <div class="tk-sheet">
        <article class="tk-paper" :class="{ w58: paper === '58' }">
          <p v-if="loading" class="tk-state">Cargando ticket…</p>
          <p v-else-if="err" class="tk-state err">{{ err }}</p>

          <template v-else-if="order">
            <TicketHeader />

            <div class="tk-stub">
              <div>
                <span>Ticket</span>
                <strong class="tk-mono">Nº {{ folio }}</strong>
              </div>
              <div>
                <span>{{ dayName(stamp) }}</span>
                <p class="tk-stub-date">{{ shortDate(stamp) }}<br />{{ clock(stamp) }}</p>
              </div>
            </div>
            <div class="tk-meta">
              <span>Atendió <b>{{ cashier || '—' }}</b></span>
              <span>{{ countText }}</span>
            </div>

            <p class="tk-sec">Lo que llevas</p>
            <div class="tk-items">
              <div v-for="(item, i) in items" :key="i" class="tk-item">
                <span class="tk-item-n tk-mono">{{ String(i + 1).padStart(2, '0') }}</span>
                <div>
                  <p class="tk-item-name">{{ item.name }}</p>
                  <p v-if="item.notes" class="tk-item-note">{{ item.notes }}</p>
                  <div class="tk-line">
                    <span>{{ qty(item.quantity) }} × {{ money(item.price) }}</span>
                    <i class="tk-dots"></i>
                    <span>{{ money(lineGross(item)) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <hr class="tk-rule" />
            <div class="tk-line">
              <span>Subtotal</span><i class="tk-dots"></i><span>{{ money(order.subtotal) }}</span>
            </div>
            <div v-if="order.discountAmount" class="tk-line strong">
              <span>Descuento {{ pct(order.discountPercent) }}</span><i class="tk-dots"></i><span>−{{ money(order.discountAmount) }}</span>
            </div>
            <div v-if="order.cardExtraTax" class="tk-line">
              <span>Comisión por pago con tarjeta</span><i class="tk-dots"></i><span>+{{ money(order.cardExtraTax) }}</span>
            </div>
            <div v-if="order.deliveryFee" class="tk-line">
              <span>Envío</span><i class="tk-dots"></i><span>+{{ money(order.deliveryFee) }}</span>
            </div>

            <div class="tk-total">
              <span>Total</span>
              <strong><sup>$</sup>{{ num(order.total) }}</strong>
            </div>
            <p class="tk-taxnote">
              IVA {{ pct(rateOf(order.taxRate) * 100) }} incluido en el total: {{ money(order.tax) }}
            </p>

            <div v-if="paid" class="tk-pay" :class="{ single: !hasChangeBox }">
              <div>
                <span>Pagó con</span>
                <strong>{{ methodText }}</strong>
                <em v-if="order.paymentMethod === 'split'">
                  Tarjeta {{ money(order.cardAmount) }}<br />Efectivo {{ money(order.cashReceived) }}
                </em>
                <em v-else-if="order.cashReceived">{{ money(order.cashReceived) }}</em>
              </div>
              <div v-if="hasChangeBox" class="tk-change">
                <span>Su cambio</span>
                <strong>{{ money(order.change) }}</strong>
              </div>
            </div>

            <p v-if="order.discountAmount && paid" class="tk-flag">★ Hoy ahorraste {{ money(order.discountAmount) }} ★</p>

            <div class="tk-stamp-row">
              <div class="tk-stamp" :class="{ solid: status === 'pending' }">
                <b>{{ stampWord }}</b>
                <small>{{ stampSub }}</small>
              </div>
            </div>

            <p v-if="order.offlinePending" class="tk-flag">
              Venta guardada sin internet. Se sube sola al volver la conexión; el QR para facturar sale en la reimpresión.
            </p>

            <p class="tk-hand">{{ thanks }}</p>
            <p class="tk-note">{{ note }}</p>

            <template v-if="qrDataUrl && paid">
              <div class="tk-cut" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round">
                  <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                  <path d="M8.1 8.1L20 20M8.1 15.9L20 4" />
                </svg>
                <span>Recorte para facturar</span>
              </div>
              <div class="tk-invoice">
                <img :src="qrDataUrl" alt="Código QR para facturar esta compra" />
                <div>
                  <h3>Factura tú mismo</h3>
                  <ol>
                    <li>Escanea el código.</li>
                    <li>Captura tu RFC.</li>
                    <li>Te llega por correo.</li>
                  </ol>
                  <small>Válido el mes de la compra · Folio {{ folio }}</small>
                </div>
              </div>
            </template>
            <p v-else-if="paid && !order.offlinePending" class="tk-note">Si requiere factura, solicítela en caja.</p>

            <div class="tk-foot">
              <TicketBarcode :value="folio" :caption="folio" />
              <p class="tk-made">Hecho con <b>Mi Tiendita</b></p>
            </div>
          </template>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import QRCode from "qrcode";
import "../ticket.css";
import { apiService, appPublicOrigin } from "../apiService";
import { venueStore, fetchVenueSettings } from "../venueStore";
import { authStore } from "../authStore";
import { lineBreakdown, rateOf } from "../tax";
import { getSale, saleToPrintOrder } from "../offlineDb";
import { useTicketShell, folioOf, closingLine, closingNote } from "../ticketShell";
import PosIcon from "../components/PosIcon.js";
import TicketHeader from "../components/TicketHeader.vue";
import TicketBarcode from "../components/TicketBarcode.vue";

const route = useRoute();
const { paper, setPaper, print, close } = useTicketShell(() =>
  route.name === "printOffline" ? "/pos" : "/orders"
);

const order = ref(null);
const loading = ref(true);
const err = ref("");
const qrDataUrl = ref("");

const items = computed(() => (Array.isArray(order.value?.items) ? order.value.items : []));
const folio = computed(() => folioOf(order.value?.id));
const cashier = computed(() => authStore.username || "");
const stamp = computed(() => order.value?.paidAt || order.value?.createdAt);
const thanks = computed(() => closingLine(venueStore.businessType));
const note = computed(() => closingNote(venueStore.businessType));

// Con kilos o metros no se suman cantidades: cada renglón cuenta como un artículo
const countText = computed(() => {
  const lines = items.value.length;
  const units = items.value.reduce((s, i) => {
    const q = Number(i.quantity || 0);
    return s + (Number.isInteger(q) ? q : 1);
  }, 0);
  const a = `${units} ${units === 1 ? "artículo" : "artículos"}`;
  return units === lines ? a : `${a} · ${lines} ${lines === 1 ? "producto" : "productos"}`;
});

const status = computed(() => {
  const o = order.value;
  if (!o) return "";
  if (o.paymentStatus === "refunded") return "refunded";
  if (o.status === "cancelled") return "cancelled";
  if (o.paymentStatus === "paid") return "paid";
  return "pending";
});
const paid = computed(() => status.value === "paid");
const statusText = computed(
  () => ({ paid: "Pagado", refunded: "Devuelta", cancelled: "Cancelada", pending: "Pendiente de pago" })[status.value] || ""
);
const stampWord = computed(
  () => ({ paid: "Pagado", refunded: "Devuelta", cancelled: "Cancelada", pending: "Por cobrar" })[status.value] || ""
);
const stampSub = computed(() => {
  const o = order.value;
  if (status.value === "refunded" && o?.refundedAt) return `${shortDate(o.refundedAt)} · ${clock(o.refundedAt)}`;
  if (status.value === "pending") return "Pendiente de pago";
  if (status.value === "paid" && o?.offlinePending) return "Sin sincronizar";
  return `${shortDate(stamp.value)} · ${clock(stamp.value)}`;
});

const METHOD = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  split: "Tarjeta y efectivo",
  other: "Otro medio",
};
const methodText = computed(() => METHOD[order.value?.paymentMethod] || "—");
const hasChangeBox = computed(() => {
  const o = order.value;
  return Boolean(o && (o.paymentMethod === "cash" || o.paymentMethod === "split") && Number(o.cashReceived || 0) > 0);
});

const moneyFmt = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function num(n) {
  return moneyFmt.format(Number(n || 0));
}
function money(n) {
  return `$${num(n)}`;
}
function qty(q) {
  const n = Number(q || 0);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}
function pct(p) {
  return `${Number(Number(p || 0).toFixed(2))}%`;
}
function lineGross(item) {
  const rate = rateOf(order.value?.taxRate);
  return lineBreakdown(item.price, item.quantity, item.priceIncludesTax, rate).gross;
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
  return dt ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "";
}
function dayName(d) {
  const dt = validDate(d);
  return dt ? DAYS[dt.getDay()] : "Fecha";
}

async function paintQr(token) {
  if (!token) {
    qrDataUrl.value = "";
    return;
  }
  const url = `${appPublicOrigin()}/factura/${token}`;
  qrDataUrl.value = await QRCode.toDataURL(url, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

watch(
  () => order.value?.invoiceToken,
  (token) => {
    paintQr(token).catch(() => {
      qrDataUrl.value = "";
    });
  }
);

onMounted(async () => {
  try {
    await fetchVenueSettings().catch(() => {});
    if (route.name === "printOffline") {
      const sale = await getSale(String(route.params.clientSaleId));
      if (!sale) {
        err.value = "No se encontró la venta en este dispositivo.";
        return;
      }
      order.value = saleToPrintOrder(sale);
    } else {
      order.value = await apiService.getOrdersById(String(route.params.id));
      await paintQr(order.value?.invoiceToken).catch(() => {});
    }
    if (route.query.autoprint === "1") {
      setTimeout(() => window.print(), 400);
    }
  } catch (e) {
    const msg = e?.response?.data;
    err.value = typeof msg === "string" && msg ? msg : "No se pudo cargar el ticket.";
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.tk-taxnote {
  margin-top: 1mm !important;
  text-align: right;
  font-size: 0.82em;
}
</style>
