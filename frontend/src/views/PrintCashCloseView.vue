<template>
  <div class="wrap">
    <div class="no-print bar">
      <button type="button" class="btn" @click="print">Imprimir</button>
      <button type="button" class="btn ghost" @click="closeWin">Cerrar</button>
    </div>

    <div class="ticket">
      <p v-if="loading" class="center">Cargando…</p>
      <p v-else-if="err" class="center err">{{ err }}</p>

      <template v-else-if="session">
        <div class="center head">
          <p class="shop">{{ businessName }}</p>
          <p class="subtype">{{ typeLabel }}</p>
          <p v-if="address" class="muted">{{ address }}</p>
          <p v-if="phone" class="muted">Tel. {{ phone }}</p>
        </div>

        <div class="rule"></div>
        <p class="center title">CORTE DE CAJA (Z)</p>
        <div class="rule"></div>

        <div class="meta-block">
          <div class="meta-row"><span>Sesión</span><strong>{{ shortId(session.id) }}</strong></div>
          <div class="meta-row"><span>Abrió</span><strong>{{ (session.openedBy || '—').toUpperCase() }}</strong></div>
          <div class="meta-row"><span>Apertura</span><strong>{{ formatDate(session.openedAt) }}</strong></div>
          <template v-if="session.closedAt">
            <div class="meta-row"><span>Cerró</span><strong>{{ (session.closedBy || '—').toUpperCase() }}</strong></div>
            <div class="meta-row"><span>Cierre</span><strong>{{ formatDate(session.closedAt) }}</strong></div>
          </template>
          <div class="meta-row"><span>Tickets</span><strong>{{ orders.length }}</strong></div>
          <div class="meta-row"><span>Artículos</span><strong>{{ totalArts }}</strong></div>
        </div>

        <div class="rule dashed"></div>
        <p class="center section">VENTAS POR MÉTODO</p>

        <div class="row"><span>Fondo inicial</span><span>{{ moneyPlain(session.openingFloat) }}</span></div>
        <div class="row"><span>Efectivo</span><span>{{ moneyPlain(cashSales) }}</span></div>
        <div class="row"><span>Tarjeta</span><span>{{ moneyPlain(session.expectedCard) }}</span></div>
        <div class="row"><span>Transferencia</span><span>{{ moneyPlain(session.expectedTransfer) }}</span></div>
        <div class="row"><span>Otros</span><span>{{ moneyPlain(session.expectedOther) }}</span></div>

        <div class="rule dashed"></div>
        <div class="row"><span>Total ventas</span><span>{{ moneyPlain(session.expectedTotal) }}</span></div>
        <div class="row"><span>IVA cobrado</span><span>{{ moneyPlain(taxCollected) }}</span></div>
        <div v-if="cardExtraTotal" class="row">
          <span>IVA extra tarjeta</span>
          <span>{{ moneyPlain(cardExtraTotal) }}</span>
        </div>
        <div class="row"><span>Efectivo esperado</span><span>{{ moneyPlain(session.expectedCash) }}</span></div>
        <div class="row"><span>Efectivo contado</span><span>{{ moneyPlain(session.countedCash) }}</span></div>

        <div class="rule"></div>
        <div class="row grand">
          <span>DIFERENCIA</span>
          <span>{{ moneyPlain(session.difference) }}</span>
        </div>
        <div class="rule"></div>

        <template v-if="orders.length">
          <p class="center section">DETALLE DE TICKETS</p>
          <div class="cols hdr">
            <span>Folio</span>
            <span>Pago</span>
            <span class="r">Total</span>
          </div>
          <div class="rule thin"></div>
          <div v-for="o in orders" :key="o.id" class="cols line">
            <span>{{ shortId(o.id) }}</span>
            <span>{{ payShort(o.paymentMethod) }}</span>
            <span class="r">{{ moneyPlain(o.total) }}</span>
          </div>
          <div class="rule dashed"></div>
        </template>

        <template v-if="session.notes">
          <p class="note">Obs: {{ session.notes }}</p>
          <div class="rule dashed"></div>
        </template>

        <p class="center thanks">Fin de corte de caja</p>
        <p class="center muted">Conserve este comprobante</p>
        <p class="center folio-bar">*{{ shortId(session.id) }}*</p>
        <p class="center tiny brand-print"><span class="mi">Mi</span><span class="rest"> Tiendita</span></p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { apiService } from "../apiService";
