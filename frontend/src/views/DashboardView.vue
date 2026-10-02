<template>
  <AppShell>
    <div class="rep">
      <header class="rep-head">
        <div class="rep-title">
          <h1>Resumen</h1>
          <p>{{ rangeText }}<span class="hide-mobile"> · {{ businessName }}</span></p>
        </div>
        <div class="rep-actions">
          <button type="button" class="btn hide-mobile" :disabled="!orders.length" @click="exportSales">
            <PosIcon name="receipt" :size="18" /> Exportar ventas
          </button>
          <router-link to="/pos" class="btn primary">Vender</router-link>
        </div>
      </header>

      <GettingStarted />

      <nav class="periods" aria-label="Periodo del reporte">
        <button
          v-for="p in PERIODS"
          :key="p.id"
          type="button"
          :class="{ on: period === p.id }"
          :aria-pressed="period === p.id"
          @click="setPeriod(p.id)"
        >
          {{ p.label }}
        </button>
      </nav>
      <div v-if="period === 'custom'" class="custom">
        <label class="field">
          <span>Desde</span>
          <input v-model="customFrom" class="inp" type="date" :max="customTo || todayKey" />
        </label>
        <label class="field">
          <span>Hasta</span>
          <input v-model="customTo" class="inp" type="date" :min="customFrom" :max="todayKey" />
        </label>
      </div>

      <!-- Lo que hay que atender -->
      <div class="attn">
        <router-link to="/orders" class="chip" :class="cashOpen ? 'good' : 'muted'">
          <span class="dot" aria-hidden="true"></span>
          <span v-if="cashOpen">Caja abierta<span v-if="cashSince" class="hide-mobile"> desde {{ cashSince }}</span> · turno {{ money(cashTotals.total) }}</span>
          <span v-else>Caja cerrada</span>
        </router-link>
        <router-link v-if="cur.unpaid" to="/orders" class="chip warn">
          <PosIcon name="clock" :size="15" /> {{ cur.unpaid }} por cobrar
        </router-link>
        <a v-if="lowStock.length" href="#rep-stock" class="chip warn" @click.prevent="jump('rep-stock')">
          <PosIcon name="box" :size="15" /> {{ lowStock.length }} con poco stock
        </a>
        <a v-if="expiring.length" href="#rep-expiry" class="chip bad" @click.prevent="jump('rep-expiry')">
          <PosIcon name="alert" :size="15" /> {{ expiring.length }} por caducar
        </a>
      </div>

      <p v-if="cashLong" class="banner warn">
        <PosIcon name="alert" :size="18" /> La caja lleva abierta más de 12 horas. Haz el corte para seguir cobrando.
      </p>
      <p v-if="err" class="banner err"><PosIcon name="alert" :size="18" /> {{ err }}</p>

      <!-- Cifra principal -->
      <section class="hero" :class="{ busy: loading }">
        <div class="hero-main">
          <span class="eyebrow">{{ heroLabel }}</span>
          <strong class="hero-amount">{{ money(cur.total) }}</strong>
          <p class="delta" :class="trend(cur.total, cmp.total)">
            <b>{{ deltaText(cur.total, cmp.total) }}</b>
            <span>{{ compareText }}: {{ money(cmp.total) }}</span>
          </p>
          <p class="hero-sub">
            IVA incluido {{ money(cur.tax) }}
            <template v-if="cur.cardFees"> · comisiones por tarjeta {{ money(cur.cardFees) }}</template>
            <template v-if="cur.voidCount"> · {{ cur.voidCount }} {{ cur.voidCount === 1 ? 'devuelta' : 'devueltas' }} por {{ money(cur.voidTotal) }}</template>
          </p>
        </div>
        <div class="hero-kpis">
          <div class="mini">
            <span>Tickets</span>
            <strong>{{ cur.count }}</strong>
            <small :class="trend(cur.count, cmp.count)">{{ deltaText(cur.count, cmp.count) }}</small>
          </div>
          <div class="mini">
            <span>Ticket promedio</span>
            <strong>{{ money(cur.avg) }}</strong>
            <small :class="trend(cur.avg, cmp.avg)">{{ deltaText(cur.avg, cmp.avg) }}</small>
          </div>
          <div class="mini">
            <span>Artículos</span>
            <strong>{{ qty(cur.articles) }}</strong>
            <small>{{ cur.count ? `${qty(cur.articles / cur.count, 1)} por ticket` : 'Sin ventas' }}</small>
          </div>
          <div v-if="isAdmin" class="mini profit">
            <span>Ganancia estimada</span>
            <strong>{{ profit.covered ? money(profit.amount) : '—' }}</strong>
            <small>{{ profitNote }}</small>
          </div>
          <div v-else class="mini">
            <span>Productos distintos</span>
            <strong>{{ products.length }}</strong>
            <small>vendidos {{ periodPhrase }}</small>
          </div>
        </div>
      </section>

      <div class="row wn">
        <!-- Ventas por hora o por día -->
        <section class="card" :class="{ busy: loading }">
          <div class="card-head">
            <div>
              <h2>{{ chartTitle }}</h2>
              <p class="readout">{{ readout }}</p>
            </div>
            <div v-if="hasPrevBars" class="legend">
              <span><i class="sw cur"></i>{{ curShort }}</span>
              <span><i class="sw prev"></i>{{ prevShort }}</span>
            </div>
          </div>
          <div class="chart" :class="{ dense: buckets.length > 16 }" @pointerleave="focusIdx = null">
            <button
              v-for="(b, i) in buckets"
              :key="b.key"
              type="button"
              class="col"
              :class="{ peak: i === peakIdx && b.amount > 0, on: i === focusIdx }"
              :aria-label="`${b.label}: ${money(b.amount)}`"
              @pointerenter="focusIdx = i"
              @focus="focusIdx = i"
              @click="focusIdx = i"
            >
              <span class="col-bars">
                <i v-if="hasPrevBars" class="ghost" :style="{ height: barH(b.prev) }"></i>
                <i class="bar" :style="{ height: barH(b.amount) }"></i>
              </span>
              <span class="col-lbl">
                <em v-if="b.top">{{ b.top }}</em>{{ b.showLabel ? b.short : '' }}
              </span>
            </button>
          </div>
        </section>

        <!-- Formas de pago -->
        <section class="card" :class="{ busy: loading }">
          <div class="card-head">
            <div>
              <h2>Formas de pago</h2>
              <p>{{ pay.splitCount ? `Incluye ${pay.splitCount} ${pay.splitCount === 1 ? 'pago mixto' : 'pagos mixtos'}` : 'Cómo te pagaron' }}</p>
            </div>
          </div>
          <template v-if="cur.total > 0">
            <div class="stack" aria-hidden="true">
              <i v-for="m in pay.rows" :key="m.id" :class="`m-${m.id}`" :style="{ width: `${m.pct}%` }"></i>
            </div>
            <ul class="pay-list">
              <li v-for="m in pay.rows" :key="m.id">
                <span class="pay-ico" :class="`m-${m.id}`"><PosIcon :name="m.icon" :size="17" /></span>
                <div>
                  <strong>{{ m.label }}</strong>
                  <small>{{ m.count }} {{ m.count === 1 ? 'ticket' : 'tickets' }} · {{ m.pct }}%</small>
                </div>
                <b>{{ money(m.amount) }}</b>
              </li>
            </ul>
          </template>
          <p v-else class="empty">Sin ventas cobradas {{ periodPhrase }}.</p>
        </section>
      </div>

      <div class="row wn">
        <!-- Lo más vendido -->
        <section class="card" :class="{ busy: loading }">
          <div class="card-head">
            <div>
              <h2>Lo más vendido</h2>
              <p>{{ products.length }} {{ products.length === 1 ? 'producto distinto' : 'productos distintos' }}</p>
            </div>
            <div class="seg" role="group" aria-label="Ordenar por">
              <button type="button" :aria-pressed="topBy === 'money'" @click="topBy = 'money'">Dinero</button>
              <button type="button" :aria-pressed="topBy === 'qty'" @click="topBy = 'qty'">Unidades</button>
            </div>
          </div>
          <ol v-if="topList.length" class="top">
            <li v-for="(p, i) in topList" :key="p.key">
              <span class="rank" :class="{ gold: i < 3 }">{{ i + 1 }}</span>
              <div class="top-main">
                <div class="top-line">
                  <strong>{{ p.name }}</strong>
                  <b>{{ topBy === 'qty' ? qty(p.qty) : money(p.revenue) }}</b>
                </div>
                <div class="meter" aria-hidden="true"><i :style="{ width: `${p.share}%` }"></i></div>
                <small>
                  {{ topBy === 'qty' ? money(p.revenue) : `${qty(p.qty)} vendidos` }} · {{ p.tickets }} {{ p.tickets === 1 ? 'ticket' : 'tickets' }}
                  <template v-if="isAdmin && p.costKnown"> · ganas {{ money(p.profit) }} ({{ p.margin }}%)</template>
                </small>
              </div>
            </li>
          </ol>
          <p v-else class="empty">Aún no hay productos vendidos {{ periodPhrase }}.</p>
          <div v-if="products.length" class="card-foot">
            <button v-if="products.length > topLimit" type="button" class="link" @click="topLimit += 10">Ver 10 más</button>
            <button type="button" class="link" @click="exportProducts">Exportar productos</button>
          </div>
        </section>

        <!-- Por categoría -->
        <section class="card" :class="{ busy: loading }">
          <div class="card-head">
            <div>
              <h2>Por categoría</h2>
              <p>{{ cats.length ? `Lo que más deja: ${cats[0].name}` : 'Reparto de la venta' }}</p>
            </div>
          </div>
          <template v-if="cats.length">
            <div class="stack" aria-hidden="true">
              <i v-for="c in cats" :key="c.name" :style="{ width: `${c.pct}%`, background: c.color }"></i>
            </div>
            <ul class="cat-list">
              <li v-for="c in cats.slice(0, 8)" :key="c.name">
                <i class="cat-sw" :style="{ background: c.color }"></i>
                <span>{{ c.name }}</span>
                <small>{{ c.pct }}%</small>
                <b>{{ money(c.amount) }}</b>
              </li>
            </ul>
          </template>
          <p v-else class="empty">Sin ventas cobradas {{ periodPhrase }}.</p>
        </section>
      </div>

      <div v-if="multiDay" class="row wn">
        <!-- Mapa de calor -->
        <section class="card" :class="{ busy: loading }">
          <div class="card-head">
            <div>
              <h2>¿Cuándo vendes más?</h2>
              <p>{{ heatTip }}</p>
            </div>
          </div>
          <div class="heat" :style="{ '--cols': heatHours.length }">
            <span></span>
            <span v-for="h in heatHours" :key="`h${h}`" class="hh">{{ h % 3 === 0 ? h : '' }}</span>
            <template v-for="(row, d) in heat" :key="`d${d}`">
              <span class="hd">{{ DOW_SHORT[d] }}</span>
              <i
                v-for="(c, j) in row"
                :key="j"
                :style="{ '--a': c.a }"
                :class="{ zero: !c.amount }"
                :title="`${DOW_LONG[d]} ${heatHours[j]}:00 · ${money(c.amount)}`"
              ></i>
            </template>
          </div>
          <div class="heat-legend" aria-hidden="true">
            <span>Menos</span><i></i><span>Más</span>
          </div>
        </section>

        <!-- Sin venderse -->
        <section v-if="isAdmin && dead.items.length" class="card" :class="{ busy: loading }">
          <div class="card-head">
            <div>
              <h2>Sin venderse</h2>
              <p>{{ dead.count }} {{ dead.count === 1 ? 'producto con existencia no se vendió' : 'productos con existencia no se vendieron' }} {{ periodPhrase }}</p>
            </div>
          </div>
          <p v-if="dead.value > 0" class="parked">
            Dinero parado en anaquel <strong>{{ money(dead.value) }}</strong>
          </p>
          <ul class="mini-list">
            <li v-for="f in dead.items" :key="f.id">
              <span>{{ f.name }}</span>
              <small>{{ qty(f.stock) }} en existencia</small>
              <b>{{ f.value > 0 ? money(f.value) : '—' }}</b>
            </li>
          </ul>
          <div class="card-foot">
            <router-link to="/products" class="link">Revisar en Productos</router-link>
          </div>
        </section>
      </div>

      <div v-if="lowStock.length || expiring.length" class="row halves">
        <section v-if="lowStock.length" id="rep-stock" class="card warn-card">
          <div class="card-head">
            <div>
              <h2>Poco stock</h2>
              <p>{{ lowStock.length }} {{ lowStock.length === 1 ? 'producto en o bajo su mínimo' : 'productos en o bajo su mínimo' }}</p>
            </div>
            <router-link to="/inventory?tab=sugerido" class="link">Sugerido de compra</router-link>
          </div>
          <ul class="mini-list">
            <li v-for="item in lowStock.slice(0, 8)" :key="item.id">
              <span>{{ item.name }}</span>
              <small>mín. {{ minOf(item) }}</small>
              <b :class="{ out: !Number(item.stock) }">{{ Number(item.stock) ? `${qty(item.stock)} uds` : 'Agotado' }}</b>
            </li>
          </ul>
        </section>

        <section v-if="expiring.length" id="rep-expiry" class="card bad-card">
          <div class="card-head">
            <div>
              <h2>Por caducar</h2>
              <p>
                <template v-if="expirySummary.expired">{{ expirySummary.expired }} vencidos · </template>{{ expirySummary.d7 }} en 7 días · {{ expirySummary.d30 }} en 30
              </p>
            </div>
            <div class="head-links">
              <button type="button" class="link" @click="exportExpiry">Exportar</button>
              <router-link to="/inventory?tab=caducidad" class="link">Ver todo</router-link>
            </div>
          </div>
          <ul class="mini-list">
            <li v-for="item in expiring.slice(0, 8)" :key="item.id">
              <span>{{ item.foodName }}</span>
              <small>{{ qty(item.quantity) }} uds<template v-if="item.lot"> · lote {{ item.lot }}</template></small>
              <b class="days" :class="{ out: item.bucket === 'expired', soon: item.bucket !== 'expired' && item.daysLeft <= 7 }">
                {{ item.bucket === 'expired' ? 'Vencido' : `${item.daysLeft} d` }}
              </b>
            </li>
          </ul>
        </section>
      </div>

      <!-- Ventas del periodo -->
      <section class="card sales" :class="{ busy: loading }">
        <div class="card-head">
          <div>
            <h2>Ventas {{ periodPhrase }}</h2>
            <p>{{ filteredSales.length }} de {{ orders.length }}</p>
          </div>
          <button type="button" class="btn sm" :disabled="!orders.length" @click="exportSales">
            <PosIcon name="receipt" :size="16" /> CSV
          </button>
        </div>
        <div class="sales-tools">
          <div class="tabs" role="tablist">
            <button
              v-for="t in saleTabs"
              :key="t.id"
              type="button"
              role="tab"
              :aria-selected="saleTab === t.id"
              :class="{ on: saleTab === t.id }"
              @click="saleTab = t.id"
            >
              {{ t.label }}<em>{{ t.count }}</em>
            </button>
          </div>
          <label class="search">
            <PosIcon name="search" :size="17" />
            <input v-model="q" class="inp" type="search" placeholder="Folio o producto" aria-label="Buscar venta por folio o producto" />
          </label>
        </div>
        <ul v-if="shownSales.length" class="sale-list">
          <li v-for="o in shownSales" :key="o.id">
            <span class="s-when"><b>{{ clockOf(o) }}</b><small v-if="days > 1">{{ dateOf(o) }}</small></span>
            <div class="s-main">
              <strong>#{{ folio(o) }}</strong>
              <small>{{ itemsSummary(o) }}</small>
            </div>
            <span class="s-pay" :title="methodText(o.paymentMethod)">
              <PosIcon :name="payIcon(o.paymentMethod)" :size="16" />
              <span class="hide-mobile">{{ methodText(o.paymentMethod) }}</span>
            </span>
            <span class="pill" :class="statusClass(o)">{{ statusText(o) }}</span>
            <b class="s-total" :class="{ void: isVoid(o) }">{{ money(o.total) }}</b>
            <a
              class="s-tk"
              :href="`/print/order/${o.id}?mode=receipt`"
              target="_blank"
              rel="noopener"
              :aria-label="`Ver ticket #${folio(o)}`"
              title="Ver ticket"
            >
              <PosIcon name="receipt" :size="18" />
            </a>
          </li>
        </ul>
        <p v-else class="empty">{{ q ? 'Nada coincide con la búsqueda.' : `No hay ventas ${periodPhrase}.` }}</p>
        <div v-if="filteredSales.length > salesLimit" class="card-foot">
          <button type="button" class="link" @click="salesLimit += 30">Ver 30 más</button>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import AppShell from "../components/AppShell.vue";
