<template>
  <div class="wrap">
    <div class="no-print bar">
      <button type="button" class="btn" @click="print">Imprimir</button>
      <button type="button" class="btn ghost" @click="closeWin">Cerrar</button>
    </div>

    <div class="ticket">
      <p v-if="loading" class="center">Cargando…</p>
      <p v-else-if="err" class="center err">{{ err }}</p>

      <template v-else-if="order">
        <div class="center head">
          <p class="shop">{{ businessName }}</p>
          <p class="subtype">{{ typeLabel }}</p>
          <p v-if="address" class="muted">{{ address }}</p>
          <p v-if="phone" class="muted">Tel. {{ phone }}</p>
        </div>

        <div class="rule"></div>
        <p class="center title">COMPROBANTE DE VENTA</p>
        <div class="rule"></div>

        <div class="meta-block">
          <div class="meta-row"><span>Folio</span><strong>{{ shortId(order.id) }}</strong></div>
          <div class="meta-row"><span>Fecha</span><strong>{{ formatDate(order.createdAt) }}</strong></div>
          <div v-if="order.paidAt" class="meta-row"><span>Cobro</span><strong>{{ formatDate(order.paidAt) }}</strong></div>
          <div class="meta-row"><span>Cajero</span><strong>{{ (cashier || '—').toUpperCase() }}</strong></div>
          <div class="meta-row"><span>Arts.</span><strong>{{ itemCount }}</strong></div>
        </div>

        <div class="rule dashed"></div>

        <div class="cols hdr">
          <span class="c-qty">Cant</span>
          <span class="c-name">Descripción</span>
          <span class="c-imp">Importe</span>
        </div>
        <div class="rule thin"></div>

        <div v-for="(item, i) in order.items || []" :key="i" class="item">
          <div class="cols">
            <span class="c-qty">{{ formatQty(item.quantity) }}</span>
            <span class="c-name">
              {{ item.name }}
              <small>{{ moneyPlain(item.price) }} c/u{{ item.priceIncludesTax ? ' · bruto' : '' }}</small>
            </span>
            <span class="c-imp">{{ moneyPlain(lineGross(item)) }}</span>
          </div>
        </div>

        <div class="rule dashed"></div>

        <div class="totals">
          <div class="row"><span>Subtotal</span><span>{{ moneyPlain(order.subtotalNet != null ? order.subtotalNet : order.subtotal) }}</span></div>
          <div v-if="order.discountAmount" class="row">
            <span>Descuento {{ order.discountPercent || 0 }}%</span>
            <span>-{{ moneyPlain(order.discountAmount) }}</span>
          </div>
          <div class="row"><span>IVA ({{ Math.round((order.taxRate || 0.16) * 100) }}%)</span><span>{{ moneyPlain(order.tax) }}</span></div>
          <div v-if="order.cardExtraTax" class="row">
            <span>IVA extra tarjeta</span>
            <span>{{ moneyPlain(order.cardExtraTax) }}</span>
          </div>
        </div>

        <div class="rule"></div>
        <div class="row grand">
          <span>TOTAL</span>
          <span>$ {{ moneyPlain(order.total) }}</span>
        </div>
        <div class="rule"></div>

        <template v-if="order.paymentStatus === 'paid'">
          <p class="center pay-label">{{ payMethodLabel(order.paymentMethod) }}</p>
          <p class="center paid">PAGADO</p>
        </template>
        <p v-else class="center unpaid">PENDIENTE DE PAGO</p>

        <div class="rule dashed"></div>
        <p class="center thanks">¡Gracias por su compra!</p>
        <div v-if="qrDataUrl" class="qr-block">
          <img :src="qrDataUrl" alt="Código QR para facturar" class="qr" />
          <p class="center thanks">Factura tú mismo</p>
          <p class="center legal">
            Escanea el QR y captura tu RFC.
            No hace falta pedirlo en caja. Vigente el mes de la compra.
          </p>
        </div>
        <p v-if="order.offlinePending" class="center legal">
          Venta en este dispositivo. El QR de factura aparece cuando se sincronice.
        </p>
        <p v-else-if="!qrDataUrl" class="center legal">
          Documento informativo. Solicite factura en caja si la requiere.
        </p>
        <p class="center folio-bar">*{{ shortId(order.id) }}*</p>
        <p class="center tiny brand-print"><span class="mi">Mi</span><span class="rest"> Tiendita</span></p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import QRCode from "qrcode";
import { apiService, appPublicOrigin } from "../apiService";
import { venueStore, fetchVenueSettings } from "../venueStore";
import { authStore } from "../authStore";
import { lineBreakdown } from "../tax";
import { getSale, saleToPrintOrder } from "../offlineDb";

const route = useRoute();
const order = ref(null);
const loading = ref(true);
const err = ref("");
const qrDataUrl = ref("");

const businessName = computed(() =>
  (venueStore.businessName || "TIENDA").toUpperCase()
);
const address = computed(() => venueStore.address || "");
const phone = computed(() => venueStore.phone || "");
const cashier = computed(() => authStore.username || "");
const itemCount = computed(() =>
  (order.value?.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0)
);