import { venueStore, fetchVenueSettings } from "../venueStore";

const route = useRoute();
const session = ref(null);
const orders = ref([]);
const loading = ref(true);
const err = ref("");

const businessName = computed(() =>
  (venueStore.businessName || "TIENDA").toUpperCase()
);
const address = computed(() => venueStore.address || "");
const phone = computed(() => venueStore.phone || "");
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

const cashSales = computed(
  () => Number(session.value?.expectedCash || 0) - Number(session.value?.openingFloat || 0)
);
const totalArts = computed(() =>
  orders.value.reduce(
    (s, o) => s + (o.items || []).reduce((a, i) => a + Number(i.quantity || 0), 0),
    0
  )
);
const taxCollected = computed(() =>
  orders.value.reduce((s, o) => s + Number(o.tax || 0), 0)
);
const cardExtraTotal = computed(() =>
  orders.value.reduce((s, o) => s + Number(o.cardExtraTax || 0), 0)
);

const payMap = { cash: "EFEC", card: "TARJ", transfer: "TRNS", other: "OTRO" };

function moneyPlain(n) {
  return Number(n || 0).toFixed(2);
}
function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
function shortId(id) {
  return String(id || "").slice(-8).toUpperCase();
}
function payShort(m) {
  return payMap[m] || "—";
}
function print() {
  window.print();
}
function closeWin() {
  window.close();
}

onMounted(async () => {
  try {
    await fetchVenueSettings().catch(() => {});
    const id = String(route.params.id);
    session.value = await apiService.getCashSessionById(id);
    const all = await apiService.getOrders();
    orders.value = (all || []).filter((o) => o.cashSessionId === id);
    if (route.query.autoprint === "1") {
      setTimeout(() => window.print(), 400);
    }
  } catch (e) {
    err.value = e.response?.data || "No se pudo cargar el corte";
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
.shop { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: 0.04em; }
.subtype { margin: 3px 0 5px; font-size: 9px; letter-spacing: 0.14em; color: #333; }
.muted { margin: 0; font-size: 10px; color: #333; }
.title { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; }
.section { margin: 4px 0; font-weight: 700; letter-spacing: 0.06em; font-size: 10px; }
.rule { border: none; border-top: 1.5px solid #111; margin: 6px 0; height: 0; }
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
.row {
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
  font-variant-numeric: tabular-nums;
}
.grand { font-size: 14px; font-weight: 700; }
.cols {
  display: grid;
  grid-template-columns: 1fr 0.7fr 1fr;
  gap: 0.2rem;
  font-variant-numeric: tabular-nums;
}
.cols.hdr { font-weight: 700; font-size: 10px; }
.cols.line { margin-bottom: 2px; }
.r { text-align: right; }
.note { margin: 0; font-size: 10px; }
.thanks { margin: 6px 0 2px; font-size: 12px; font-weight: 700; }
.folio-bar { margin: 8px 0 2px; font-size: 13px; letter-spacing: 0.12em; font-weight: 700; }
.tiny { margin: 2px 0 0; font-size: 9px; color: #666; }
.brand-print { font-weight: 800; }
.brand-print .mi { color: #e08a1e; }
.brand-print .rest { color: #1e5aa8; }
.err { color: #b42318; }
p { margin: 0; }

@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .wrap { min-height: auto; background: #fff; padding: 0; display: block; }
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