import GettingStarted from "../components/GettingStarted.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";
import { venueStore } from "../venueStore";
import { hasRole } from "../authStore";
import { lineBreakdown, rateOf } from "../tax";

const PERIOD_KEY = "timber_report_period";
const PERIODS = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "month", label: "Este mes" },
  { id: "lastMonth", label: "Mes pasado" },
  { id: "custom", label: "Fechas…" },
];
const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DOW_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DOW_PLURAL = ["los lunes", "los martes", "los miércoles", "los jueves", "los viernes", "los sábados", "los domingos"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAY = 86400000;

const isAdmin = computed(() => hasRole("admin"));
const businessName = computed(() => venueStore.businessName || "Tu tienda");

function readPeriod() {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return PERIODS.some((p) => p.id === v) && v !== "custom" ? v : "today";
  } catch {
    return "today";
  }
}
const period = ref(readPeriod());
function setPeriod(id) {
  period.value = id;
  if (id !== "custom") {
    try {
      localStorage.setItem(PERIOD_KEY, id);
    } catch {
      /* ignore */
    }
  }
}

// ---------- Fechas (hora local del dispositivo) ----------
function dayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayEnd(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseKey(k) {
  const [y, m, d] = String(k || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
function spanDays(a, b) {
  return Math.round((dayStart(b) - dayStart(a)) / DAY) + 1;
}
function stampOf(o) {
  const t = new Date(o.paidAt || o.createdAt);
  return Number.isNaN(t.getTime()) ? null : t;
}

const loadedAt = ref(new Date());
const todayKey = computed(() => keyOf(loadedAt.value));
const customFrom = ref(keyOf(addDays(new Date(), -6)));
const customTo = ref(keyOf(new Date()));

const range = computed(() => {
  const now = loadedAt.value;
  const today = dayStart(now);
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (period.value) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: dayEnd(d), prevFrom: addDays(d, -1), prevTo: dayEnd(addDays(d, -1)) };
    }
    case "7d":
    case "30d": {
      const n = period.value === "7d" ? 7 : 30;
      const from = addDays(today, -(n - 1));
      return { from, to: dayEnd(today), prevFrom: addDays(from, -n), prevTo: dayEnd(addDays(from, -1)) };
    }
    case "month": {
      const prevLast = new Date(y, m, 0).getDate();
      return {
        from: new Date(y, m, 1),
        to: dayEnd(today),
        prevFrom: new Date(y, m - 1, 1),
        prevTo: dayEnd(new Date(y, m - 1, Math.min(today.getDate(), prevLast))),
      };
    }
    case "lastMonth":
      return {
        from: new Date(y, m - 1, 1),
        to: dayEnd(new Date(y, m, 0)),
        prevFrom: new Date(y, m - 2, 1),
        prevTo: dayEnd(new Date(y, m - 1, 0)),
      };
    case "custom": {
      let a = parseKey(customFrom.value) || today;
      let b = parseKey(customTo.value) || today;
      if (a > b) [a, b] = [b, a];
      const n = spanDays(a, b);
      return { from: dayStart(a), to: dayEnd(b), prevFrom: addDays(dayStart(a), -n), prevTo: dayEnd(addDays(a, -1)) };
    }
    default:
      return { from: today, to: dayEnd(today), prevFrom: addDays(today, -1), prevTo: dayEnd(addDays(today, -1)), live: true };
  }
});
const days = computed(() => spanDays(range.value.from, range.value.to));
const multiDay = computed(() => days.value >= 7);

