<template>
  <AppShell>
    <div class="orders-page">
      <!-- Estado de caja: franja compacta -->
      <section class="caja-card" :class="cashOpen ? 'is-open' : 'is-closed'">
        <div class="caja-head">
          <div>
            <p class="caja-kicker">{{ cashOpen ? (unpaidOrders.length ? 'Tienes ventas por cobrar' : 'Caja lista') : 'Primero abre la caja' }}</p>
            <h2>{{ cashOpen ? 'Caja abierta' : 'Caja cerrada' }}</h2>
          </div>
          <button
            v-if="!cashOpen"
            type="button"
            class="btn-primary"
            @click="showOpen = true"
          >Abrir caja</button>
          <button
            v-else
            type="button"
            class="btn-ghost"
            @click="prepClose"
          >Cerrar turno</button>
        </div>
        <div v-if="cashOpen" class="caja-nums">
          <div>
            <span>Vendiste</span>
            <strong>{{ money(cashTotals.total) }}</strong>
          </div>
          <div>
            <span>En efectivo</span>
            <strong>{{ money(cashTotals.cash) }}</strong>
          </div>
          <div>
            <span>Deberías tener</span>
            <strong>{{ money(expectedCash) }}</strong>
          </div>
        </div>
        <p v-else class="caja-wait">Cuando la abras, aquí verás cuánto vendiste y cuánto efectivo debería haber.</p>
      </section>
      <p v-if="cashMsg" class="ok">{{ cashMsg }}</p>
      <p v-if="cashErr" class="err">{{ cashErr }}</p>

      <div class="filters">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          :class="{ active: filter === f.id }"
          @click="filter = f.id"
        >{{ f.label }}</button>
      </div>

      <div class="list">
        <article v-for="o in filtered" :key="o.id" class="sale">
          <div class="sale-top">
            <div>
              <p class="sale-when">{{ formatDate(o.createdAt) }}</p>
              <h3>{{ money(o.total) }}</h3>
            </div>
            <span class="badge" :class="saleTone(o)">{{ saleLabel(o) }}</span>
          </div>
          <ul v-if="(o.items || []).length" class="items">
            <li v-for="(item, i) in (o.items || []).slice(0, 3)" :key="i">
              {{ item.quantity }} × {{ item.name }}
            </li>
            <li v-if="(o.items || []).length > 3" class="more-items">
              y {{ (o.items || []).length - 3 }} más
            </li>
          </ul>
          <p v-if="o.invoice?.status === 'requested'" class="invoice-line">
            Piden factura: {{ o.invoice.legalName }}
          </p>
          <div class="sale-actions">
            <button
              v-if="canCharge(o)"
              type="button"
              class="btn-primary"
              @click="openPay(o)"
            >Cobrar</button>
            <button
              v-if="canCancel(o)"
              type="button"
              class="btn-ghost"
              @click="askVoid(o)"
            >Cancelar</button>
            <button
              v-if="canReturn(o)"
              type="button"
              class="btn-ghost"
              @click="askVoid(o)"
            >Devolver</button>
            <router-link
              class="link-btn"
              :to="`/print/order/${o.id}?mode=receipt`"
              target="_blank"
            >Ver ticket</router-link>
            <button
              v-if="o.invoice?.status === 'requested'"
              type="button"
              class="btn-ghost"
              @click="markIssued(o)"
            >Ya la facturé</button>
          </div>
        </article>
        <p v-if="!filtered.length" class="empty">No hay ventas en esta lista.</p>
      </div>

      <!-- Cancelar o devolver -->
      <Teleport to="body">
        <div v-if="voidOrder" class="modal-bg">
          <div class="modal" role="dialog" aria-modal="true">
            <h3>{{ voidOrder.paymentStatus === 'paid' ? 'Devolver venta' : 'Cancelar venta' }}</h3>
            <p class="modal-hint">
              <template v-if="voidOrder.paymentStatus === 'paid'">
                Regresas {{ money(voidOrder.total) }}<template v-if="voidOrder.inventoryApplied"> y los productos vuelven al inventario</template>.
              </template>
              <template v-else>
                Esta venta no se cobró. Solo se quita de la lista.
              </template>
            </p>
            <div class="modal-actions">
              <button type="button" @click="voidOrder = null">Volver</button>
              <button type="button" class="btn-danger" :disabled="voidBusy" @click="confirmVoid">
                {{ voidBusy ? 'Guardando…' : (voidOrder.paymentStatus === 'paid' ? 'Devolver' : 'Cancelar venta') }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Abrir caja -->
      <Teleport to="body">
        <div v-if="showOpen" class="modal-bg">
          <form class="modal" role="dialog" aria-modal="true" @submit.prevent="openCash">
            <h3>Abrir caja</h3>
            <p class="modal-hint">Escribe el efectivo con el que empieza el turno. Si no llevas cambio, pon 0.</p>
            <label>
              Efectivo inicial
              <input
                v-model.number="openingFloat"
                type="number"
                min="0"
                step="1"
                inputmode="decimal"
                autofocus
              />
            </label>
            <div class="modal-actions">
              <button type="button" @click="showOpen = false">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="cashBusy">
                {{ cashBusy ? 'Abriendo…' : 'Abrir' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Cerrar caja -->
      <Teleport to="body">
        <div v-if="showClose" class="modal-bg">
          <form class="modal" role="dialog" aria-modal="true" @submit.prevent="closeCash">
            <h3>Cerrar turno</h3>
            <div class="close-summary">
              <div><span>Empezaste con</span><strong>{{ money(session?.openingFloat) }}</strong></div>
              <div><span>Vendiste</span><strong>{{ money(cashTotals.total) }}</strong></div>
              <div><span>Deberías tener en efectivo</span><strong>{{ money(expectedCash) }}</strong></div>
            </div>
            <label>
              ¿Cuánto efectivo contaste?
              <input
                v-model.number="countedCash"
                type="number"
                min="0"
                step="1"
                inputmode="decimal"
                required
              />
            </label>
            <p class="diff" :class="{ ok: difference === 0, bad: difference !== 0 }">
              Diferencia: {{ money(difference) }}
            </p>
            <div class="modal-actions">
              <button type="button" @click="showClose = false">Cancelar</button>
              <button type="submit" class="btn-danger" :disabled="cashBusy">
                {{ cashBusy ? 'Cerrando…' : 'Cerrar e imprimir' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Cobrar -->
      <Teleport to="body">
        <div v-if="payOrder" class="modal-bg">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pay-title">
            <h3 id="pay-title">Cobrar esta venta</h3>
            <div class="pay-sum">
              <div><span>Ticket</span><strong>{{ money(payOrder.total) }}</strong></div>
              <div v-if="payMethod === 'card' && cardExtraIva">
                <span>IVA extra tarjeta ({{ Math.round(TAX_RATE * 100) }}%)</span>
                <strong>{{ money(cardExtraAmount) }}</strong>
              </div>
              <div class="pay-total">
                <span>A cobrar</span>
                <strong>{{ money(payTotal) }}</strong>
              </div>
            </div>
            <label>¿Cómo pagó?
              <select v-model="payMethod">
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label v-if="payMethod === 'card'" class="check">
              <input v-model="cardExtraIva" type="checkbox" />
              Agregar IVA extra en tarjeta ({{ Math.round(TAX_RATE * 100) }}%)
            </label>
            <div class="modal-actions">
              <button type="button" @click="payOrder = null">Cancelar</button>
              <button type="button" class="btn-primary" @click="confirmPay">Cobrar</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";
import {
  labelOf,
  modalityLabel,
  orderStatusLabel,
  paymentStatusLabel,
} from "../labels";
import { venueStore } from "../venueStore";
import { offlineStore } from "../offlineFlags";
import { flushOfflineSales } from "../offlineSync";

const router = useRouter();
const orders = ref([]);
const filter = ref("open");
const payOrder = ref(null);
const payMethod = ref("cash");
const cardExtraIva = ref(false);

const TAX_RATE = computed(() => Number(venueStore.taxRate) || 0.16);

const cardExtraAmount = computed(() => {
  if (!payOrder.value || payMethod.value !== "card" || !cardExtraIva.value) return 0;
  return Number((Number(payOrder.value.total || 0) * TAX_RATE.value).toFixed(2));
});
const payTotal = computed(() =>
  Number((Number(payOrder.value?.total || 0) + cardExtraAmount.value).toFixed(2))
);

const cashOpen = ref(false);
const session = ref(null);
const cashTotals = ref({ cash: 0, card: 0, transfer: 0, other: 0, total: 0 });
const openingFloat = ref(0);
const countedCash = ref(0);
const cashBusy = ref(false);
const cashMsg = ref("");
const cashErr = ref("");
const showOpen = ref(false);
const showClose = ref(false);
const voidOrder = ref(null);
const voidBusy = ref(false);

const filters = [
  { id: "open", label: "Abiertos" },
  { id: "unpaid", label: "Por cobrar" },
  { id: "paid", label: "Pagados" },
  { id: "invoices", label: "Facturas" },
  { id: "all", label: "Todos" },
];

const filtered = computed(() => {
  if (filter.value === "all") return orders.value;
  if (filter.value === "paid") return orders.value.filter((o) => o.paymentStatus === "paid");
  if (filter.value === "unpaid") {
    return orders.value.filter((o) => o.paymentStatus === "unpaid" && o.status !== "cancelled");
  }
  if (filter.value === "invoices") {
    return orders.value.filter((o) => o.invoice?.status === "requested" || o.invoice?.status === "issued");
  }
  return orders.value.filter((o) => o.paymentStatus === "unpaid" && o.status !== "cancelled");
});

const expectedCash = computed(
  () =>
    Number(session.value?.openingFloat || 0) +
    Number(cashTotals.value.cash || 0) -
    Number(session.value?.cashRefunds || 0)
);
const difference = computed(() => Number(countedCash.value || 0) - expectedCash.value);
const unpaidOrders = computed(() =>
  orders.value.filter((o) => o.paymentStatus === "unpaid" && o.status !== "cancelled")
);

function money(n) {
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}
function statusText(s) {
  return labelOf(orderStatusLabel, s);
}
function paymentText(s) {
  return labelOf(paymentStatusLabel, s, "Sin pagar");
}
function canCharge(o) {
  return o.paymentStatus === "unpaid" && o.status !== "cancelled";
}
function canCancel(o) {
  return o.paymentStatus !== "paid" && o.paymentStatus !== "refunded" && o.status !== "cancelled";
}
function canReturn(o) {
  return o.paymentStatus === "paid";
}
function saleLabel(o) {
  if (o.paymentStatus === "refunded") return "Devuelta";
  if (o.status === "cancelled") return "Cancelada";
  return paymentText(o.paymentStatus);
}
function saleTone(o) {
  if (o.paymentStatus === "refunded" || o.status === "cancelled") return "cancelled";
  return o.paymentStatus;
}
function askVoid(order) {
  cashErr.value = "";
  voidOrder.value = order;
}

async function confirmVoid() {
  if (!voidOrder.value || voidBusy.value) return;
  voidBusy.value = true;
  cashErr.value = "";
  cashMsg.value = "";
  const wasPaid = voidOrder.value.paymentStatus === "paid";
  try {
    const updated = await apiService.voidOrder(voidOrder.value.id);
    const i = orders.value.findIndex((o) => o.id === updated.id);
    if (i >= 0) orders.value[i] = updated;
    voidOrder.value = null;
    cashMsg.value = wasPaid ? "Venta devuelta." : "Venta cancelada.";
    await loadCash();
  } catch (e) {
    cashErr.value = e.response?.data || "No se pudo cancelar la venta.";
    voidOrder.value = null;
  } finally {
    voidBusy.value = false;
  }
}
function modalityText(m) {
  return labelOf(modalityLabel, m);
}

async function loadCash() {
  try {
    const data = await apiService.getCashSession();
    cashOpen.value = Boolean(data.open);
    session.value = data.session;
    cashTotals.value = data.totals || { cash: 0, card: 0, transfer: 0, other: 0, total: 0 };
    if (data.session) {
      countedCash.value = Number(
        (data.session.openingFloat || 0) + (data.totals?.cash || 0)
      );
    }
  } catch {
    cashOpen.value = false;
    session.value = null;
  }
}

function prepClose() {
  if (offlineStore.pending > 0) {
    cashErr.value = `Hay ${offlineStore.pending} venta(s) sin sincronizar. Espera a que vuelva internet antes del corte.`;
    return;
  }
  countedCash.value = expectedCash.value;
  cashErr.value = "";
  showClose.value = true;
}

async function openCash() {
  cashBusy.value = true;
  cashErr.value = "";
  cashMsg.value = "";
  try {
    await apiService.openCashSession(Number(openingFloat.value || 0));
    showOpen.value = false;
    cashMsg.value = "Caja abierta.";
    await loadCash();
  } catch (e) {
    cashErr.value = e.response?.data || "No se pudo abrir la caja";
  } finally {
    cashBusy.value = false;
  }
}

async function closeCash() {
  if (offlineStore.pending > 0) {
    cashErr.value = `Hay ${offlineStore.pending} venta(s) sin sincronizar. No cierres caja todavía.`;
    return;
  }
  cashBusy.value = true;
  cashErr.value = "";
  cashMsg.value = "";
  try {
    const res = await apiService.closeCashSession(Number(countedCash.value || 0));
    showClose.value = false;
    cashMsg.value = `Turno cerrado. Diferencia: ${money(res.session?.difference)}`;
    if (res.session?.id) {
      router.push(`/print/cash/${res.session.id}?autoprint=1`);
    }
    await loadCash();
  } catch (e) {
    cashErr.value = e.response?.data || "No se pudo cerrar la caja";
  } finally {
    cashBusy.value = false;
  }
}

async function markIssued(order) {
  try {
    const updated = await apiService.markInvoiceIssued(order.id);
    const i = orders.value.findIndex((o) => o.id === order.id);
    if (i >= 0) orders.value[i] = updated;
  } catch (e) {
    cashErr.value = e.response?.data || "No se pudo marcar la factura";
  }
}

async function load() {
  await flushOfflineSales();
  try {
    orders.value = (await apiService.getOrders()) || [];
  } catch {
    orders.value = [];
  }
  await loadCash();
}

function openPay(o) {
  if (!cashOpen.value) {
    cashErr.value = "Abre la caja antes de cobrar.";
    showOpen.value = true;
    return;
  }
  payOrder.value = o;
  payMethod.value = "cash";
  cardExtraIva.value = true;
}

async function confirmPay() {
  if (!payOrder.value) return;
  try {
    const updated = await apiService.payOrder(payOrder.value.id, payMethod.value, {
      cardExtraIva: payMethod.value === "card" && cardExtraIva.value,
    });
    const idx = orders.value.findIndex((x) => x.id === updated.id);
    if (idx >= 0) orders.value[idx] = updated;
    const id = payOrder.value.id;
    payOrder.value = null;
    await loadCash();
    window.open(`/print/order/${id}?mode=receipt&autoprint=1`, "_blank", "noopener");
  } catch (e) {
    cashErr.value = e.response?.data || "No se pudo cobrar";
  }
}

async function setStatus(o, status) {
  const updated = await apiService.updateOrderStatus(o.id, status);
  const idx = orders.value.findIndex((x) => x.id === updated.id);
  if (idx >= 0) orders.value[idx] = updated;
}

onMounted(load);
</script>

<style scoped>
.orders-page {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: t-fade-up .45s ease both;
}

.caja-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.9rem 0.95rem;
  border-radius: 1rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel);
  margin-bottom: 0.65rem;
  flex-shrink: 0;
}
.caja-card.is-closed {
  border-color: color-mix(in srgb, var(--timber-warning) 40%, var(--timber-line));
}
.caja-card.is-open {
  border-color: color-mix(in srgb, var(--timber-success) 40%, var(--timber-line));
}
.caja-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.caja-kicker {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.caja-head h2 {
  margin: 0.1rem 0 0;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.caja-wait {
  margin: 0;
  color: var(--timber-muted);
  font-size: 0.88rem;
  line-height: 1.4;
}
.caja-nums {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
}
.caja-nums div {
  display: grid;
  gap: 0.15rem;
  padding: 0.55rem 0.6rem;
  border-radius: 0.75rem;
  background: var(--timber-surface);
}
.caja-nums span {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.caja-nums strong {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.btn-ghost {
  min-height: 2.85rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 700;
  cursor: pointer;
}

.toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.55rem; gap:0.75rem; flex-wrap:wrap; flex-shrink:0; }
.toolbar p { margin:0; color:var(--timber-muted); font-size:0.88rem; }
.btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; border-radius:.7rem; padding:.55rem 0.95rem; font-weight:700; text-decoration:none; cursor:pointer; display:inline-block; min-height:2.6rem; box-shadow:var(--timber-shadow); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-danger { background:var(--timber-danger); color:#fff; border:none; border-radius:.7rem; padding:.55rem 0.95rem; font-weight:700; cursor:pointer; min-height:2.6rem; }
.filters { display:flex; gap:.35rem; flex-wrap:wrap; margin-bottom:0.55rem; flex-shrink:0; }
.filters button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:999px; padding:.4rem 0.85rem; cursor:pointer; font-size:.82rem; font-weight:700; min-height:2.4rem; }
.filters button.active { background:var(--timber-primary); color:var(--timber-on-primary); border-color:transparent; }
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 0.55rem;
  align-content: start;
  padding-bottom: 0.25rem;
}
.sale {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.95rem;
  padding: 0.85rem;
  display: grid;
  gap: 0.65rem;
}
.sale-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}
.sale-when {
  margin: 0;
  color: var(--timber-muted);
  font-size: 0.8rem;
  font-weight: 700;
}
.sale-top h3 {
  margin: 0.1rem 0 0;
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.sale-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.sale-actions .btn-primary { min-height: 2.75rem; }
.badge {
  display: inline-flex; align-items: center; justify-content: center;
  height: 1.7rem; padding: 0 0.75rem; border-radius: 999px;
  font-size: 0.75rem; font-weight: 700; line-height: 1; white-space: nowrap;
  background: var(--timber-primary-soft); color: var(--timber-primary);
}
.badge.st-pending { background: var(--timber-warning-soft); color: var(--timber-warning); }
.badge.st-preparing { background: color-mix(in srgb, var(--timber-accent) 22%, transparent); color: var(--timber-accent); }
.badge.st-ready { background: var(--timber-primary-soft); color: var(--timber-primary); }
.badge.st-served { background: var(--timber-success-soft); color: var(--timber-success); }
.badge.st-cancelled { background: var(--timber-danger-soft); color: var(--timber-danger); }
.badge.paid { background: var(--timber-success-soft); color: var(--timber-success); }
.badge.unpaid { background: var(--timber-warning-soft); color: var(--timber-warning); }
.badge.cancelled,
.badge.refunded { background: var(--timber-danger-soft); color: var(--timber-danger); }
.badge.invoice { background: var(--timber-primary-soft); color: var(--timber-primary); }
.badge.issued { background: var(--timber-success-soft); color: var(--timber-success); }
.invoice-line {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  color: var(--timber-muted);
  font-weight: 600;
}
.items { margin: 0; padding-left: 1.1rem; color: var(--timber-ink); font-size: 0.92rem; font-weight: 700; }
.more-items { color: var(--timber-muted); }
.link-btn { display:inline-flex; align-items:center; border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:.7rem; padding:.65rem .85rem; font-weight:700; text-decoration:none; min-height:2.85rem; }
.empty { color:var(--timber-muted); }
.ok { color: var(--timber-success); font-size: .88rem; margin: 0 0 .75rem; font-weight: 600; }
.err { color: var(--timber-danger); font-size: .88rem; margin: 0 0 .75rem; font-weight: 600; }

.modal-bg {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(10, 16, 14, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.modal {
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 1.15rem 1.15rem 0.85rem 0.85rem;
  padding: 1.35rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
  width: min(24rem, 100%);
  max-height: min(85vh, 36rem);
  overflow: auto;
  display: grid;
  gap: 0.85rem;
  border: 1px solid var(--timber-line);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.01em;
  font-size: 1.35rem;
}
.modal-hint {
  margin: -0.35rem 0 0;
  color: var(--timber-muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.modal label { display: grid; gap: 0.35rem; font-size: 0.9rem; font-weight: 600; }
.modal .check {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
  cursor: pointer;
}
.modal .check input {
  width: 1.15rem;
  height: 1.15rem;
  min-height: 0;
  accent-color: var(--timber-primary);
}
.pay-sum {
  display: grid;
  gap: 0.4rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  background: var(--timber-surface);
  border: 1px solid var(--timber-line);
}
.pay-sum > div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}
.pay-sum span { color: var(--timber-muted); }
.pay-total {
  margin-top: 0.2rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--timber-line);
  font-size: 1.05rem !important;
}
.pay-total strong {
  font-size: 1.35rem;
  color: var(--timber-primary);
}
.modal input,
.modal select {
  min-height: 3rem;
  padding: 0.65rem 0.8rem;
  border-radius: 0.75rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.modal select { font-size: 1rem; font-weight: 600; }

.close-summary {
  display: grid;
  gap: 0.45rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  background: var(--timber-surface);
  border: 1px solid var(--timber-line);
}
.close-summary > div {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.close-summary span { color: var(--timber-muted); }
.close-summary strong { font-variant-numeric: tabular-nums; }

.diff {
  margin: 0;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-size: 0.95rem;
}
.diff.ok { color: var(--timber-success); }
.diff.bad { color: var(--timber-warning); }

.modal-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 0.55rem;
  margin-top: 0.25rem;
}
.modal-actions button {
  min-height: 3.15rem;
  border-radius: 0.85rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
}
.modal-actions .btn-primary {
  border: none;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.modal-actions .btn-danger {
  border: none;
}

.more-items { list-style: none; margin-left: -1.1rem; color: var(--timber-muted); font-style: italic; }

@media (max-width: 767.98px) {
  .orders-page { padding: 0.55rem; }
  .caja-head { align-items: flex-start; }
  .caja-nums { grid-template-columns: 1fr; }
  .filters button { min-height: 2.35rem; padding: 0.35rem 0.7rem; font-size: 0.78rem; }
}

@media (min-width: 768px) and (max-width: 1099.98px) {
  .orders-page { padding: 0.75rem; }
  .list { gap: 0.65rem; }
}

@media (min-width: 1100px) {
  .orders-page { padding: 0.85rem 1rem; }
  .modal-bg {
    align-items: center;
    padding: 1.5rem;
  }
  .modal {
    border-radius: 1.15rem;
    padding: 1.4rem;
  }
}

@media (min-width: 720px) and (max-width: 1099.98px) {
  .modal-bg {
    align-items: center;
    padding: 1.5rem;
  }
  .modal {
    border-radius: 1.15rem;
    padding: 1.4rem;
  }
}

</style>