const typeLabel = computed(() => {
  const map = {
    abarrotes: "ABARROTES / MINISÚPER",
    convenience: "TIENDA DE CONVENIENCIA",
    pharmacy: "FARMACIA",
    hardware: "FERRETERÍA",
    other: "COMERCIO",
    restaurant: "RESTAURANTE",
    cafe: "CAFÉ",
    bar: "BAR",
    hotel: "HOTEL",
  };
  return map[venueStore.businessType] || "ABARROTES / MINISÚPER";
});

const payLabels = {
  cash: "EFECTIVO",
  card: "TARJETA",
  transfer: "TRANSFERENCIA",
  split: "MIXTO",
  other: "OTRO",
};

function moneyPlain(n) {
  return Number(n || 0).toFixed(2);
}
function formatQty(q) {
  const n = Number(q || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}
function lineGross(item) {
  const rate = order.value?.taxRate || 0.16;
  return lineBreakdown(item.price, item.quantity, item.priceIncludesTax, rate).gross;
}
function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
function payMethodLabel(m) {
  return payLabels[m] || String(m || "—").toUpperCase();
}
function shortId(id) {
  return String(id || "").slice(-8).toUpperCase();
}
function print() {
  window.print();
}
function closeWin() {
  window.close();
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
        err.value = "No se encontró la venta local";
        return;
      }
      order.value = saleToPrintOrder(sale);
    } else {
      order.value = await apiService.getOrdersById(String(route.params.id));
      await paintQr(order.value?.invoiceToken);
    }
    if (route.query.autoprint === "1") {
      setTimeout(() => window.print(), 400);
    }
  } catch (e) {
    err.value = e.response?.data || e.message || "No se pudo cargar el pedido";
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.wrap {
  min-height: 100vh;
  background: #d8dee8;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.no-print.bar { display: flex; gap: 0.5rem; }
.btn {
  border: none;
  background: #1e5aa8;
  color: #fff;
  border-radius: 0.55rem;
  padding: 0.65rem 1rem;
  font-weight: 700;
  cursor: pointer;
  font-family: var(--font-sans, system-ui, sans-serif);
}
.btn.ghost {
  background: #fff;
  color: #1a2332;
  border: 1px solid #c5cedb;
}

.ticket {
  width: 80mm;
  max-width: 100%;
  background: #fff;
  color: #111;
  padding: 5mm 4mm 10mm;
  font-family: "Courier New", Courier, monospace;
  font-size: 11px;
  line-height: 1.35;
  box-shadow: 0 8px 28px rgba(18, 32, 56, 0.18);
}
.center { text-align: center; }
.shop {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.subtype {
  margin: 3px 0 5px;
  font-size: 9px;
  letter-spacing: 0.14em;
  color: #333;
}
.muted { margin: 0; font-size: 10px; color: #333; }
.title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.rule {
  border: none;
  border-top: 1.5px solid #111;
  margin: 6px 0;
  height: 0;
}
.rule.dashed { border-top-style: dashed; border-top-width: 1px; }
.rule.thin { margin: 3px 0; border-top-width: 1px; }

.meta-block { display: grid; gap: 2px; }
.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}
.meta-row span { color: #444; }
.meta-row strong { font-weight: 700; }

.cols {
  display: grid;
  grid-template-columns: 2.4rem 1fr 3.2rem;
  gap: 0.2rem;
  font-variant-numeric: tabular-nums;
  align-items: start;
}
.cols.hdr { font-weight: 700; font-size: 10px; }
.c-qty { text-align: left; }
.c-imp { text-align: right; }
.c-name { text-align: left; word-break: break-word; }
.c-name small {
  display: block;
  font-size: 9px;
  color: #555;
  font-weight: 400;
}
.item { margin-bottom: 5px; }

.totals { display: grid; gap: 2px; }
.row {
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
  font-variant-numeric: tabular-nums;
}
.grand {
  font-size: 15px;
  font-weight: 700;
  margin: 2px 0;
}
.pay-label {
  margin: 6px 0 2px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.paid {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.unpaid {
  margin: 6px 0;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.thanks {
  margin: 6px 0 4px;
  font-size: 12px;
  font-weight: 700;
}
.qr-block { margin: 4px 0 2px; }
.qr {
  display: block;
  width: 32mm;
  height: 32mm;
  margin: 0 auto 4px;
}
.legal {
  margin: 0;
  font-size: 9px;
  line-height: 1.4;
  color: #333;
}
.folio-bar {
  margin: 8px 0 2px;
  font-size: 13px;
  letter-spacing: 0.12em;
  font-weight: 700;
}
.tiny { margin: 2px 0 0; font-size: 9px; color: #666; }
.brand-print { font-weight: 800; }
.brand-print .mi { color: #e08a1e; }
.brand-print .rest { color: #1e5aa8; }
.err { color: #b42318; }
p { margin: 0; }

@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .wrap {
    min-height: auto;
    background: #fff;
    padding: 0;
    display: block;
  }
  .no-print { display: none !important; }
  .ticket {
    width: 72mm;
    max-width: 72mm;
    box-shadow: none;
    padding: 2mm 2mm 10mm;
    margin: 0 auto;
  }
}
</style>