function fmtDay(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const rangeText = computed(() => {
  const { from, to } = range.value;
  if (days.value === 1) {
    const s = from.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${fmtDay(from)}${sameYear ? "" : ` ${from.getFullYear()}`} – ${fmtDay(to)} ${to.getFullYear()}`;
});
const periodPhrase = computed(
  () =>
    ({
      today: "hoy",
      yesterday: "ayer",
      "7d": "en 7 días",
      "30d": "en 30 días",
      month: "este mes",
      lastMonth: "el mes pasado",
    })[period.value] || "en estas fechas"
);
const heroLabel = computed(
  () =>
    ({
      today: "Vendiste hoy",
      yesterday: "Vendiste ayer",
      "7d": "Vendiste en los últimos 7 días",
      "30d": "Vendiste en los últimos 30 días",
      month: "Vendiste este mes",
      lastMonth: "Vendiste el mes pasado",
    })[period.value] || "Vendiste en estas fechas"
);
const compareText = computed(
  () =>
    ({
      today: "Ayer a esta hora",
      yesterday: "Antier",
      "7d": "7 días anteriores",
      "30d": "30 días anteriores",
      month: "Mismos días del mes pasado",
      lastMonth: "Mes anterior",
    })[period.value] || "Periodo anterior"
);
const curShort = computed(() => ({ today: "Hoy", yesterday: "Ayer" })[period.value] || "Este periodo");
const prevShort = computed(() => ({ today: "Ayer", yesterday: "Antier" })[period.value] || "Anterior");

// ---------- Datos ----------
const orders = ref([]);
const prevOrders = ref([]);
const loading = ref(false);
const err = ref("");
const foods = ref([]);
const menus = ref([]);
const lowStock = ref([]);
const expiring = ref([]);
const expirySummary = ref({ expired: 0, d7: 0, d15: 0, d30: 0 });
const cashOpen = ref(false);
const cashSession = ref(null);
const cashTotals = ref({ total: 0 });

let seq = 0;
async function load() {
  const my = ++seq;
  loadedAt.value = new Date();
  const r = range.value;
  loading.value = true;
  err.value = "";
  try {
    const [a, b] = await Promise.all([
      apiService.getOrdersReport(r.from.toISOString(), r.to.toISOString()),
      apiService.getOrdersReport(r.prevFrom.toISOString(), r.prevTo.toISOString()).catch(() => []),
    ]);
    if (my !== seq) return;
    orders.value = Array.isArray(a) ? a : [];
    prevOrders.value = Array.isArray(b) ? b : [];
  } catch (e) {
    if (my !== seq) return;
    const msg = e?.response?.data;
    err.value = typeof msg === "string" && msg ? msg : "No se pudo cargar el reporte. Revisa tu conexión.";
    orders.value = [];
    prevOrders.value = [];
  } finally {
    if (my === seq) loading.value = false;
  }
}

watch([period, customFrom, customTo], () => {
  if (period.value === "custom" && (!parseKey(customFrom.value) || !parseKey(customTo.value))) return;
  focusIdx.value = null;
  topLimit.value = 10;
  salesLimit.value = 30;
  load();
});

const foodById = computed(() => {
  const map = new Map();
  for (const f of foods.value) map.set(String(f.id || f._id), f);
  return map;
});
const menuName = computed(() => {
  const map = new Map();
  for (const m of menus.value) map.set(String(m.id || m._id), m.name || "Sin nombre");
  return map;
});

// ---------- Cálculos ----------
function isVoid(o) {
  return o.paymentStatus === "refunded" || o.status === "cancelled";
}
function isPaid(o) {
  return o.paymentStatus === "paid";
}
function articlesOf(o) {
  // Con kilos o metros cada renglón cuenta como un artículo
  return (o.items || []).reduce((a, i) => {
    const q = Number(i.quantity || 0);
    return a + (Number.isInteger(q) ? q : 1);
  }, 0);
}
function summarize(list) {
  const paid = list.filter(isPaid);
  const total = paid.reduce((s, o) => s + Number(o.total || 0), 0);
  const voids = list.filter(isVoid);
  return {
    total,
    count: paid.length,
    avg: paid.length ? total / paid.length : 0,
    tax: paid.reduce((s, o) => s + Number(o.tax || 0), 0),
    // Lo que la tienda cobró de más por pagos con tarjeta (no es IVA)
    cardFees: paid.reduce((s, o) => s + Number(o.cardExtraTax || 0), 0),
    articles: paid.reduce((s, o) => s + articlesOf(o), 0),
    voidCount: voids.length,
    voidTotal: voids.reduce((s, o) => s + Number(o.total || 0), 0),
    unpaid: list.filter((o) => !isPaid(o) && !isVoid(o)).length,
  };
}
const cur = computed(() => summarize(orders.value));
// Hoy se compara contra ayer hasta la misma hora, para que sea justo
const cmp = computed(() => {
  if (!range.value.live) return summarize(prevOrders.value);
  const cut = loadedAt.value - dayStart(loadedAt.value);
  const base = range.value.prevFrom.getTime();
  return summarize(prevOrders.value.filter((o) => {
    const t = stampOf(o);
    return t && t.getTime() - base <= cut;
  }));
});

function trend(a, b) {
  if (!b && !a) return "flat";
  if (!b) return "up";
  const d = (a - b) / b;
  if (Math.abs(d) < 0.005) return "flat";
  return d > 0 ? "up" : "down";
}
function deltaText(a, b) {
  if (!b && !a) return "Sin cambio";
  if (!b) return "▲ Nuevo";
  const d = ((a - b) / b) * 100;
  if (Math.abs(d) < 0.5) return "= Igual";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d) >= 100 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1).replace(/\.0$/, "")}%`;
}

// Importe de cada renglón ya con el descuento del ticket repartido
function lineAmounts(o) {
  const rate = rateOf(o.taxRate);
  const subtotal = Number(o.subtotal || 0);
  const factor = subtotal > 0 ? Math.max(0, subtotal - Number(o.discountAmount || 0)) / subtotal : 1;
  return (o.items || []).map((it) => ({
    it,
    amount: lineBreakdown(it.price, it.quantity, it.priceIncludesTax, rate).gross * factor,
  }));
}

const products = computed(() => {
  const map = new Map();
  for (const o of orders.value) {
    if (!isPaid(o)) continue;
    const seen = new Set();
    for (const { it, amount } of lineAmounts(o)) {
      const key = it.foodId ? `id:${it.foodId}` : `n:${it.name || "Producto"}`;
      const food = it.foodId ? foodById.value.get(String(it.foodId)) : null;
      const p = map.get(key) || {
        key,
        foodId: it.foodId || null,
        name: it.name || food?.name || "Producto",
        qty: 0,
        revenue: 0,
        tickets: 0,
        cost: 0,
        costRevenue: 0,
      };
      const q = Number(it.quantity || 0);
      p.qty += q;
      p.revenue += amount;
      const unitCost = Number(food?.cost || 0);
      if (unitCost > 0) {
        p.cost += unitCost * q;
        p.costRevenue += amount;
      }
      if (!seen.has(key)) {
        p.tickets += 1;
        seen.add(key);
      }
      map.set(key, p);
    }
  }
  return [...map.values()].map((p) => ({
    ...p,
    costKnown: p.costRevenue > 0,
    profit: p.costRevenue - p.cost,
    margin: p.costRevenue > 0 ? Math.round(((p.costRevenue - p.cost) / p.costRevenue) * 100) : 0,
  }));
});

const topBy = ref("money");
const topLimit = ref(10);
const topList = computed(() => {
  const key = topBy.value === "qty" ? "qty" : "revenue";
  const sorted = [...products.value].sort((a, b) => b[key] - a[key]);
  const max = sorted[0]?.[key] || 1;
  return sorted.slice(0, topLimit.value).map((p) => ({ ...p, share: Math.max(2, Math.round((p[key] / max) * 100)) }));
});

const profit = computed(() => {
  let revenue = 0;
  let covered = 0;
  let cost = 0;
  for (const p of products.value) {
    revenue += p.revenue;
    covered += p.costRevenue;
    cost += p.cost;
  }
  return { covered: covered > 0, amount: covered - cost, margin: covered > 0 ? (covered - cost) / covered : 0, coverage: revenue > 0 ? covered / revenue : 0 };
});
const profitNote = computed(() => {
  if (!cur.value.count) return "Sin ventas";
  if (!profit.value.covered) return "Captura el costo en Productos";
  const m = `Margen ${Math.round(profit.value.margin * 100)}%`;
  return profit.value.coverage >= 0.995 ? m : `${m} · ${Math.round(profit.value.coverage * 100)}% con costo`;
});

const CAT_COLORS = ["#1E5AA8", "#E08A1E", "#2E9E6B", "#C2417A", "#7A5AC8", "#1D9BB5", "#B8862B", "#D2553C", "#5B8F2E", "#64748B"];
const cats = computed(() => {
  const map = new Map();
  let total = 0;
  for (const o of orders.value) {
    if (!isPaid(o)) continue;
    for (const { it, amount } of lineAmounts(o)) {
      const food = it.foodId ? foodById.value.get(String(it.foodId)) : null;
      const name = (food && menuName.value.get(String(food.menuId))) || "Otros";
      map.set(name, (map.get(name) || 0) + amount);
      total += amount;
    }
  }
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount, pct: total ? Math.round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .map((c, i) => ({ ...c, color: c.name === "Otros" ? "#94A3B8" : CAT_COLORS[i % CAT_COLORS.length] }));
});

const PAY = [
  { id: "cash", label: "Efectivo", icon: "cash" },
  { id: "card", label: "Tarjeta", icon: "card" },
  { id: "transfer", label: "Transferencia", icon: "transfer" },
  { id: "other", label: "Otro", icon: "tag" },
];
// En pago mixto la parte de tarjeta va a tarjeta y el resto a efectivo (igual que el corte)
const pay = computed(() => {
  const acc = Object.fromEntries(PAY.map((p) => [p.id, { ...p, amount: 0, count: 0 }]));
  let splitCount = 0;
  for (const o of orders.value) {
    if (!isPaid(o)) continue;
    const amount = Number(o.total || 0);
    const m = o.paymentMethod;
    if (m === "split") {
      const cardPart = Math.min(amount, Math.max(0, Number(o.cardAmount || 0)));
      acc.card.amount += cardPart;
      acc.cash.amount += amount - cardPart;
      acc.card.count += 1;
      acc.cash.count += 1;
      splitCount += 1;
    } else {
      const k = acc[m] ? m : "other";
      acc[k].amount += amount;
      acc[k].count += 1;
    }
  }
  const total = cur.value.total || 1;
  const rows = Object.values(acc)
    .filter((r) => r.amount > 0)
    .map((r) => ({ ...r, pct: Math.round((r.amount / total) * 100) }))
    .sort((a, b) => b.amount - a.amount);
  return { rows, splitCount };
});

// ---------- Gráfica ----------
const hourly = computed(() => days.value === 1);
const monthly = computed(() => days.value > 62);
const hasPrevBars = computed(() => !monthly.value);
const chartTitle = computed(() => (hourly.value ? "Ventas por hora" : monthly.value ? "Ventas por mes" : "Ventas por día"));

const buckets = computed(() => {
  const { from, to, prevFrom } = range.value;
  if (hourly.value) {
    const hrs = Array.from({ length: 24 }, () => ({ amount: 0, count: 0 }));
    const prev = Array.from({ length: 24 }, () => 0);
    for (const o of orders.value) {
      const t = isPaid(o) && stampOf(o);
      if (t) {
        hrs[t.getHours()].amount += Number(o.total || 0);
        hrs[t.getHours()].count += 1;
      }
    }
    for (const o of prevOrders.value) {
      const t = isPaid(o) && stampOf(o);
      if (t) prev[t.getHours()] += Number(o.total || 0);
    }
    const active = hrs.map((c, h) => (c.amount || prev[h] ? h : null)).filter((h) => h != null);
    const first = Math.min(8, ...active);
    const last = Math.max(21, ...active);
    const out = [];
    for (let h = first; h <= last; h++) {
      out.push({
        key: `h${h}`,
        label: `${String(h).padStart(2, "0")}:00 – ${String(h + 1).padStart(2, "0")}:00`,
        short: String(h),
        showLabel: h % 2 === 0,
        amount: hrs[h].amount,
        count: hrs[h].count,
        prev: prev[h],
      });
    }
    return out;
  }
  if (monthly.value) {
    const out = [];
    const idx = new Map();
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      idx.set(`${d.getFullYear()}-${d.getMonth()}`, out.length);
      out.push({
        key: `m${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        short: MONTHS[d.getMonth()],
        showLabel: true,
        amount: 0,
        count: 0,
        prev: 0,
      });
    }
    for (const o of orders.value) {
      const t = isPaid(o) && stampOf(o);
      const i = t ? idx.get(`${t.getFullYear()}-${t.getMonth()}`) : undefined;
      if (i != null) {
        out[i].amount += Number(o.total || 0);
        out[i].count += 1;
      }
    }
    return out;
  }
  const n = days.value;
  const out = [];
  const idx = new Map();
  const every = n <= 16 ? 1 : Math.ceil(n / 10);
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    idx.set(keyOf(d), i);
    const dow = (d.getDay() + 6) % 7;
    out.push({
      key: keyOf(d),
      label: `${DOW_LONG[dow]} ${fmtDay(d)}`,
      short: String(d.getDate()),
      top: n <= 16 ? DOW_SHORT[dow].charAt(0) : "",
      showLabel: i % every === 0 || i === n - 1,
      amount: 0,
      count: 0,
      prev: 0,
    });
  }
  const pIdx = new Map();
  for (let i = 0; i < n; i++) pIdx.set(keyOf(addDays(prevFrom, i)), i);
  for (const o of orders.value) {
    const t = isPaid(o) && stampOf(o);
    const i = t ? idx.get(keyOf(t)) : undefined;
    if (i != null) {
      out[i].amount += Number(o.total || 0);
      out[i].count += 1;
    }
  }
  for (const o of prevOrders.value) {
    const t = isPaid(o) && stampOf(o);
    const i = t ? pIdx.get(keyOf(t)) : undefined;
    if (i != null) out[i].prev += Number(o.total || 0);
  }
  return out;
});
const chartMax = computed(() => Math.max(1, ...buckets.value.map((b) => Math.max(b.amount, hasPrevBars.value ? b.prev : 0))));
function barH(v) {
  return v > 0 ? `${Math.max(2, (v / chartMax.value) * 100)}%` : "0%";
}
const peakIdx = computed(() => {
  let best = -1;
  buckets.value.forEach((b, i) => {
    if (b.amount > 0 && (best < 0 || b.amount > buckets.value[best].amount)) best = i;
  });
  return best;
});
const focusIdx = ref(null);
const readout = computed(() => {
  const b = buckets.value[focusIdx.value ?? -1];
  if (b) {
    const prev = hasPrevBars.value ? ` · ${prevShort.value.toLowerCase()} ${money(b.prev)}` : "";
    return `${b.label}: ${money(b.amount)} en ${b.count} ${b.count === 1 ? "ticket" : "tickets"}${prev}`;
  }
  const p = buckets.value[peakIdx.value];
  if (!p) return `Sin ventas cobradas ${periodPhrase.value}.`;
  const what = hourly.value ? "Hora pico" : monthly.value ? "Mejor mes" : "Mejor día";
  return `${what}: ${p.label} · ${money(p.amount)}`;
});

// ---------- Mapa de calor (día de la semana × hora) ----------
const heatHours = computed(() => {
  let first = 8;
  let last = 21;
  for (const o of orders.value) {
    const t = isPaid(o) && stampOf(o);
    if (t) {
      first = Math.min(first, t.getHours());
      last = Math.max(last, t.getHours());
    }
  }
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
});
const heat = computed(() => {
  const hours = heatHours.value;
  const grid = Array.from({ length: 7 }, () => hours.map(() => ({ amount: 0, a: 0 })));
  for (const o of orders.value) {
    const t = isPaid(o) && stampOf(o);
    if (!t) continue;
    const j = hours.indexOf(t.getHours());
    if (j >= 0) grid[(t.getDay() + 6) % 7][j].amount += Number(o.total || 0);
  }
  const max = Math.max(1, ...grid.flat().map((c) => c.amount));
  for (const row of grid) for (const c of row) c.a = c.amount ? Math.round(15 + (c.amount / max) * 85) : 0;
  return grid;
});
const heatTip = computed(() => {
  let best = null;
  heat.value.forEach((row, d) =>
    row.forEach((c, j) => {
      if (c.amount > 0 && (!best || c.amount > best.amount)) best = { d, h: heatHours.value[j], amount: c.amount };
    })
  );
  if (!best) return `Sin ventas cobradas ${periodPhrase.value}.`;
  return `Tu mejor momento: ${DOW_PLURAL[best.d]} de ${best.h} a ${best.h + 1} h`;
});

// ---------- Sin venderse ----------
const dead = computed(() => {
  const sold = new Set(products.value.map((p) => (p.foodId ? String(p.foodId) : null)).filter(Boolean));
  const list = foods.value
    .filter((f) => Number(f.stock) > 0 && !sold.has(String(f.id || f._id)))
    .map((f) => ({ id: f.id || f._id, name: f.name, stock: Number(f.stock), value: Number(f.stock) * Number(f.cost || 0) }))
    .sort((a, b) => b.value - a.value || b.stock - a.stock);
  return { count: list.length, value: list.reduce((s, f) => s + f.value, 0), items: list.slice(0, 8) };
});

// ---------- Lista de ventas ----------
const saleTab = ref("all");
const q = ref("");
const salesLimit = ref(30);
const saleTabs = computed(() => [
  { id: "all", label: "Todas", count: orders.value.length },
  { id: "paid", label: "Cobradas", count: orders.value.filter(isPaid).length },
  { id: "unpaid", label: "Por cobrar", count: cur.value.unpaid },
  { id: "void", label: "Devueltas", count: cur.value.voidCount },
]);
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
const filteredSales = computed(() => {
  const term = fold(q.value.trim().replace(/^#/, ""));
  return [...orders.value]
    .filter((o) => {
      if (saleTab.value === "paid" && !isPaid(o)) return false;
      if (saleTab.value === "void" && !isVoid(o)) return false;
      if (saleTab.value === "unpaid" && (isPaid(o) || isVoid(o))) return false;
      if (!term) return true;
      return fold(folio(o)).includes(term) || (o.items || []).some((i) => fold(i.name).includes(term));
    })
    .sort((a, b) => (stampOf(b) || 0) - (stampOf(a) || 0));
});
const shownSales = computed(() => filteredSales.value.slice(0, salesLimit.value));

function folio(o) {
  return String(o?.id || "").slice(-6).toUpperCase();
}
function itemsSummary(o) {
  const items = o.items || [];
  if (!items.length) return "Sin productos";
  const first = items[0].name || "Producto";
  return items.length > 1 ? `${first} y ${items.length - 1} más` : first;
}
function clockOf(o) {
  const t = stampOf(o);
  return t ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "—";
}
function dateOf(o) {
  const t = stampOf(o);
  return t ? fmtDay(t) : "";
}
const METHOD = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", split: "Mixto", other: "Otro" };
function methodText(m) {
  return METHOD[m] || "Sin cobrar";
}
function payIcon(m) {
  return { cash: "cash", card: "card", transfer: "transfer", split: "split" }[m] || "clock";
}
function statusText(o) {
  if (o.paymentStatus === "refunded") return "Devuelta";
  if (o.status === "cancelled") return "Cancelada";
  return isPaid(o) ? "Cobrada" : "Por cobrar";
}
function statusClass(o) {
  if (isVoid(o)) return "bad";
  return isPaid(o) ? "good" : "warn";
}

// ---------- Formato ----------
const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function money(n) {
  return moneyFmt.format(Number(n || 0));
}
function qty(n, digits = 3) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? v.toLocaleString("es-MX") : String(Number(v.toFixed(digits)));
}
function minOf(item) {
  return item.lowStockThreshold != null ? item.lowStockThreshold : 5;
}

// ---------- Caja ----------
const cashSince = computed(() => {
  const d = new Date(cashSession.value?.openedAt || cashSession.value?.createdAt);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
});
const cashLong = computed(() => {
  if (!cashOpen.value) return false;
  const d = new Date(cashSession.value?.openedAt || cashSession.value?.createdAt);
  return !Number.isNaN(d.getTime()) && (Date.now() - d.getTime()) / 3600000 >= 12;
});

function jump(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Exportar ----------
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(name, header, rows) {
  const body = [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileRange = computed(() => {
  const a = keyOf(range.value.from);
  const b = keyOf(range.value.to);
  return a === b ? a : `${a}_a_${b}`;
});
function exportSales() {
  const rows = filteredSales.value.map((o) => {
    const t = stampOf(o);
    return [
      t ? keyOf(t) : "",
      t ? `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}` : "",
      folio(o),
      statusText(o),
      isPaid(o) || isVoid(o) ? methodText(o.paymentMethod) : "",
      articlesOf(o),
      Number(o.subtotal || 0).toFixed(2),
      Number(o.discountAmount || 0).toFixed(2),
      Number(o.tax || 0).toFixed(2),
      Number(o.cardExtraTax || 0).toFixed(2),
      Number(o.total || 0).toFixed(2),
      (o.items || []).map((i) => `${qty(i.quantity)} x ${i.name}`).join(" | "),
    ];
  });
  download(
    `ventas_${fileRange.value}.csv`,
    ["Fecha", "Hora", "Folio", "Estado", "Forma de pago", "Articulos", "Subtotal", "Descuento", "IVA", "Comision tarjeta", "Total", "Productos"],
    rows
  );
}
function exportProducts() {
  const rows = [...products.value]
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => {
      const base = [p.name, qty(p.qty), p.tickets, p.revenue.toFixed(2)];
      return isAdmin.value ? [...base, p.costKnown ? p.cost.toFixed(2) : "", p.costKnown ? p.profit.toFixed(2) : "", p.costKnown ? p.margin : ""] : base;
    });
  const header = ["Producto", "Unidades", "Tickets", "Venta"];
  download(`productos_${fileRange.value}.csv`, isAdmin.value ? [...header, "Costo", "Ganancia", "Margen %"] : header, rows);
}
function exportExpiry() {
  const rows = expiring.value.map((row) => [
    row.foodName || "",
    row.lot || "",
    row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 10) : "",
    row.daysLeft == null ? "" : row.daysLeft,
    Number(row.quantity) || 0,
    Number(row.unitCost) || 0,
    row.bucket === "expired" ? "Vencido" : `${row.daysLeft} dias`,
  ]);
  download("caducidad.csv", ["Producto", "Lote", "Caducidad", "Dias", "Cantidad", "Costo unitario", "Alerta"], rows);
}

onMounted(async () => {
  load();
  const [f, m, low, exp, cash] = await Promise.allSettled([
    apiService.getAllFoods(),
    apiService.getAllMenus(),
    apiService.getLowStockFoods(),
    apiService.getExpiringLots(30),
    apiService.getCashSession(),
  ]);
  foods.value = f.status === "fulfilled" && Array.isArray(f.value) ? f.value : [];
  menus.value = m.status === "fulfilled" && Array.isArray(m.value) ? m.value : [];
  lowStock.value = low.status === "fulfilled" && Array.isArray(low.value) ? low.value : [];
  if (exp.status === "fulfilled" && exp.value) {
    expiring.value = Array.isArray(exp.value.items) ? exp.value.items : [];
    expirySummary.value = exp.value.summary || expirySummary.value;
  }
  if (cash.status === "fulfilled" && cash.value) {
    cashOpen.value = Boolean(cash.value.open);
    cashSession.value = cash.value.session || null;
    cashTotals.value = cash.value.totals || cashTotals.value;
  }
});
</script>

<style scoped>
.rep {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem;
  padding-bottom: 2rem;
}
.rep > * + * { margin-top: 0.75rem; }

.rep-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.rep-title { min-width: 0; }
.rep-title h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.rep-title p {
  margin: 0.1rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.rep-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }

/* Botones y campos (mismo lenguaje que Caja) */
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
  font: inherit;
  font-size: 0.92rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: var(--timber-panel-elevated); }
.btn.primary { border-color: transparent; background: var(--timber-primary); color: var(--timber-on-primary); }
.btn.primary:hover { background: color-mix(in srgb, var(--timber-primary) 88%, #000); }
.btn.sm { min-height: 2.3rem; padding: 0 0.75rem; font-size: 0.84rem; }
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
.field { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--timber-primary);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.link:hover { text-decoration: underline; }

/* Periodos */
.periods {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  scrollbar-width: none;
  margin-left: -0.75rem;
  margin-right: -0.75rem;
  padding: 0.1rem 0.75rem;
}
.periods::-webkit-scrollbar { display: none; }
.periods button {
  flex-shrink: 0;
  min-height: 2.5rem;
  padding: 0 1rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.periods button:hover { border-color: color-mix(in srgb, var(--timber-primary) 40%, var(--timber-line)); }
.periods button.on {
  border-color: var(--timber-primary);
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.custom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 11rem));
  gap: 0.6rem;
}

/* Atención */
.attn { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.1rem;
  padding: 0 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}
.chip .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--timber-muted); }
.chip.good .dot { background: var(--timber-success); box-shadow: 0 0 0 3px var(--timber-success-soft); }
.chip.muted { color: var(--timber-muted); }
.chip.warn { border-color: color-mix(in srgb, var(--timber-warning) 40%, var(--timber-line)); background: var(--timber-warning-soft); }
.chip.warn svg { color: var(--timber-warning); }
.chip.bad { border-color: color-mix(in srgb, var(--timber-danger) 35%, var(--timber-line)); background: var(--timber-danger-soft); color: var(--timber-danger); }

.banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.65rem 0.9rem;
  border-radius: 0.8rem;
  font-size: 0.88rem;
  font-weight: 700;
}
.banner svg { flex-shrink: 0; }
.banner.warn { background: var(--timber-warning-soft); color: var(--timber-ink); }
.banner.warn svg { color: var(--timber-warning); }
.banner.err { background: var(--timber-danger-soft); color: var(--timber-danger); }

/* Cifra principal */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 1.1rem;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--timber-accent, #e08a1e) 22%, transparent), transparent 55%),
    linear-gradient(150deg, #173f78, #1e5aa8 60%, #2a6dc2);
  color: #fff;
  box-shadow: var(--timber-shadow);
  transition: opacity 0.2s ease;
}
.hero-main { display: grid; align-content: center; gap: 0.15rem; min-width: 0; }
.eyebrow { font-size: 0.85rem; font-weight: 700; opacity: 0.85; }
.hero-amount {
  font-size: clamp(2rem, 7vw, 2.9rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.delta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.55rem;
  margin: 0.35rem 0 0;
  font-size: 0.86rem;
}
.delta b {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  font-weight: 800;
  white-space: nowrap;
}
.delta.up b { background: #2e9e6b; }
.delta.down b { background: #c2413a; }
.delta span { opacity: 0.85; }
.hero-sub { margin: 0.2rem 0 0; font-size: 0.8rem; opacity: 0.75; }
.hero-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.mini {
  display: grid;
  align-content: start;
  gap: 0.1rem;
  min-width: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.mini span { font-size: 0.74rem; font-weight: 700; opacity: 0.85; }
.mini strong {
  overflow: hidden;
  font-size: 1.2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini small { font-size: 0.74rem; font-weight: 700; opacity: 0.85; }
.mini small.up { color: #8ff0bf; opacity: 1; }
.mini small.down { color: #ffb4ad; opacity: 1; }
.mini.profit { background: rgba(255, 255, 255, 0.18); }

/* Tarjetas */
.row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
.card {
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
  transition: opacity 0.2s ease;
  scroll-margin-top: 0.75rem;
}
.busy { opacity: 0.55; }
.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.card-head > div:first-child { min-width: 0; }
.card-head h2 { margin: 0; font-size: 1.05rem; font-weight: 800; }
.card-head p { margin: 0.15rem 0 0; font-size: 0.82rem; font-weight: 600; color: var(--timber-muted); }
.card-head .readout { color: var(--timber-ink); min-height: 1.2em; }
.head-links { display: flex; gap: 0.85rem; flex-shrink: 0; }
.card-foot {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--timber-line);
}
.card-foot .link:only-child { margin-left: auto; }
.empty { margin: 0.5rem 0; font-size: 0.88rem; color: var(--timber-muted); }
.warn-card { border-color: color-mix(in srgb, var(--timber-warning) 35%, var(--timber-line)); }
.bad-card { border-color: color-mix(in srgb, var(--timber-danger) 30%, var(--timber-line)); }

/* Gráfica */
.legend { display: flex; gap: 0.75rem; flex-shrink: 0; font-size: 0.76rem; font-weight: 700; color: var(--timber-muted); }
.legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
.sw { width: 0.7rem; height: 0.7rem; border-radius: 0.2rem; }
.sw.cur { background: var(--timber-primary); }
.sw.prev { border: 1.5px dashed color-mix(in srgb, var(--timber-ink) 40%, transparent); }
.chart {
  display: flex;
  align-items: stretch;
  gap: 0.2rem;
  height: 12rem;
}
.col {
  flex: 1 1 0;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 0.3rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--timber-muted);
  font: inherit;
  cursor: pointer;
}
.col-bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--timber-ink) 4%, transparent);
}
.col.on .col-bars { background: color-mix(in srgb, var(--timber-primary) 10%, transparent); }
.col-bars i { position: absolute; bottom: 0; width: 72%; max-width: 1.6rem; border-radius: 0.3rem 0.3rem 0.15rem 0.15rem; }
.col-bars .ghost {
  width: 86%;
  max-width: 1.9rem;
  border: 1.5px dashed color-mix(in srgb, var(--timber-ink) 32%, transparent);
  border-bottom: none;
}
.col-bars .bar {
  background: color-mix(in srgb, var(--timber-primary) 72%, var(--timber-panel));
  transition: height 0.35s ease;
}
.col.peak .bar { background: var(--timber-accent, #e08a1e); }
.col.on .bar { background: var(--timber-primary); }
.col-lbl {
  display: grid;
  min-height: 1.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.col-lbl em { font-style: normal; font-weight: 600; opacity: 0.75; }
.chart.dense { gap: 0.12rem; }

/* Pagos y categorías */
.stack {
  display: flex;
  height: 0.85rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--timber-surface);
  margin-bottom: 0.85rem;
}
.stack i { height: 100%; }
.stack i + i { box-shadow: -2px 0 0 var(--timber-panel); }
.m-cash { background: #2e9e6b; color: #fff; }
.m-card { background: #1e5aa8; color: #fff; }
.m-transfer { background: #7a5ac8; color: #fff; }
.m-other { background: #94a3b8; color: #fff; }
.pay-list, .cat-list, .mini-list, .top, .sale-list { list-style: none; margin: 0; padding: 0; }
.pay-list { display: grid; gap: 0.6rem; }
.pay-list li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0.65rem; }
.pay-ico { width: 2.1rem; height: 2.1rem; display: grid; place-items: center; border-radius: 0.65rem; }
.pay-list strong { display: block; font-size: 0.92rem; }
.pay-list small { font-size: 0.78rem; color: var(--timber-muted); }
.pay-list b, .cat-list b, .mini-list b { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cat-list { display: grid; gap: 0.5rem; }
.cat-list li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0.55rem; font-size: 0.9rem; }
.cat-list span { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.cat-list small { font-size: 0.78rem; font-weight: 700; color: var(--timber-muted); }
.cat-sw { width: 0.75rem; height: 0.75rem; border-radius: 0.25rem; }

/* Lo más vendido */
.seg {
  display: inline-flex;
  flex-shrink: 0;
  padding: 3px;
  border: 1px solid var(--timber-line);
  border-radius: 0.7rem;
  background: var(--timber-surface);
}
.seg button {
  min-height: 2rem;
  padding: 0 0.65rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--timber-muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.seg button[aria-pressed="true"] { background: var(--timber-panel); color: var(--timber-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.top { display: grid; gap: 0.7rem; }
.top li { display: grid; grid-template-columns: 1.9rem minmax(0, 1fr); gap: 0.6rem; align-items: start; }
.rank {
  width: 1.9rem;
  height: 1.9rem;
  display: grid;
  place-items: center;
  border-radius: 0.55rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
  font-size: 0.8rem;
  font-weight: 800;
}
.rank.gold { background: var(--timber-primary-soft); color: var(--timber-primary); }
.top-main { display: grid; gap: 0.25rem; min-width: 0; }
.top-line { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
.top-line strong { overflow: hidden; font-size: 0.92rem; text-overflow: ellipsis; white-space: nowrap; }
.top-line b { flex-shrink: 0; font-weight: 800; font-variant-numeric: tabular-nums; }
.meter { height: 0.35rem; overflow: hidden; border-radius: 999px; background: var(--timber-surface); }
.meter i { display: block; height: 100%; border-radius: inherit; background: var(--timber-primary); }
.top li:nth-child(-n + 3) .meter i { background: var(--timber-accent, #e08a1e); }
.top small { font-size: 0.76rem; color: var(--timber-muted); }

/* Mapa de calor */
.heat {
  display: grid;
  grid-template-columns: 2.1rem repeat(var(--cols), minmax(0, 1fr));
  gap: 3px;
  align-items: center;
}
.heat i {
  aspect-ratio: 1.3;
  border-radius: 0.25rem;
  background: color-mix(in srgb, var(--timber-primary) calc(var(--a) * 1%), var(--timber-surface));
}
.heat i.zero { background: var(--timber-surface); }
.hh, .hd { font-size: 0.66rem; font-weight: 700; color: var(--timber-muted); font-variant-numeric: tabular-nums; }
.hh { text-align: center; }
.heat-legend { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; margin-top: 0.6rem; font-size: 0.72rem; font-weight: 700; color: var(--timber-muted); }
.heat-legend i {
  width: 5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--timber-primary) 15%, var(--timber-surface)), var(--timber-primary));
}

/* Listas cortas (stock, caducidad, sin venderse) */
.mini-list { display: grid; }
.mini-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0;
  font-size: 0.88rem;
}
.mini-list li + li { border-top: 1px solid var(--timber-line); }
.mini-list span { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.mini-list small { font-size: 0.76rem; color: var(--timber-muted); white-space: nowrap; }
.warn-card .mini-list b { color: var(--timber-warning); }
.mini-list b.out { color: var(--timber-danger); }
.mini-list b.days {
  min-width: 3.4rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--timber-surface);
  text-align: center;
  font-size: 0.78rem;
}
.mini-list b.days.soon { background: var(--timber-warning-soft); color: var(--timber-ink); }
.mini-list b.days.out { background: var(--timber-danger-soft); }
.parked {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.75rem;
  background: var(--timber-warning-soft);
  font-size: 0.86rem;
  font-weight: 700;
}
.parked strong { font-variant-numeric: tabular-nums; }

/* Ventas */
.sales-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}
.tabs { display: flex; gap: 0.3rem; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  min-height: 2.3rem;
  padding: 0 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-muted);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
}
.tabs button.on { border-color: var(--timber-ink); background: var(--timber-ink); color: var(--timber-panel); }
.tabs em {
  min-width: 1.3rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 16%, transparent);
  font-style: normal;
  font-size: 0.74rem;
  text-align: center;
}
.search { position: relative; flex: 1 1 14rem; max-width: 20rem; }
.search svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--timber-muted); pointer-events: none; }
.search .inp { min-height: 2.5rem; padding-left: 2.3rem; }
.sale-list li {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto auto 6.5rem 2.4rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0;
  border-top: 1px solid var(--timber-line);
  font-size: 0.9rem;
}
.s-when { display: grid; font-size: 0.8rem; color: var(--timber-muted); font-variant-numeric: tabular-nums; line-height: 1.25; }
.s-when b { font-weight: 800; color: var(--timber-ink); }
.s-when small { font-size: 0.76rem; font-weight: 600; }
.s-main { display: grid; min-width: 0; }
.s-main strong { font-variant-numeric: tabular-nums; }
.s-main small { overflow: hidden; font-size: 0.78rem; color: var(--timber-muted); text-overflow: ellipsis; white-space: nowrap; }
.s-pay { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; font-weight: 600; color: var(--timber-muted); }
.pill {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}
.pill.good { background: var(--timber-success-soft); color: var(--timber-success); }
.pill.warn { background: var(--timber-warning-soft); color: var(--timber-ink); }
.pill.bad { background: var(--timber-danger-soft); color: var(--timber-danger); }
.s-total { font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }
.s-total.void { color: var(--timber-muted); text-decoration: line-through; }
.s-tk {
  width: 2.4rem;
  height: 2.4rem;
  display: grid;
  place-items: center;
  border-radius: 0.7rem;
  color: var(--timber-primary);
}
.s-tk:hover { background: var(--timber-primary-soft); }

/* Celular */
@media (max-width: 767.98px) {
  .hero-amount { font-size: 2.2rem; }
  .chart { height: 10rem; }
  .card-head { flex-wrap: wrap; }
  .custom { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .search { max-width: none; flex-basis: 100%; }
  .sale-list li {
    grid-template-columns: minmax(0, 1fr) auto 2.4rem;
    grid-template-areas:
      "main total tk"
      "meta pill tk";
    row-gap: 0.15rem;
    column-gap: 0.6rem;
  }
  .s-main { grid-area: main; }
  .s-total { grid-area: total; }
  .s-tk { grid-area: tk; }
  .pill { grid-area: pill; justify-self: end; }
  .s-when { grid-area: meta; display: inline-flex; align-items: baseline; gap: 0.4rem; }
  .s-pay { display: none; }
}

/* Tableta y PC */
@media (min-width: 768px) {
  .rep { padding: 1rem 1.1rem 2rem; }
  .periods { margin: 0; padding: 0.1rem 0; flex-wrap: wrap; overflow: visible; }
  .hero { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); padding: 1.25rem 1.35rem; gap: 1rem; }
  .row.halves { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .row.halves > :only-child { grid-column: 1 / -1; }
}
@media (min-width: 1100px) {
  .rep { padding: 1.25rem 1.5rem 2.5rem; }
  .rep-title h1 { font-size: 1.5rem; }
  .hero { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); }
  .hero-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: center; }
  .row.wn { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
  .row.wn > :only-child { grid-column: 1 / -1; }
  .chart { height: 13rem; }
}
</style>
