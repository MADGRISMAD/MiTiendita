<template>
  <AppShell>
    <div class="caja">
      <header class="caja-head">
        <div class="caja-title">
          <h1>Caja</h1>
          <p>
            <span class="state-dot" :class="cashOpen ? 'on' : 'off'" aria-hidden="true"></span>
            <span>{{ headline }}<span v-if="cashOpen && session?.openedBy" class="hide-mobile"> · abrió {{ session.openedBy }}</span></span>
          </p>
        </div>
        <button v-if="cashOpen" type="button" class="btn primary" @click="prepClose">
          <PosIcon name="lock" :size="18" /> Hacer corte
        </button>
      </header>

      <p v-if="longOpen" class="banner warn">
        <PosIcon name="alert" :size="18" />
        La caja lleva abierta más de 12 horas y la venta está bloqueada. Haz el corte para seguir cobrando.
      </p>
      <!-- Ventas hechas sin internet que aún no llegan al servidor -->
      <section v-if="deviceSales.length" class="device" aria-labelledby="device-title">
        <div class="device-head">
          <div>
            <h2 id="device-title"><PosIcon name="alert" :size="18" /> Ventas de este dispositivo sin subir</h2>
            <p>{{ deviceSummary }}</p>
          </div>
          <button type="button" class="btn sm" :disabled="deviceBusy || !offlineStore.online" @click="retryDevice()">
            <PosIcon name="history" :size="16" />
            {{ deviceBusy ? 'Subiendo…' : offlineStore.online ? 'Reintentar todas' : 'Sin internet' }}
          </button>
        </div>
        <ul class="device-list">
          <li v-for="s in deviceSales" :key="s.clientSaleId" :class="s.status">
            <span class="device-when">{{ when(s.payload?.soldAt || s.createdAt) }}</span>
            <div class="device-main">
              <strong>#{{ folio({ id: s.clientSaleId }) }} · {{ money(s.payload?.total) }}</strong>
              <small>{{ itemsSummary(s.payload) }}</small>
              <small v-if="s.status === 'failed'" class="device-err">El servidor la rechazó: {{ s.error }}</small>
              <small v-else-if="s.lastError" class="device-wait">Se reintenta sola · {{ s.lastError }}</small>
            </div>
            <span class="pill" :class="s.status === 'failed' ? 'bad' : 'warn'">{{ s.status === 'failed' ? 'Con error' : 'Por subir' }}</span>
            <div class="device-acts">
              <a class="btn sm" :href="`/print/offline/${s.clientSaleId}`" target="_blank" rel="noopener">Ver ticket</a>
              <button
                v-if="s.status === 'failed'"
                type="button"
                class="btn sm"
                :disabled="deviceBusy || !offlineStore.online"
                @click="retryDevice([s.clientSaleId])"
              >
                Reintentar
              </button>
            </div>
          </li>
        </ul>
        <p class="device-note">
          Se quedan guardadas en este dispositivo hasta llegar al servidor; nunca se borran solas.
          Las que están por subir entran al corte cuando se suban.
        </p>
      </section>
      <p v-if="cashMsg" class="banner ok">
        <PosIcon name="check" :size="18" /> {{ cashMsg }}
      </p>
      <p v-if="cashErr" class="banner err">
        <PosIcon name="alert" :size="18" /> {{ cashErr }}
      </p>

      <!-- Caja cerrada -->
      <section v-if="loaded && !cashOpen" class="open-card">
        <span class="open-ico"><PosIcon name="cash" :size="28" /></span>
        <div class="open-copy">
          <h2>La caja está cerrada</h2>
          <p>Cuenta el efectivo con el que empiezas (el fondo para dar cambio) y abre el turno.</p>
        </div>
        <form class="open-form" @submit.prevent="openCash">
          <label class="field">
            <span>Fondo inicial</span>
            <input
              v-model.number="openingFloat"
              v-select-on-focus
              class="inp big num"
              type="number"
              min="0"
              step="1"
              inputmode="decimal"
              placeholder="0"
            />
          </label>
          <div class="presets">
            <button
              v-for="v in [0, 200, 500, 1000]"
              :key="v"
              type="button"
              :class="{ on: Number(openingFloat || 0) === v }"
              @click="openingFloat = v"
            >
              {{ moneyShort(v) }}
            </button>
          </div>
          <button type="submit" class="btn primary block" :disabled="cashBusy">
            {{ cashBusy ? 'Abriendo…' : 'Abrir caja' }}
          </button>
        </form>
      </section>

      <!-- Turno abierto -->
      <section v-else-if="cashOpen" class="kpis">
        <div class="kpi main">
          <span>Vendido en el turno</span>
          <strong>{{ money(totals.total) }}</strong>
          <small>{{ shiftPaid.length }} {{ shiftPaid.length === 1 ? 'ticket' : 'tickets' }} · promedio {{ money(avgTicket) }}</small>
        </div>
        <div class="kpi">
          <span><PosIcon name="cash" :size="16" /> Efectivo</span>
          <strong>{{ money(totals.cash) }}</strong>
        </div>
        <div class="kpi">
          <span><PosIcon name="card" :size="16" /> Tarjeta</span>
          <strong>{{ money(totals.card) }}</strong>
        </div>
        <div class="kpi">
          <span><PosIcon name="transfer" :size="16" /> Transferencia</span>
          <strong>{{ money(totals.transfer) }}</strong>
        </div>
        <div v-if="totals.other" class="kpi">
          <span>Otro</span>
          <strong>{{ money(totals.other) }}</strong>
        </div>
        <div class="kpi drawer">
          <span>Debe haber en el cajón</span>
          <strong>{{ money(expectedCash) }}</strong>
          <small>
            Fondo {{ money(session?.openingFloat) }} + efectivo
            <template v-if="Number(session?.cashRefunds)"> − devoluciones {{ money(session.cashRefunds) }}</template>
          </small>
        </div>
      </section>

      <!-- Ventas -->
      <section class="sales">
        <div class="sales-tools">
          <div class="tabs" role="tablist">
            <button
              v-for="t in tabs"
              :key="t.id"
              type="button"
              role="tab"
              :aria-selected="tab === t.id"
              :class="{ on: tab === t.id }"
              @click="tab = t.id"
            >
              {{ t.label }}<em v-if="t.count != null">{{ t.count }}</em>
            </button>
          </div>
          <div class="search">
            <PosIcon name="search" :size="18" class="search-ico" />
            <input
              v-model="search"
              type="search"
              class="inp"
              placeholder="Folio, producto o importe…"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="sales-list">
          <div
            v-for="o in visibleSales"
            :key="o.id"
            class="sale"
            :class="{ open: expanded === o.id, void: isVoid(o) }"
          >
            <button type="button" class="sale-main" :aria-expanded="expanded === o.id" @click="toggle(o.id)">
              <span class="sale-when">
                <strong>{{ when(o.createdAt) }}</strong>
                <small>#{{ folio(o) }}</small>
              </span>
              <span class="sale-items">
                <span>{{ itemsSummary(o) }}</span>
                <small>{{ productCount(o) }}<template v-if="o.invoice?.status === 'requested'"> · pide factura</template></small>
              </span>
              <span v-if="o.paymentStatus === 'paid' || o.paymentStatus === 'refunded'" class="pill paid-with hide-mobile">
                {{ methodLabel(o.paymentMethod) }}
              </span>
              <span class="sale-total">
                <strong>{{ money(o.total) }}</strong>
                <span class="pill" :class="saleTone(o)">{{ saleLabel(o) }}</span>
              </span>
              <PosIcon name="chevron" :size="18" class="sale-chev" />
            </button>

            <div v-if="expanded === o.id" class="sale-detail">
              <ul class="lines">
                <li v-for="(item, i) in o.items || []" :key="i">
                  <span class="q">{{ formatQty(item.quantity) }} ×</span>
                  <span class="n">{{ item.name }}</span>
                  <span class="a">{{ money(lineGross(o, item)) }}</span>
                </li>
              </ul>
              <dl class="detail-meta">
                <div v-if="o.discountAmount"><dt>Descuento {{ o.discountPercent }}%</dt><dd>−{{ money(o.discountAmount) }}</dd></div>
                <div v-if="o.paymentMethod"><dt>Pago</dt><dd>{{ methodLabel(o.paymentMethod) }}</dd></div>
                <div v-if="o.paymentMethod === 'split'"><dt>Con tarjeta</dt><dd>{{ money(o.cardAmount) }}</dd></div>
                <div v-if="Number(o.cashReceived)"><dt>Recibido</dt><dd>{{ money(o.cashReceived) }}</dd></div>
                <div v-if="Number(o.change)"><dt>Cambio</dt><dd>{{ money(o.change) }}</dd></div>
                <div v-if="o.invoice?.status"><dt>Factura</dt><dd>{{ o.invoice.status === 'issued' ? 'Emitida' : 'Solicitada' }}<template v-if="o.invoice.legalName"> · {{ o.invoice.legalName }}</template><template v-if="o.invoice.rfc"> ({{ o.invoice.rfc }})</template></dd></div>
              </dl>
              <div class="sale-acts">
                <button v-if="canCharge(o)" type="button" class="btn primary" @click="openPay(o)">Cobrar</button>
                <a class="btn" :href="`/print/order/${o.id}?mode=receipt`" target="_blank" rel="noopener">
                  <PosIcon name="printer" :size="18" /> Reimprimir
                </a>
                <button v-if="o.invoice?.status === 'requested'" type="button" class="btn" @click="markIssued(o)">
                  <PosIcon name="receipt" :size="18" /> Ya la facturé
                </button>
                <button v-if="canReturn(o)" type="button" class="btn danger-ghost" @click="askVoid(o)">
                  <PosIcon name="undo" :size="18" /> Devolver
                </button>
                <button v-else-if="canCancel(o)" type="button" class="btn danger-ghost" @click="askVoid(o)">
                  Cancelar venta
                </button>
              </div>
            </div>
          </div>

          <button v-if="filteredSales.length > visibleSales.length" type="button" class="btn more" @click="limit += 50">
            Ver más ({{ filteredSales.length - visibleSales.length }})
          </button>

          <div v-if="loaded && !filteredSales.length" class="empty">
            <PosIcon name="receipt" :size="26" class="empty-ico" />
            <p><strong>{{ emptyTitle }}</strong></p>
            <router-link v-if="tab === 'shift' && !search" to="/pos" class="btn">Ir a vender</router-link>
          </div>
          <p v-if="!loaded" class="empty">Cargando…</p>
        </div>
      </section>

      <!-- Corte de caja -->
      <Teleport to="body">
        <div v-if="showClose" class="dlg-bg">
          <form class="dlg corte" role="dialog" aria-labelledby="corte-title" @submit.prevent="closeCash">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="lock" /></span>
              <div>
                <h3 id="corte-title">Corte de caja</h3>
                <p>Cuenta el efectivo del cajón. Tarjeta y transferencia no van en el cajón.</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" :disabled="cashBusy" @click="showClose = false">
                <PosIcon name="x" />
              </button>
            </header>

            <dl class="sum">
              <div><dt>Fondo inicial</dt><dd>{{ money(session?.openingFloat) }}</dd></div>
              <div><dt>Ventas en efectivo</dt><dd>+ {{ money(totals.cash) }}</dd></div>
              <div v-if="Number(session?.cashRefunds)"><dt>Devoluciones en efectivo</dt><dd>− {{ money(session.cashRefunds) }}</dd></div>
              <div class="sum-total"><dt>Debe haber</dt><dd>{{ money(expectedCash) }}</dd></div>
              <div class="sum-info"><dt>Tarjeta · transferencia · otro</dt><dd>{{ money(totals.card) }} · {{ money(totals.transfer) }} · {{ money(totals.other) }}</dd></div>
            </dl>

            <div class="seg" role="radiogroup" aria-label="Cómo contar">
              <button type="button" :class="{ on: countMode === 'bills' }" @click="countMode = 'bills'">Por billetes y monedas</button>
              <button type="button" :class="{ on: countMode === 'total' }" @click="countMode = 'total'">Escribir el total</button>
            </div>

            <div v-if="countMode === 'bills'" class="bills">
              <label v-for="d in DENOMS" :key="d" class="bill-row">
                <span class="bill-face" :class="d >= 20 && d !== 20 ? 'note' : d === 20 ? 'both' : 'coin'">{{ moneyShort(d) }}</span>
                <span class="bill-x">×</span>
                <input
                  v-model.number="denoms[d]"
                  v-select-on-focus
                  class="inp num"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  placeholder="0"
                  :aria-label="`Cantidad de ${moneyShort(d)}`"
                />
                <span class="bill-sum">{{ money(d * (Number(denoms[d]) || 0)) }}</span>
              </label>
            </div>
            <label v-else class="field">
              <span>Efectivo contado</span>
              <input
                v-model.number="countedCash"
                v-select-on-focus
                class="inp big num"
                type="number"
                min="0"
                step="0.5"
                inputmode="decimal"
              />
            </label>

            <div class="count-box" :class="diffTone">
              <div>
                <span>Contaste</span>
                <strong>{{ money(counted) }}</strong>
              </div>
              <div>
                <span>{{ diffLabel }}</span>
                <strong>{{ difference === 0 ? '✓' : money(Math.abs(difference)) }}</strong>
              </div>
            </div>

            <label class="field">
              <span>Notas <em>(opcional: retiros, gastos pagados con caja, etc.)</em></span>
              <input v-model="closeNotes" class="inp" maxlength="200" placeholder="Ej. Pagué $150 al repartidor del gas" />
            </label>

            <div class="dlg-acts">
              <button type="button" class="btn" :disabled="cashBusy" @click="showClose = false">Cancelar</button>
              <button type="submit" class="btn primary" :disabled="cashBusy">
                {{ cashBusy ? 'Cerrando…' : 'Cerrar turno e imprimir' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Cobrar venta pendiente -->
      <Teleport to="body">
        <div v-if="payOrder" class="dlg-bg">
          <div class="dlg" role="dialog" aria-labelledby="pay-title">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="cash" /></span>
              <div>
                <h3 id="pay-title">Cobrar venta #{{ folio(payOrder) }}</h3>
                <p>{{ itemsSummary(payOrder) }}</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" :disabled="payBusy" @click="payOrder = null">
                <PosIcon name="x" />
              </button>
            </header>
            <div class="pay-total">
              <span>A cobrar</span>
              <strong>{{ money(payTotal) }}</strong>
              <small v-if="cardExtraAmount">Incluye IVA extra de tarjeta {{ money(cardExtraAmount) }}</small>
            </div>
            <div class="methods">
              <button
                v-for="m in payMethods"
                :key="m.id"
                type="button"
                class="method"
                :class="{ on: payMethod === m.id }"
                @click="payMethod = m.id"
              >
                <PosIcon :name="m.icon" />{{ m.label }}
              </button>
            </div>
            <label v-if="payMethod === 'card'" class="check">
              <input v-model="cardExtraIva" type="checkbox" />
              Agregar IVA extra en tarjeta ({{ Math.round(TAX_RATE * 100) }}%)
            </label>
            <div class="dlg-acts">
              <button type="button" class="btn" :disabled="payBusy" @click="payOrder = null">Cancelar</button>
              <button type="button" class="btn primary" :disabled="payBusy" @click="confirmPay">
                {{ payBusy ? 'Cobrando…' : 'Cobrar' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Devolver / cancelar -->
      <Teleport to="body">
        <div v-if="voidOrder" class="dlg-bg">
          <div class="dlg" role="dialog" aria-labelledby="void-title">
            <header class="dlg-head">
              <span class="dlg-ico warn"><PosIcon name="undo" /></span>
              <div>
                <h3 id="void-title">
                  {{ voidOrder.paymentStatus === 'paid' ? `Devolver venta #${folio(voidOrder)}` : `Cancelar venta #${folio(voidOrder)}` }}
                </h3>
                <p v-if="voidOrder.paymentStatus === 'paid'">
                  Se devuelve todo el ticket: {{ money(voidOrder.total) }}
                  <template v-if="voidOrder.paymentMethod === 'cash' || voidOrder.paymentMethod === 'split'"> (sale del cajón)</template><template v-if="voidOrder.inventoryApplied"> y los productos regresan al inventario</template>.
                </p>
                <p v-else>Esta venta no se cobró; solo se quita de la lista.</p>
              </div>
            </header>
            <div class="dlg-acts">
              <button type="button" class="btn" :disabled="voidBusy" @click="voidOrder = null">Volver</button>
              <button type="button" class="btn danger" :disabled="voidBusy" @click="confirmVoid">
                {{ voidBusy ? 'Guardando…' : voidOrder.paymentStatus === 'paid' ? 'Devolver' : 'Cancelar venta' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";
import { venueStore } from "../venueStore";
import { offlineStore } from "../offlineFlags";
import { flushOfflineSales, listDeviceSales, retrySales } from "../offlineSync";
import { isNetworkError } from "../net";
import { lineBreakdown, rateOf } from "../tax";

const vSelectOnFocus = {
  mounted(el) {
    el.addEventListener("focus", () => setTimeout(() => el.select?.(), 0));
  },
};

// Billetes y monedas de México, de mayor a menor
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];

const router = useRouter();
const orders = ref([]);
const loaded = ref(false);
const tab = ref("shift");
const search = ref("");
const expanded = ref("");
const limit = ref(50);
const now = ref(Date.now());
let clock = null;

const cashOpen = ref(false);
const session = ref(null);
const sessionOrders = ref([]);
const totals = ref({ cash: 0, card: 0, transfer: 0, other: 0, total: 0 });
const openingFloat = ref("");
const cashBusy = ref(false);
const cashMsg = ref("");
const cashErr = ref("");

const showClose = ref(false);
const countMode = ref("bills");
const denoms = reactive(Object.fromEntries(DENOMS.map((d) => [d, ""])));
const countedCash = ref(0);
const closeNotes = ref("");

const payOrder = ref(null);
const payMethod = ref("cash");
const payBusy = ref(false);
const cardExtraIva = ref(false);
const payMethods = [
  { id: "cash", label: "Efectivo", icon: "cash" },
  { id: "card", label: "Tarjeta", icon: "card" },
  { id: "transfer", label: "Transferencia", icon: "transfer" },
  { id: "other", label: "Otro", icon: "receipt" },
];

const voidOrder = ref(null);
const voidBusy = ref(false);

const TAX_RATE = computed(() => rateOf(venueStore.taxRate));

const cardExtraAmount = computed(() => {
  if (!payOrder.value || payMethod.value !== "card" || !cardExtraIva.value) return 0;
  return round2(Number(payOrder.value.total || 0) * TAX_RATE.value);
});
const payTotal = computed(() => round2(Number(payOrder.value?.total || 0) + cardExtraAmount.value));

// —— Turno ——
const openedAt = computed(() => {
  const d = session.value?.openedAt || session.value?.createdAt;
  return d ? new Date(d) : null;
});
const hoursOpen = computed(() => (openedAt.value ? (now.value - openedAt.value.getTime()) / 3600000 : 0));
const longOpen = computed(() => cashOpen.value && hoursOpen.value >= 12);
const headline = computed(() => {
  if (!loaded.value) return "Cargando…";
  if (!cashOpen.value) return "Cerrada";
  const h = Math.floor(hoursOpen.value);
  const m = Math.floor((hoursOpen.value - h) * 60);
  const span = h ? `${h} h ${m} min` : `${m} min`;
  return `Abierta desde las ${time(openedAt.value)} · ${span}`;
});
const shiftPaid = computed(() => sessionOrders.value.filter((o) => o.paymentStatus === "paid"));
const avgTicket = computed(() => (shiftPaid.value.length ? Number(totals.value.total || 0) / shiftPaid.value.length : 0));
const expectedCash = computed(() =>
  round2(Number(session.value?.openingFloat || 0) + Number(totals.value.cash || 0) - Number(session.value?.cashRefunds || 0))
);

// —— Corte ——
const counted = computed(() => {
  if (countMode.value === "total") return round2(Number(countedCash.value) || 0);
  return round2(DENOMS.reduce((sum, d) => sum + d * (Number(denoms[d]) || 0), 0));
});
const difference = computed(() => round2(counted.value - expectedCash.value));
const diffTone = computed(() => (difference.value === 0 ? "ok" : difference.value > 0 ? "over" : "short"));
const diffLabel = computed(() => (difference.value === 0 ? "Cuadra" : difference.value > 0 ? "Sobran" : "Faltan"));

// —— Ventas ——
const unpaid = computed(() => orders.value.filter((o) => o.paymentStatus === "unpaid" && o.status !== "cancelled"));
const invoices = computed(() => orders.value.filter((o) => o.invoice?.status === "requested" || o.invoice?.status === "issued"));
const pendingInvoices = computed(() => invoices.value.filter((o) => o.invoice?.status === "requested").length);
const tabs = computed(() => {
  const list = [];
  if (cashOpen.value) list.push({ id: "shift", label: "Este turno", count: sessionOrders.value.length });
  if (unpaid.value.length) list.push({ id: "unpaid", label: "Por cobrar", count: unpaid.value.length });
  list.push({ id: "invoices", label: "Facturas", count: pendingInvoices.value || null });
  list.push({ id: "all", label: "Historial", count: null });
  return list;
});
watch(tabs, (list) => {
  // Antes de cargar no se sabe si hay turno: no cambies de pestaña todavía
  if (loaded.value && !list.some((t) => t.id === tab.value)) tab.value = list[0].id;
});
watch([tab, search], () => {
  limit.value = 50;
  expanded.value = "";
});

function fold(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
const baseSales = computed(() => {
  if (tab.value === "shift") return sessionOrders.value;
  if (tab.value === "unpaid") return unpaid.value;
  if (tab.value === "invoices") return invoices.value;
  return orders.value;
});
const filteredSales = computed(() => {
  const tokens = fold(search.value).split(/\s+/).filter(Boolean);
  const list = [...baseSales.value].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!tokens.length) return list;
  return list.filter((o) => {
    const hay = fold(
      [folio(o), o.id, Number(o.total || 0).toFixed(2), ...(o.items || []).map((i) => i.name), o.invoice?.legalName, o.invoice?.rfc].join(" ")
    );
    return tokens.every((t) => hay.includes(t));
  });
});
const visibleSales = computed(() => filteredSales.value.slice(0, limit.value));
const emptyTitle = computed(() => {
  if (search.value.trim()) return "Nada coincide con la búsqueda.";
  if (tab.value === "shift") return "Todavía no hay ventas en este turno.";
  if (tab.value === "invoices") return "Nadie ha pedido factura.";
  return "No hay ventas.";
});

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function money(n) {
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function moneyShort(n) {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
function formatQty(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}
function time(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function when(d) {
  if (!d) return "";
  const date = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return time(date);
  return date.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function folio(o) {
  return String(o?.id || "").slice(-6).toUpperCase();
}
// Cuenta renglones: con kilos o metros sumar cantidades da cosas como "3.25 art."
function productCount(o) {
  const n = (o?.items || []).length;
  return `${n} ${n === 1 ? "producto" : "productos"}`;
}
function itemsSummary(o) {
  const items = o?.items || [];
  if (!items.length) return "Sin productos";
  const names = items.slice(0, 2).map((i) => i.name).join(", ");
  return items.length > 2 ? `${names} y ${items.length - 2} más` : names;
}
function lineGross(o, item) {
  return lineBreakdown(item.price, item.quantity, item.priceIncludesTax, rateOf(o.taxRate, TAX_RATE.value)).gross;
}
function methodLabel(m) {
  return { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", split: "Mixto", other: "Otro" }[m] || "—";
}
function isVoid(o) {
  return o.paymentStatus === "refunded" || o.status === "cancelled";
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
  if (o.paymentStatus === "paid") return "Pagada";
  return "Por cobrar";
}
function saleTone(o) {
  if (isVoid(o)) return "bad";
  return o.paymentStatus === "paid" ? "good" : "warn";
}
function toggle(id) {
  expanded.value = expanded.value === id ? "" : id;
}
function errText(e, fallback) {
  const data = e?.response?.data;
  if (typeof data === "string" && data) return data;
  return data?.message || fallback;
}
function replaceOrder(updated) {
  if (!updated?.id) return;
  for (const list of [orders, sessionOrders]) {
    const i = list.value.findIndex((o) => o.id === updated.id);
    if (i >= 0) list.value[i] = updated;
  }
}

async function loadCash() {
  try {
    const data = await apiService.getCashSession();
    cashOpen.value = Boolean(data.open);
    session.value = data.session || null;
    sessionOrders.value = Array.isArray(data.orders) ? data.orders : [];
    totals.value = data.totals || { cash: 0, card: 0, transfer: 0, other: 0, total: 0 };
  } catch (e) {
    cashErr.value = isNetworkError(e)
      ? "Sin internet: aquí solo ves las ventas de este dispositivo. El turno y el corte necesitan conexión."
      : errText(e, "No se pudo consultar la caja.");
  }
}

async function load() {
  await flushOfflineSales();
  try {
    const list = await apiService.getOrders();
    orders.value = Array.isArray(list) ? list : [];
  } catch {
    orders.value = [];
  }
  await loadCash();
  tab.value = cashOpen.value ? "shift" : unpaid.value.length ? "unpaid" : "all";
  loaded.value = true;
}

async function openCash() {
  cashBusy.value = true;
  cashErr.value = "";
  cashMsg.value = "";
  try {
    await apiService.openCashSession(Number(openingFloat.value || 0));
    cashMsg.value = "Caja abierta. ¡Buen turno!";
    openingFloat.value = "";
    await loadCash();
    tab.value = "shift";
  } catch (e) {
    cashErr.value = errText(e, "No se pudo abrir la caja.");
  } finally {
    cashBusy.value = false;
  }
}

// ---------- Ventas de este dispositivo sin subir ----------
const deviceSales = ref([]);
const deviceBusy = ref(false);
const deviceSummary = computed(() => {
  const pend = deviceSales.value.filter((s) => s.status === "pending").length;
  const bad = deviceSales.value.length - pend;
  const parts = [];
  if (pend) parts.push(`${pend} por subir`);
  if (bad) parts.push(`${bad} con error`);
  const total = deviceSales.value.reduce((t, s) => t + Number(s.payload?.total || 0), 0);
  return `${parts.join(" · ")} · ${money(total)}${offlineStore.online ? "" : " · esperando internet"}`;
});
async function loadDeviceSales() {
  deviceSales.value = await listDeviceSales();
}
async function retryDevice(ids = null) {
  deviceBusy.value = true;
  cashErr.value = "";
  try {
    const before = deviceSales.value.length;
    await retrySales(ids);
    await loadDeviceSales();
    const sent = before - deviceSales.value.length;
    if (sent > 0) {
      cashMsg.value = `${sent} ${sent === 1 ? "venta subida" : "ventas subidas"} al servidor.`;
      await load();
    } else if (deviceSales.value.some((s) => s.status === "failed")) {
      cashErr.value = "El servidor sigue rechazando la venta. Revisa el motivo o escríbenos a soporte.";
    }
  } finally {
    deviceBusy.value = false;
  }
}
watch(
  () => [offlineStore.pending, offlineStore.failed, offlineStore.syncing],
  async () => {
    if (offlineStore.syncing) return;
    const before = deviceSales.value.length;
    await loadDeviceSales();
    // Se subieron ventas mientras se veía Caja: refresca la lista y los totales del turno
    if (deviceSales.value.length < before && !deviceBusy.value) load();
  }
);

function prepClose() {
  if (offlineStore.pending > 0) {
    cashErr.value = `Hay ${offlineStore.pending} ${offlineStore.pending === 1 ? "venta" : "ventas"} de este dispositivo por subir. Espera a que vuelva internet antes del corte.`;
    return;
  }
  if (offlineStore.failed > 0 && !window.confirm(`Hay ${offlineStore.failed} ${offlineStore.failed === 1 ? "venta" : "ventas"} de este dispositivo con error que no entran en el corte. ¿Hacer el corte de todos modos?`)) {
    return;
  }
  cashErr.value = "";
  for (const d of DENOMS) denoms[d] = "";
  countedCash.value = expectedCash.value;
  countMode.value = "bills";
  closeNotes.value = "";
  showClose.value = true;
}

async function closeCash() {
  if (offlineStore.pending > 0) {
    cashErr.value = `Hay ${offlineStore.pending} ${offlineStore.pending === 1 ? "venta" : "ventas"} de este dispositivo por subir. No cierres caja todavía.`;
    showClose.value = false;
    return;
  }
  if (countMode.value === "bills" && counted.value === 0 && expectedCash.value > 0) {
    if (!window.confirm("No contaste nada en el cajón. ¿Cerrar con $0?")) return;
  } else if (difference.value !== 0) {
    const what = difference.value > 0 ? "sobran" : "faltan";
    if (!window.confirm(`El corte no cuadra: ${what} ${money(Math.abs(difference.value))}. ¿Cerrar así?`)) return;
  }
  cashBusy.value = true;
  cashErr.value = "";
  cashMsg.value = "";
  try {
    const res = await apiService.closeCashSession(counted.value, String(closeNotes.value || "").trim());
    showClose.value = false;
    const diff = Number(res.session?.difference || 0);
    cashMsg.value = diff === 0 ? "Turno cerrado. El corte cuadró." : `Turno cerrado. Diferencia: ${money(diff)}.`;
    if (res.session?.id) {
      router.push(`/print/cash/${res.session.id}?autoprint=1`);
      return;
    }
    await load();
  } catch (e) {
    cashErr.value = errText(e, "No se pudo cerrar la caja.");
  } finally {
    cashBusy.value = false;
  }
}

function openPay(o) {
  if (!cashOpen.value) {
    cashErr.value = "Abre la caja antes de cobrar.";
    return;
  }
  payOrder.value = o;
  payMethod.value = "cash";
  cardExtraIva.value = false;
}

async function confirmPay() {
  if (!payOrder.value || payBusy.value) return;
  payBusy.value = true;
  try {
    const updated = await apiService.payOrder(payOrder.value.id, payMethod.value, {
      cardExtraIva: payMethod.value === "card" && cardExtraIva.value,
    });
    replaceOrder(updated);
    const id = payOrder.value.id;
    payOrder.value = null;
    await loadCash();
    window.open(`/print/order/${id}?mode=receipt&autoprint=1`, "_blank", "noopener");
  } catch (e) {
    cashErr.value = errText(e, "No se pudo cobrar.");
  } finally {
    payBusy.value = false;
  }
}

function askVoid(o) {
  cashErr.value = "";
  voidOrder.value = o;
}

async function confirmVoid() {
  if (!voidOrder.value || voidBusy.value) return;
  voidBusy.value = true;
  cashErr.value = "";
  cashMsg.value = "";
  const wasPaid = voidOrder.value.paymentStatus === "paid";
  try {
    const updated = await apiService.voidOrder(voidOrder.value.id);
    replaceOrder(updated);
    cashMsg.value = wasPaid ? `Venta #${folio(updated)} devuelta.` : `Venta #${folio(updated)} cancelada.`;
    voidOrder.value = null;
    await loadCash();
  } catch (e) {
    cashErr.value = errText(e, "No se pudo cancelar la venta.");
    voidOrder.value = null;
  } finally {
    voidBusy.value = false;
  }
}

async function markIssued(o) {
  try {
    replaceOrder(await apiService.markInvoiceIssued(o.id));
  } catch (e) {
    cashErr.value = errText(e, "No se pudo marcar la factura.");
  }
}

function onKey(e) {
  if (e.key !== "Escape") return;
  if (showClose.value && !cashBusy.value) showClose.value = false;
  else if (payOrder.value && !payBusy.value) payOrder.value = null;
  else if (voidOrder.value && !voidBusy.value) voidOrder.value = null;
}

onMounted(() => {
  load().finally(loadDeviceSales);
  clock = setInterval(() => {
    now.value = Date.now();
  }, 60000);
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  clearInterval(clock);
  window.removeEventListener("keydown", onKey);
});
</script>

<style scoped>
.caja {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  overflow: hidden;
}
.caja-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
}
.caja-title { min-width: 0; }
.caja-title h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.caja-title p {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.1rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.state-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.state-dot.on { background: var(--timber-success); box-shadow: 0 0 0 3px var(--timber-success-soft); }
.state-dot.off { background: var(--timber-muted); }

.banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.65rem 0.9rem;
  border-radius: 0.8rem;
  font-size: 0.88rem;
  font-weight: 700;
  flex-shrink: 0;
}
.banner svg { flex-shrink: 0; }
.banner.warn { background: var(--timber-warning-soft); color: var(--timber-ink); }
.banner.warn svg { color: var(--timber-warning); }
.banner.ok { background: var(--timber-success-soft); color: var(--timber-success); }
.banner.err { background: var(--timber-danger-soft); color: var(--timber-danger); }

/* Botones y campos */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.8rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.92rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: var(--timber-panel-elevated); }
.btn.primary { border-color: transparent; background: var(--timber-primary); color: var(--timber-on-primary); }
.btn.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--timber-primary) 88%, #000); }
.btn.danger { border-color: transparent; background: var(--timber-danger); color: #fff; }
.btn.danger-ghost { color: var(--timber-danger); }
.btn.block { width: 100%; min-height: 3.2rem; font-size: 1.02rem; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.inp {
  width: 100%;
  min-height: 2.75rem;
  padding: 0 0.8rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font: inherit;
  box-sizing: border-box;
}
.inp:focus {
  outline: none;
  border-color: var(--timber-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--timber-primary) 15%, transparent);
}
.inp.big { min-height: 3.5rem; font-size: 1.45rem; font-weight: 800; }
.inp.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}
.inp.num::-webkit-inner-spin-button,
.inp.num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.field { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.field em { font-style: normal; font-weight: 500; }
.presets { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.presets button {
  flex: 1 1 4rem;
  min-height: 2.5rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-weight: 700;
  cursor: pointer;
}
.presets button.on { border-color: var(--timber-primary); background: var(--timber-primary-soft); color: var(--timber-primary); }

/* Caja cerrada */
.open-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(16rem, 22rem);
  align-items: center;
  gap: 1rem 1.25rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid color-mix(in srgb, var(--timber-warning) 35%, var(--timber-line));
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
  flex-shrink: 0;
}
.open-ico {
  width: 3.4rem;
  height: 3.4rem;
  display: grid;
  place-items: center;
  border-radius: 1rem;
  background: var(--timber-warning-soft);
  color: var(--timber-warning);
}
.open-copy h2 { margin: 0; font-size: 1.15rem; font-weight: 800; }
.open-copy p { margin: 0.2rem 0 0; color: var(--timber-muted); font-size: 0.9rem; line-height: 1.4; }
.open-form { display: grid; gap: 0.55rem; }

/* Resumen del turno */
/* Ventas de este dispositivo sin subir */
.device {
  flex-shrink: 0;
  padding: 0.85rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--timber-warning) 45%, var(--timber-line));
  border-radius: 1rem;
  background: color-mix(in srgb, var(--timber-warning) 7%, var(--timber-panel));
}
.device-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.device-head h2 { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: 1rem; font-weight: 800; }
.device-head h2 svg { color: var(--timber-warning); }
.device-head p { margin: 0.15rem 0 0; font-size: 0.82rem; font-weight: 600; color: var(--timber-muted); }
.btn.sm { min-height: 2.3rem; padding: 0 0.75rem; font-size: 0.84rem; }
.device-list { list-style: none; margin: 0.6rem 0 0; padding: 0; max-height: 15rem; overflow-y: auto; }
.device-list li {
  display: grid;
  grid-template-columns: 4.6rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--timber-line);
}
.device-when { font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); font-variant-numeric: tabular-nums; }
.device-main { display: grid; min-width: 0; }
.device-main strong { font-variant-numeric: tabular-nums; }
.device-main small { overflow: hidden; font-size: 0.78rem; color: var(--timber-muted); text-overflow: ellipsis; white-space: nowrap; }
.device-main .device-err { color: var(--timber-danger); font-weight: 700; white-space: normal; }
.device-main .device-wait { white-space: normal; }
.device-acts { display: flex; gap: 0.35rem; }
.device-note { margin: 0.55rem 0 0; font-size: 0.78rem; color: var(--timber-muted); line-height: 1.4; }
@media (max-width: 767.98px) {
  .device-head { flex-wrap: wrap; }
  .device-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .device-when { grid-column: 1 / -1; }
  .device-acts { grid-column: 1 / -1; }
  .device-acts .btn { flex: 1; }
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.55rem;
  flex-shrink: 0;
}
.kpi {
  display: grid;
  align-content: start;
  gap: 0.15rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.kpi span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.kpi strong {
  font-size: 1.35rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.kpi small { font-size: 0.74rem; color: var(--timber-muted); line-height: 1.3; }
.kpi.main { grid-column: span 2; }
.kpi.main strong { font-size: 1.85rem; }
.kpi.drawer {
  border-color: color-mix(in srgb, var(--timber-success) 40%, var(--timber-line));
  background: color-mix(in srgb, var(--timber-success) 6%, var(--timber-panel));
}
.kpi.drawer strong { color: var(--timber-success); }

/* Ventas */
.sales {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
  overflow: hidden;
}
.sales-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid var(--timber-line);
  flex-shrink: 0;
}
.tabs { display: flex; gap: 0.35rem; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.35rem;
  padding: 0 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.tabs button.on { background: var(--timber-ink); color: var(--timber-panel); border-color: transparent; }
.tabs em { font-style: normal; font-size: 0.72rem; font-weight: 800; opacity: 0.7; }
.search { position: relative; flex: 0 1 18rem; min-width: 10rem; }
.search .inp { padding-left: 2.3rem; min-height: 2.4rem; }
.search-ico { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--timber-muted); pointer-events: none; }
.sales-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.4rem;
}
.sale { border-radius: 0.8rem; }
.sale + .sale { border-top: 1px solid var(--timber-line); }
.sale.open { background: var(--timber-panel-elevated); border-top-color: transparent; }
.sale.open + .sale { border-top-color: transparent; }
.sale-main {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.65rem 0.7rem;
  border: none;
  background: transparent;
  color: var(--timber-ink);
  text-align: left;
  cursor: pointer;
  border-radius: 0.8rem;
}
.sale-main:hover { background: var(--timber-panel-elevated); }
.sale.void .sale-items,
.sale.void .sale-total strong { opacity: 0.55; text-decoration: line-through; }
.sale-when { display: grid; width: 5.4rem; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sale-when strong { font-size: 0.92rem; white-space: nowrap; }
.sale-when small { font-size: 0.72rem; color: var(--timber-muted); font-family: ui-monospace, Menlo, Consolas, monospace; }
.sale-items { flex: 1 1 auto; min-width: 0; display: grid; gap: 0.1rem; }
.sale-items > span { font-weight: 700; font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sale-items small { font-size: 0.76rem; color: var(--timber-muted); }
.sale-total { display: grid; justify-items: end; gap: 0.2rem; }
.sale-total strong { font-size: 1.05rem; font-variant-numeric: tabular-nums; }
.sale-chev { color: var(--timber-muted); flex-shrink: 0; transition: transform 0.15s ease; }
.sale.open .sale-chev { transform: rotate(90deg); }
.pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
  background: var(--timber-surface);
  color: var(--timber-muted);
}
.pill.good { background: var(--timber-success-soft); color: var(--timber-success); }
.pill.warn { background: var(--timber-warning-soft); color: var(--timber-warning); }
.pill.bad { background: var(--timber-danger-soft); color: var(--timber-danger); }
.pill.paid-with { background: var(--timber-primary-soft); color: var(--timber-primary); }
.sale-detail { padding: 0 0.85rem 0.85rem 0.85rem; display: grid; gap: 0.7rem; }
.lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; font-size: 0.88rem; }
.lines li { display: flex; gap: 0.5rem; }
.lines .q { min-width: 3rem; color: var(--timber-muted); font-variant-numeric: tabular-nums; }
.lines .n { flex: 1; min-width: 0; }
.lines .a { font-weight: 700; font-variant-numeric: tabular-nums; }
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  margin: 0;
  padding-top: 0.55rem;
  border-top: 1px dashed var(--timber-line);
  font-size: 0.82rem;
}
.detail-meta div { display: flex; gap: 0.35rem; }
.detail-meta dt { color: var(--timber-muted); }
.detail-meta dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.sale-acts { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.sale-acts .btn { min-height: 2.5rem; font-size: 0.86rem; }
.more { display: flex; margin: 0.6rem auto; }
.empty {
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--timber-muted);
}
.empty p { margin: 0; }
.empty strong { color: var(--timber-ink); }
.empty-ico {
  box-sizing: content-box;
  padding: 0.8rem;
  border-radius: 1rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}

/* Diálogos */
.dlg-bg {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(10, 18, 32, 0.55);
  backdrop-filter: blur(3px);
}
.dlg {
  width: min(30rem, 100%);
  max-height: 94dvh;
  overflow-y: auto;
  display: grid;
  gap: 0.8rem;
  padding: 1.1rem 1.1rem calc(1.1rem + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--timber-line);
  border-radius: 1.25rem 1.25rem 0 0;
  background: var(--timber-panel);
  color: var(--timber-ink);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}
.dlg.corte { width: min(34rem, 100%); }
.dlg-head { display: flex; align-items: flex-start; gap: 0.75rem; }
.dlg-head > div { flex: 1; min-width: 0; }
.dlg-head h3 { margin: 0; font-size: 1.2rem; font-weight: 800; }
.dlg-head p { margin: 0.15rem 0 0; font-size: 0.86rem; color: var(--timber-muted); line-height: 1.4; }
.dlg-ico {
  width: 2.6rem;
  height: 2.6rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.8rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.dlg-ico.warn { background: var(--timber-danger-soft); color: var(--timber-danger); }
.dlg-x {
  width: 2.4rem;
  height: 2.4rem;
  min-height: 0;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 0.7rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  cursor: pointer;
}
.dlg-acts { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 0.5rem; }
.dlg-acts .btn { min-height: 3.1rem; font-size: 1rem; }
.sum {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0.75rem 0.9rem;
  border-radius: 0.85rem;
  background: var(--timber-surface);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}
.sum div { display: flex; justify-content: space-between; gap: 0.75rem; }
.sum dt { color: var(--timber-muted); }
.sum dd { margin: 0; font-weight: 700; }
.sum-total { padding-top: 0.35rem; border-top: 1px solid var(--timber-line); font-size: 1.05rem; }
.sum-total dt { color: var(--timber-ink); font-weight: 800; }
.sum-total dd { font-weight: 800; color: var(--timber-success); }
.sum-info { font-size: 0.78rem; }
.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 0.8rem;
  background: var(--timber-surface);
}
.seg button {
  min-height: 2.4rem;
  border: none;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--timber-muted);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.seg button.on { background: var(--timber-panel); color: var(--timber-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.bills { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 0.9rem; }
.bill-row {
  display: grid;
  grid-template-columns: 4.3rem auto minmax(0, 1fr);
  grid-template-areas: "face x inp" "sum sum sum";
  align-items: center;
  gap: 0.1rem 0.4rem;
}
.bill-face {
  grid-area: face;
  display: grid;
  place-items: center;
  min-height: 2.4rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.bill-face.note { background: color-mix(in srgb, var(--timber-success) 14%, var(--timber-panel)); color: var(--timber-success); }
.bill-face.both { background: color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel)); color: var(--timber-primary); }
.bill-face.coin { background: color-mix(in srgb, var(--timber-accent) 16%, var(--timber-panel)); color: color-mix(in srgb, var(--timber-accent) 70%, var(--timber-ink)); border-radius: 999px; }
.bill-x { grid-area: x; color: var(--timber-muted); font-weight: 700; }
.bill-row .inp { grid-area: inp; min-height: 2.4rem; }
.bill-sum { grid-area: sum; justify-self: end; font-size: 0.72rem; color: var(--timber-muted); font-variant-numeric: tabular-nums; }
.count-box {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.9rem;
  background: var(--timber-surface);
}
.count-box div { display: grid; gap: 0.1rem; }
.count-box div + div { justify-items: end; }
.count-box span { font-size: 0.76rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--timber-muted); }
.count-box strong { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
.count-box.ok { background: var(--timber-success-soft); }
.count-box.ok div + div strong { color: var(--timber-success); }
.count-box.short { background: var(--timber-danger-soft); }
.count-box.short div + div strong { color: var(--timber-danger); }
.count-box.over { background: var(--timber-warning-soft); }
.count-box.over div + div strong { color: var(--timber-warning); }
.pay-total {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  padding: 0.85rem;
  border-radius: 1rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
}
.pay-total span { font-size: 0.74rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.75; }
.pay-total strong { font-size: 2.4rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.pay-total small { font-size: 0.78rem; opacity: 0.75; }
.methods { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.4rem; }
.method {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 4rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.method.on { border-color: var(--timber-primary); background: color-mix(in srgb, var(--timber-primary) 9%, var(--timber-panel)); color: var(--timber-primary); }
.check { display: flex; align-items: center; gap: 0.55rem; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
.check input { width: 1.15rem; height: 1.15rem; min-height: 0; accent-color: var(--timber-primary); }

@media (min-width: 768px) {
  .dlg-bg { align-items: center; padding: 1rem; }
  .dlg { border-radius: 1.25rem; padding-bottom: 1.1rem; }
}

/* Celular */
@media (max-width: 767.98px) {
  .caja { overflow-y: auto; gap: 0.6rem; padding: 0.6rem 0.6rem 1.5rem; }
  .caja-head .btn { min-height: 2.6rem; padding: 0 0.85rem; }
  .caja-title p { font-size: 0.78rem; }
  .open-card { grid-template-columns: auto minmax(0, 1fr); padding: 1rem; }
  .open-form { grid-column: 1 / -1; }
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.45rem; }
  .kpi { padding: 0.6rem 0.7rem; }
  .kpi strong { font-size: 1.1rem; }
  .kpi.main strong { font-size: 1.55rem; }
  .sales { flex: none; overflow: visible; }
  .sales-tools { flex-direction: column; align-items: stretch; padding: 0.6rem; }
  .search { flex-basis: auto; }
  .sales-list { overflow: visible; }
  .sale-main { gap: 0.6rem; padding: 0.65rem 0.5rem; }
  .sale-when { width: 5.1rem; }
  .sale-when strong { font-size: 0.84rem; }
  .sale-chev { display: none; }
  .sale-acts .btn { flex: 1 1 auto; }
  .methods { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .method { flex-direction: row; min-height: 3.2rem; }
  .bills { grid-template-columns: 1fr; }
  .bill-row { grid-template-columns: 4.3rem auto minmax(0, 1fr) 5.5rem; grid-template-areas: "face x inp sum"; }
}
</style>
