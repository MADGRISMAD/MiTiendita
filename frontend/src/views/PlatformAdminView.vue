<template>
  <AppShell>
    <div class="owner">
      <template v-if="isMoney">
        <header class="hero-strip">
          <div>
            <h2>{{ pageTitle }}</h2>
            <p>{{ monthText }}</p>
          </div>
          <button type="button" class="t-btn t-btn-ghost" :disabled="downloading || booksLoading" @click="downloadReport">
            {{ downloading ? "Preparando…" : "Descargar reporte" }}
          </button>
        </header>
        <p v-if="booksLoading" class="muted">Cargando números…</p>
        <p v-else-if="booksError" class="err">{{ booksError }}</p>
        <template v-else-if="books">
          <div v-if="route.name === 'platform'" class="kpi-grid">
            <div class="kpi accent">
              <p class="kpi-label">Ganancia del mes</p>
              <p class="kpi-value">{{ money(books.profit) }}</p>
              <p class="kpi-sub">ingresos menos IA y gastos</p>
              <svg class="spark in" viewBox="0 0 160 48" role="img" aria-label="Ganancia del mes">
                <path :d="linePath(spark.profit)" />
                <circle v-for="point in spark.profit" :key="'g' + point.day" :cx="point.x" :cy="point.y" r="2.4">
                  <title>Día {{ point.day }} · {{ money(point.value) }}</title>
                </circle>
              </svg>
            </div>
            <div class="kpi">
              <p class="kpi-label">Ingresos</p>
              <p class="kpi-value">{{ money(books.revenue) }}</p>
              <p class="kpi-sub">{{ books.clients.active }} planes activos</p>
              <svg class="spark in" viewBox="0 0 160 48" role="img" aria-label="Ingresos del mes">
                <path :d="linePath(spark.revenue)" />
                <circle v-for="point in spark.revenue" :key="'i' + point.day" :cx="point.x" :cy="point.y" r="2.4">
                  <title>Día {{ point.day }} · {{ money(point.value) }}</title>
                </circle>
              </svg>
            </div>
            <div class="kpi">
              <p class="kpi-label">Gasto de IA</p>
              <p class="kpi-value">{{ money(books.ai.cost) }}</p>
              <p class="kpi-sub">{{ books.ai.uses }} usos</p>
              <svg class="spark ai" viewBox="0 0 160 48" role="img" aria-label="Gasto de IA del mes">
                <path :d="linePath(spark.ai)" />
                <circle v-for="point in spark.ai" :key="'a' + point.day" :cx="point.x" :cy="point.y" r="2.4">
                  <title>Día {{ point.day }} · {{ money(point.value) }}</title>
                </circle>
              </svg>
            </div>
            <div class="kpi">
              <p class="kpi-label">Otros gastos</p>
              <p class="kpi-value">{{ money(books.expensesTotal) }}</p>
              <p class="kpi-sub">{{ books.expenses.length }} anotados</p>
              <svg class="spark out" viewBox="0 0 160 48" role="img" aria-label="Otros gastos del mes">
                <path :d="linePath(spark.spent)" />
                <circle v-for="point in spark.spent" :key="'e' + point.day" :cx="point.x" :cy="point.y" r="2.4">
                  <title>Día {{ point.day }} · {{ money(point.value) }}</title>
                </circle>
              </svg>
            </div>
          </div>

          <section v-if="route.name === 'platform'" class="t-card panel">
            <div class="panel-head">
              <h3>Correos nuevos</h3>
              <span v-if="waitingClients.length" class="wait-badge">{{ waitingClients.length }}</span>
            </div>
            <p v-if="books.inboxError" class="err">{{ books.inboxError }}</p>
            <p v-else-if="!waitingClients.length" class="muted">No hay correos por responder.</p>
            <div v-else class="waiting-list">
              <button
                v-for="item in waitingClients"
                :key="item.tenantId"
                type="button"
                class="waiting"
                @click="goToWaiting(item)"
              >
                <strong>{{ item.businessName }}</strong>
                <span>Hay {{ item.count === 1 ? '1 correo nuevo' : item.count + ' correos nuevos' }}</span>
                <span class="wait-badge">{{ item.count }}</span>
              </button>
            </div>
          </section>

          <div v-if="route.name === 'platform'" class="mid">
            <section class="t-card panel">
              <div class="panel-head"><h3>Ingresos por plan</h3></div>
              <div v-for="plan in books.byPlan" :key="plan.id" class="pay-row">
                <div class="pay-top">
                  <span>{{ plan.name }}</span>
                  <strong>{{ money(plan.amount) }}</strong>
                </div>
                <div class="bar-track"><div class="bar-fill" :style="{ width: share(plan.amount, books.revenue) + '%' }" /></div>
                <p class="pay-meta">{{ plan.clients }} activos · {{ money(plan.price) }} al mes</p>
              </div>
            </section>
            <section class="t-card panel">
              <div class="panel-head"><h3>Clientes</h3></div>
              <ul class="facts">
                <li><span>En total</span><strong>{{ books.clients.total }}</strong></li>
                <li><span>Activos</span><strong>{{ books.clients.active }}</strong></li>
                <li><span>En prueba</span><strong>{{ books.clients.trialing }}</strong></li>
                <li><span>Pago atrasado</span><strong>{{ books.clients.pastDue }}</strong></li>
                <li><span>Suspendidos</span><strong>{{ books.clients.suspended }}</strong></li>
              </ul>
              <p class="hint">La prueba no entra en los ingresos. La ganancia resta el estimado de IA y los gastos de este mes.</p>
            </section>
          </div>

          <template v-if="route.name === 'platformRevenue'">
            <div class="kpi-grid">
              <div class="kpi accent">
                <p class="kpi-label">Ingresos del mes</p>
                <p class="kpi-value">{{ money(books.revenue) }}</p>
                <p class="kpi-sub">solo planes activos</p>
              </div>
              <div class="kpi">
                <p class="kpi-label">Ganancia</p>
                <p class="kpi-value">{{ money(books.profit) }}</p>
                <p class="kpi-sub">después de IA y gastos</p>
              </div>
            </div>
            <section class="t-card panel">
              <div class="panel-head"><h3>Quién está pagando</h3></div>
              <p v-if="!books.payers.length" class="muted">Todavía no hay planes activos.</p>
              <table v-else class="sheet">
                <thead>
                  <tr><th>Cliente</th><th>Plan</th><th>Cobro</th><th>Este mes</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in books.payers" :key="row.id">
                    <td>{{ row.businessName }}</td>
                    <td>{{ row.planName }}</td>
                    <td>{{ row.interval === 'year' ? 'Anual' : 'Mensual' }}</td>
                    <td class="num">{{ money(row.amount) }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="hint">Si el plan es anual, aquí se ve la parte que corresponde a este mes.</p>
            </section>
          </template>

          <template v-if="route.name === 'platformAi'">
            <div class="kpi-grid">
              <div class="kpi accent">
                <p class="kpi-label">Gasto estimado</p>
                <p class="kpi-value">{{ money(books.ai.cost) }}</p>
                <p class="kpi-sub">{{ money(books.ai.costPerUse) }} por uso</p>
              </div>
              <div class="kpi">
                <p class="kpi-label">Usos del mes</p>
                <p class="kpi-value">{{ books.ai.uses }}</p>
                <p class="kpi-sub">Inventario y Precio Mágico</p>
              </div>
            </div>
            <section class="t-card panel">
              <div class="panel-head"><h3>Por cliente</h3></div>
              <p v-if="!books.ai.clients.length" class="muted">Este mes nadie ha usado la IA.</p>
              <table v-else class="sheet">
                <thead>
                  <tr><th>Cliente</th><th>Usos</th><th>Estimado</th></tr>
                </thead>
                <tbody>
                  <tr v-for="row in books.ai.clients" :key="row.id">
                    <td>{{ row.businessName }}</td>
                    <td>{{ row.uses }}</td>
                    <td class="num">{{ money(row.cost) }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="hint">Cada uso cuenta {{ money(books.ai.costPerUse) }}. Es una referencia para Mi Tiendita; el cargo real aparece en la cuenta de Google.</p>
            </section>
          </template>

          <template v-if="route.name === 'platformExpenses'">
            <div class="kpi-grid">
              <div class="kpi accent">
                <p class="kpi-label">Gastos del mes</p>
                <p class="kpi-value">{{ money(books.expensesTotal) }}</p>
                <p class="kpi-sub">sin contar la IA</p>
              </div>
            </div>
            <section class="t-card panel">
              <div class="panel-head"><h3>Anotar un gasto</h3></div>
              <form class="expense" @submit.prevent="addExpense">
                <input v-model="expenseLabel" class="t-input" placeholder="Servidor, dominio, comisión…" required minlength="2" />
                <input v-model.number="expenseAmount" class="t-input" type="number" min="0.01" step="0.01" placeholder="Monto" required />
                <input v-model="expenseNote" class="t-input" placeholder="Nota, si hace falta" />
                <button type="submit" class="t-btn t-btn-primary" :disabled="savingExpense">
                  {{ savingExpense ? 'Guardando…' : 'Agregar' }}
                </button>
              </form>
              <p v-if="expenseError" class="err">{{ expenseError }}</p>
              <p v-if="!books.expenses.length" class="muted">No hay gastos anotados este mes.</p>
              <ul v-else class="expense-list">
                <li v-for="row in books.expenses" :key="row.id">
                  <div>
                    <strong>{{ row.label }}</strong>
                    <span v-if="row.note">{{ row.note }}</span>
                  </div>
                  <strong class="num">{{ money(row.amount) }}</strong>
                  <button type="button" class="quiet" @click="removeExpense(row.id)">Quitar</button>
                </li>
              </ul>
            </section>
          </template>
        </template>
      </template>

      <template v-else>
        <header class="hero-strip">
          <div>
            <h2>Clientes</h2>
            <p>Datos de cada tienda, su gente y el correo.</p>
          </div>
          <input v-model="query" class="t-input search" type="search" placeholder="Buscar cliente" />
        </header>
        <p v-if="loading" class="muted">Cargando clientes…</p>
        <p v-else-if="err" class="err">{{ err }}</p>
        <div v-else class="clients">
          <section class="t-card panel list">
            <button
              v-for="client in filtered"
              :key="client.id"
              type="button"
              class="client"
              :class="{ on: selectedId === client.id, wait: client.waiting }"
              @click="openClient(client.id)"
            >
              <div class="client-top">
                <strong>{{ client.businessName }}</strong>
                <span v-if="client.waiting" class="wait-badge">{{ client.waiting }}</span>
              </div>
              <span>{{ client.ownerName || 'Sin dueño' }} · {{ client.planName }}</span>
            </button>
            <p v-if="!filtered.length" class="muted">Ningún cliente coincide.</p>
          </section>

          <section v-if="detail" class="t-card panel detail">
            <div class="detail-head">
              <h3>{{ detail.businessName }}</h3>
              <span class="pill" :class="detail.billingStatus">{{ detail.billingStatusName }}</span>
            </div>
            <div class="segs">
              <button type="button" class="seg" :class="{ on: tab === 'datos' }" @click="tab = 'datos'">Datos</button>
              <button type="button" class="seg" :class="{ on: tab === 'personas' }" @click="tab = 'personas'">Personas</button>
              <button type="button" class="seg" :class="{ on: tab === 'correo' }" @click="openMail()">
                Correo
                <span v-if="selectedWaiting" class="wait-badge">{{ selectedWaiting }}</span>
              </button>
            </div>

            <form v-show="tab === 'datos'" class="form" @submit.prevent="save">
              <label>Nombre del negocio<input v-model="draft.businessName" required minlength="2" /></label>
              <label>Teléfono<input v-model="draft.phone" inputmode="tel" /></label>
              <label class="wide">Dirección<input v-model="draft.address" /></label>
              <label>
                Plan
                <select v-model="draft.plan">
                  <option value="basic">Básico</option>
                  <option value="growth">Crecimiento</option>
                  <option value="pro">Pro</option>
                  <option value="perpetual">Perpetua (sin magia)</option>
                </select>
              </label>
              <p v-if="draft.plan === 'perpetual'" class="hint wide">
                Activa la licencia perpetua: la tienda sigue cobrando normal y desaparecen
                Inventario Mágico y Precio Mágico. Si tenía cobro en Mercado Pago, se cancela.
              </p>
              <label>
                Estado
                <select v-model="draft.billingStatus">
                  <option v-if="draft.plan !== 'perpetual'" value="trialing">Prueba</option>
                  <option value="active">Activo</option>
                  <option v-if="draft.plan !== 'perpetual'" value="past_due">Pago atrasado</option>
                  <option value="suspended">Suspendido</option>
                </select>
              </label>
              <label v-if="draft.plan !== 'perpetual'">Fin de la prueba<input v-model="draft.trialEndsOn" type="date" /></label>
              <label v-if="draft.billingStatus === 'suspended'">Motivo<input v-model="draft.suspendedReason" /></label>
              <label class="check"><input v-model="draft.inventoryEnabled" type="checkbox" /> Lleva inventario</label>
              <div class="mini-facts">
                <div><span>Alta</span><strong>{{ formatDate(detail.createdAt) }}</strong></div>
                <div>
                  <span>Inventario y Precio Mágico</span>
                  <strong v-if="detail.aiEnabled">{{ detail.aiUsed }} de {{ detail.aiLimit ?? '—' }}</strong>
                  <strong v-else>No incluido</strong>
                </div>
                <div><span>Correo del dueño</span><strong>{{ detail.ownerEmail || 'Sin correo' }}</strong></div>
              </div>
              <p v-if="saveErr" class="err">{{ saveErr }}</p>
              <p v-if="saveOk" class="ok">{{ saveOk }}</p>
              <div class="wide">
                <button type="submit" class="t-btn t-btn-primary" :disabled="saving">
                  {{ saving ? 'Guardando…' : 'Guardar cambios' }}
                </button>
              </div>
            </form>

            <ul v-show="tab === 'personas'" class="people">
              <li v-for="person in detail.users || []" :key="person.id">
                <div>
                  <strong>{{ person.name }} {{ person.lastName }}</strong>
                  <span>{{ roleText(person.role) }} · {{ person.username }}</span>
                </div>
                <div class="contact">
                  <span>{{ person.email }}</span>
                  <span v-if="person.cellphone">{{ person.cellphone }}</span>
                </div>
              </li>
              <li v-if="!(detail.users || []).length" class="muted">Esta tienda no tiene usuarios.</li>
            </ul>

            <div v-show="tab === 'correo'" class="mail">
              <p v-if="mailLoading" class="muted">Buscando correos…</p>
              <p v-if="mailError" class="err">{{ mailError }}</p>
              <div v-if="!mailLoading" class="desk">
                <div class="ticket-list">
                  <button type="button" class="t-btn t-btn-primary" @click="startTicket">Nuevo ticket</button>
                  <button
                    v-for="ticket in tickets"
                    :key="ticket.id"
                    type="button"
                    class="ticket"
                    :class="{ on: !newTicket && activeTicketId === ticket.id }"
                    @click="openTicket(ticket.id)"
                  >
                    <strong>{{ ticket.subject }}</strong>
                    <span class="state" :class="ticket.status">{{ ticket.status === 'open' ? 'Por responder' : 'Respondido' }}</span>
                    <span class="when">{{ formatWhen(ticket.updatedAt) }}</span>
                  </button>
                  <p v-if="!tickets.length" class="muted">Todavía no hay tickets con este cliente.</p>
                </div>
                <div class="ticket-pane">
                  <form v-if="newTicket" class="form" @submit.prevent="sendMail">
                    <label>
                      Para
                      <select v-model="mailTo">
                        <option v-for="email in clientEmails" :key="email" :value="email">{{ email }}</option>
                      </select>
                    </label>
                    <label>Asunto<input v-model="mailSubject" required placeholder="De qué se trata" /></label>
                    <label class="wide">Mensaje<textarea v-model="mailBody" rows="4" required placeholder="Escribe el primer mensaje" /></label>
                    <div class="wide">
                      <button type="submit" class="t-btn t-btn-primary" :disabled="sendingMail || !clientEmails.length">
                        {{ sendingMail ? 'Enviando…' : 'Abrir ticket' }}
                      </button>
                    </div>
                  </form>
                  <template v-else-if="activeTicket">
                    <div class="thread">
                      <article v-for="mail in activeTicket.messages" :key="mail.id || mail.messageId" class="bubble" :class="mail.direction">
                        <header>
                          <strong>{{ mail.direction === 'out' ? 'Mi Tiendita' : mail.from }}</strong>
                          <span>{{ formatWhen(mail.at) }}</span>
                        </header>
                        <p>{{ freshText(mail.text) }}</p>
                      </article>
                    </div>
                    <form class="form reply" @submit.prevent="sendMail">
                      <p class="pay-meta wide">Respondes a {{ activeTicket.to }}. El mensaje sigue este mismo hilo.</p>
                      <label class="wide">Respuesta<textarea v-model="mailBody" rows="4" required placeholder="Escribe la respuesta" /></label>
                      <div class="wide">
                        <button type="submit" class="t-btn t-btn-primary" :disabled="sendingMail">
                          {{ sendingMail ? 'Enviando…' : 'Responder' }}
                        </button>
                      </div>
                    </form>
                  </template>
                  <p v-else class="muted">Elige un ticket o abre uno nuevo.</p>
                </div>
              </div>
            </div>
          </section>

          <section v-else class="t-card panel detail empty">
            <p>Elige un cliente de la lista.</p>
          </section>
        </div>
      </template>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";
import { labelOf, roleLabel } from "../labels";

const route = useRoute();
const router = useRouter();
const pendingClient = ref("");
const pendingTicket = ref("");
const books = ref(null);
const booksLoading = ref(true);
const booksError = ref("");
const expenseLabel = ref("");
const expenseAmount = ref(null);
const expenseNote = ref("");
const savingExpense = ref(false);
const expenseError = ref("");
const downloading = ref(false);

const clients = ref([]);
const detail = ref(null);
const selectedId = ref("");
const tab = ref("datos");
const query = ref("");
const loading = ref(true);
const err = ref("");
const saving = ref(false);
const saveErr = ref("");
const saveOk = ref("");
const messages = ref([]);
const mailError = ref("");
const mailLoading = ref(false);
const mailLoadingFor = ref("");
const mailLoadedFor = ref("");
const mailTo = ref("");
const mailSubject = ref("");
const mailBody = ref("");
const tickets = ref([]);
const activeTicketId = ref("");
const newTicket = ref(false);
const sendingMail = ref(false);
const draft = reactive({
  businessName: "",
  phone: "",
  address: "",
  plan: "basic",
  billingStatus: "trialing",
  trialEndsOn: "",
  inventoryEnabled: false,
  suspendedReason: "",
});

const isMoney = computed(() => route.name !== "platformClients");
const pageTitle = computed(() => {
  if (route.name === "platformRevenue") return "Ganancias";
  if (route.name === "platformAi") return "Gastos de IA";
  if (route.name === "platformExpenses") return "Gastos";
  return "Resumen";
});
const monthText = computed(() => {
  const key = books.value?.month;
  if (!key) return "Este mes";
  const [year, month] = String(key).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const waiting = computed(() => books.value?.waiting || []);
const waitingClients = computed(() => {
  const grouped = new Map();
  for (const item of waiting.value) {
    const current = grouped.get(item.tenantId) || {
      tenantId: item.tenantId,
      businessName: item.businessName,
      ticketId: item.ticketId,
      count: 0,
    };
    current.count += 1;
    if (!current.ticketId) current.ticketId = item.ticketId;
    grouped.set(item.tenantId, current);
  }
  return [...grouped.values()];
});
const selectedWaiting = computed(() => {
  const client = clients.value.find((item) => item.id === selectedId.value);
  return Number(client?.waiting) || 0;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = q
    ? clients.value.filter((client) =>
        [client.businessName, client.ownerName, client.ownerEmail, client.ownerUsername, client.phone, client.ownerPhone]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : [...clients.value];
  return list.sort((a, b) => {
    const waitA = Number(a.waiting) || 0;
    const waitB = Number(b.waiting) || 0;
    if (waitA && waitB) return new Date(b.waitingAt || 0) - new Date(a.waitingAt || 0);
    if (waitA !== waitB) return waitB - waitA;
    return String(a.businessName || "").localeCompare(String(b.businessName || ""), "es");
  });
});

const activeTicket = computed(() => tickets.value.find((ticket) => ticket.id === activeTicketId.value) || null);

const clientEmails = computed(() => {
  const emails = (detail.value?.users || [])
    .map((person) => String(person.email || "").trim().toLowerCase())
    .filter((email) => email.includes("@"));
  return [...new Set(emails)];
});

function money(value) {
  return Number(value || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

function share(amount, total) {
  if (!total) return 0;
  return Math.max(4, Math.round((Number(amount) / Number(total)) * 100));
}

const spark = computed(() => {
  const empty = { profit: [], revenue: [], ai: [], spent: [] };
  const data = books.value;
  if (!data?.month) return empty;
  const [year, month] = String(data.month).split("-").map(Number);
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayYear = Number(todayParts.find((part) => part.type === "year")?.value);
  const todayMonth = Number(todayParts.find((part) => part.type === "month")?.value);
  const todayDay = Number(todayParts.find((part) => part.type === "day")?.value);
  const last = todayYear === year && todayMonth === month
    ? todayDay
    : new Date(year, month, 0).getDate();
  const rate = Number(data.ai?.costPerUse) || 0;
  const cloud = data.cloud || [];
  let revenue = cloud.filter((point) => !point.joined).reduce((sum, point) => sum + Number(point.revenue || 0), 0);
  let ai = cloud.filter((point) => !point.joined).reduce((sum, point) => sum + Number(point.uses || 0) * rate, 0);
  let spent = 0;
  const revenueDays = [];
  const aiDays = [];
  const spentDays = [];
  const profitDays = [];
  for (let day = 1; day <= last; day += 1) {
    revenue += cloud
      .filter((point) => point.joined && Number(point.day) === day)
      .reduce((sum, point) => sum + Number(point.revenue || 0), 0);
    ai += cloud
      .filter((point) => point.joined && Number(point.day) === day)
      .reduce((sum, point) => sum + Number(point.uses || 0) * rate, 0);
    spent += (data.expenses || [])
      .filter((row) => Number(row.day) === day)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    revenueDays.push(revenue);
    aiDays.push(ai);
    spentDays.push(spent);
    profitDays.push(revenue - ai - spent);
  }
  return {
    revenue: sparkPoints(revenueDays),
    ai: sparkPoints(aiDays),
    spent: sparkPoints(spentDays),
    profit: sparkPoints(profitDays),
  };
});

function sparkPoints(values) {
  const width = 160;
  const height = 48;
  const pad = 5;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const span = Math.max(max - min, 1);
  return values.map((value, index) => ({
    day: index + 1,
    value,
    x: values.length <= 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));
}

function linePath(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

async function downloadReport() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    const html = await apiService.platformReport();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank");
    if (!opened) {
      const link = document.createElement("a");
      link.href = url;
      link.download = `timber-reporte-${books.value?.month || "mes"}.html`;
      link.click();
    }
  } catch (e) {
    booksError.value = e.response?.data || "No pude preparar el reporte.";
  } finally {
    downloading.value = false;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX");
}

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function roleText(role) {
  return labelOf(roleLabel, role, "Usuario");
}

function fillDraft(client) {
  draft.businessName = client.businessName || "";
  draft.phone = client.phone || "";
  draft.address = client.address || "";
  draft.plan = client.plan || "basic";
  draft.billingStatus = client.billingStatus || "trialing";
  draft.trialEndsOn = client.trialEndsOn || "";
  draft.inventoryEnabled = Boolean(client.inventoryEnabled);
  draft.suspendedReason = client.suspendedReason || "";
  mailTo.value = client.ownerEmail || clientEmails.value[0] || "";
}

async function loadBooks() {
  booksLoading.value = true;
  booksError.value = "";
  try {
    books.value = await apiService.platformOverview();
  } catch (e) {
    booksError.value = e.response?.data || "No pude cargar los números.";
  } finally {
    booksLoading.value = false;
  }
}

async function loadClients() {
  loading.value = true;
  err.value = "";
  try {
    clients.value = await apiService.platformListTenants();
  } catch (e) {
    err.value = e.response?.data || "No pude cargar los clientes.";
  } finally {
    loading.value = false;
  }
}

async function addExpense() {
  if (savingExpense.value) return;
  savingExpense.value = true;
  expenseError.value = "";
  try {
    await apiService.platformCreateExpense({
      label: expenseLabel.value,
      amount: Number(expenseAmount.value),
      note: expenseNote.value,
    });
    expenseLabel.value = "";
    expenseAmount.value = null;
    expenseNote.value = "";
    await loadBooks();
  } catch (e) {
    expenseError.value = e.response?.data || "No pude guardar el gasto.";
  } finally {
    savingExpense.value = false;
  }
}

async function removeExpense(id) {
  try {
    await apiService.platformDeleteExpense(id);
    await loadBooks();
  } catch (e) {
    expenseError.value = e.response?.data || "No pude quitar el gasto.";
  }
}

async function openClient(id, { mail = false, ticketId = "" } = {}) {
  if (selectedId.value !== id || !detail.value) {
    selectedId.value = id;
    tab.value = mail ? "correo" : "datos";
    saveErr.value = "";
    saveOk.value = "";
    mailError.value = "";
    messages.value = [];
    tickets.value = [];
    activeTicketId.value = ticketId;
    newTicket.value = false;
    mailLoading.value = false;
    mailLoadingFor.value = "";
    mailLoadedFor.value = "";
    try {
      detail.value = await apiService.platformGetTenant(id);
      fillDraft(detail.value);
    } catch (e) {
      saveErr.value = e.response?.data || "No pude abrir ese cliente.";
      return;
    }
  }
  if (mail) {
    if (ticketId) activeTicketId.value = ticketId;
    await openMail(true);
  }
}

async function goToWaiting(item) {
  pendingClient.value = item.tenantId;
  pendingTicket.value = item.ticketId;
  if (route.name === "platformClients") {
    await openClient(item.tenantId, { mail: true, ticketId: item.ticketId });
    pendingClient.value = "";
    pendingTicket.value = "";
    return;
  }
  router.push({ name: "platformClients" });
}

async function openMail(force = false) {
  tab.value = "correo";
  const id = selectedId.value;
  if (!id || mailLoadingFor.value === id) return;
  if (!force && mailLoadedFor.value === id) return;
  mailLoadingFor.value = id;
  mailLoading.value = true;
  mailError.value = "";
  try {
    const thread = await apiService.platformClientMail(id);
    if (selectedId.value !== id) return;
    messages.value = thread.messages || [];
    tickets.value = thread.tickets || [];
    mailError.value = thread.inboxError || "";
    mailLoadedFor.value = id;
    const stillThere = tickets.value.some((ticket) => ticket.id === activeTicketId.value);
    if (!stillThere) {
      activeTicketId.value = tickets.value.find((ticket) => ticket.status === "open")?.id || tickets.value[0]?.id || "";
      newTicket.value = !activeTicketId.value;
    } else {
      newTicket.value = false;
    }
  } catch (e) {
    if (selectedId.value === id) mailError.value = e.response?.data || "No pude cargar los correos.";
  } finally {
    if (mailLoadingFor.value === id) {
      mailLoading.value = false;
      mailLoadingFor.value = "";
    }
  }
}

async function save() {
  if (!selectedId.value || saving.value) return;
  saving.value = true;
  saveErr.value = "";
  saveOk.value = "";
  try {
    const updated = await apiService.platformUpdateTenant(selectedId.value, { ...draft });
    detail.value = updated;
    fillDraft(updated);
    const index = clients.value.findIndex((client) => client.id === updated.id);
    if (index >= 0) clients.value[index] = { ...clients.value[index], ...updated };
    saveOk.value =
      updated.plan === "perpetual"
        ? "Licencia perpetua activa. Inventario Mágico y Precio Mágico ya no aparecen en esa tienda."
        : "Cambios guardados.";
    loadBooks();
  } catch (e) {
    saveErr.value = e.response?.data || "No pude guardar.";
  } finally {
    saving.value = false;
  }
}

function startTicket() {
  newTicket.value = true;
  activeTicketId.value = "";
  mailSubject.value = "";
  mailBody.value = "";
  mailError.value = "";
}

function openTicket(id) {
  newTicket.value = false;
  activeTicketId.value = id;
  mailBody.value = "";
  mailError.value = "";
}

function freshText(value) {
  const lines = String(value || "").split("\n");
  const cut = lines.findIndex((line) => {
    const text = line.trim();
    return (
      text.startsWith(">") ||
      /^-{2,}/.test(text) ||
      /^On .+wrote:$/i.test(text) ||
      /^El .+escribió:$/i.test(text)
    );
  });
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
  return kept || String(value || "").trim();
}

async function sendMail() {
  if (!selectedId.value || sendingMail.value) return;
  sendingMail.value = true;
  mailError.value = "";
  const opening = newTicket.value;
  const subject = mailSubject.value.trim();
  try {
    const thread = await apiService.platformSendClientMail(selectedId.value, opening
      ? { to: mailTo.value, subject, message: mailBody.value }
      : { ticketId: activeTicketId.value, message: mailBody.value });
    messages.value = thread.messages || [];
    tickets.value = thread.tickets || [];
    mailError.value = thread.inboxError || "";
    mailLoadedFor.value = selectedId.value;
    mailBody.value = "";
    if (opening) {
      const created = tickets.value.find((ticket) => ticket.subject.toLowerCase() === subject.toLowerCase());
      activeTicketId.value = created?.id || tickets.value[0]?.id || "";
      newTicket.value = false;
      mailSubject.value = "";
    }
    const waitingNow = tickets.value.filter((ticket) => ticket.status === "open").length;
    const index = clients.value.findIndex((client) => client.id === selectedId.value);
    if (index >= 0) {
      clients.value[index] = {
        ...clients.value[index],
        waiting: waitingNow,
        waitingAt: waitingNow ? tickets.value.find((ticket) => ticket.status === "open")?.updatedAt || null : null,
      };
    }
    if (books.value?.waiting) {
      books.value = {
        ...books.value,
        waiting: books.value.waiting.filter((item) => item.tenantId !== selectedId.value || tickets.value.some((ticket) => ticket.id === item.ticketId && ticket.status === "open")),
      };
    }
  } catch (e) {
    mailError.value = e.response?.data || "No pude enviar el correo.";
  } finally {
    sendingMail.value = false;
  }
}

watch(
  () => draft.plan,
  (plan) => {
    if (plan === "perpetual" && draft.billingStatus !== "suspended") {
      draft.billingStatus = "active";
    }
  }
);

watch(
  () => route.name,
  async (name) => {
    if (name !== "platformClients" || !pendingClient.value) return;
    const id = pendingClient.value;
    const ticketId = pendingTicket.value;
    pendingClient.value = "";
    pendingTicket.value = "";
    await openClient(id, { mail: true, ticketId });
  }
);

onMounted(() => {
  loadBooks();
  loadClients();
});
</script>

<style scoped>
.owner { overflow: auto; max-height: 100%; padding-bottom: 1rem; }
.hero-strip {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 0.85rem;
}
.hero-strip h2 { margin: 0; font-size: 1.55rem; font-weight: 800; letter-spacing: -0.03em; }
.hero-strip p { margin: 0.25rem 0 0; color: var(--timber-muted); }
.search { width: 16rem; }
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}
.kpi {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  padding: 0.9rem 1rem;
}
.kpi.accent {
  background: color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel));
  border-color: color-mix(in srgb, var(--timber-primary) 28%, var(--timber-line));
}
.kpi-label {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--timber-muted);
  font-weight: 700;
}
.kpi-value {
  margin: 0.3rem 0 0;
  font-size: 1.45rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.kpi-sub { margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--timber-muted); }
.mid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 0.85rem; }
.panel { padding: 1rem; margin-bottom: 0.85rem; }
.panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.panel-head h3, .detail-head h3 { margin: 0; font-size: 1.15rem; font-weight: 700; }
.legend { display: flex; gap: 0.75rem; color: var(--timber-muted); font-size: 0.78rem; font-weight: 700; }
.legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
.swatch { width: 0.55rem; height: 0.55rem; border-radius: 2px; display: inline-block; }
.swatch.in { background: var(--timber-primary); }
.swatch.ai { background: var(--timber-accent); }
.swatch.out { background: #94a3b8; }
.spark { width: 100%; height: 3.1rem; display: block; margin-top: 0.35rem; }
.spark path { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; stroke-linecap: round; }
.spark circle { fill: currentColor; }
.spark.in { color: var(--timber-primary); }
.spark.ai { color: var(--timber-accent); }
.spark.out { color: #94a3b8; }
.pay-row { margin-bottom: 0.75rem; }
.pay-top, .detail-head, .people li, .bubble header, .expense-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}
.bar-track { height: 0.45rem; border-radius: 999px; background: var(--timber-surface); overflow: hidden; margin-top: 0.35rem; }
.bar-fill { height: 100%; border-radius: inherit; background: var(--timber-primary); }
.pay-meta, .hint, .muted { color: var(--timber-muted); }
.hint { margin: 0.8rem 0 0; font-size: 0.82rem; }
.facts { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.45rem; }
.facts li { display: flex; justify-content: space-between; padding: 0.45rem 0; border-bottom: 1px solid var(--timber-line); }
.sheet { width: 100%; border-collapse: collapse; }
.sheet th, .sheet td { padding: 0.7rem 0.4rem; text-align: left; border-bottom: 1px solid var(--timber-line); }
.sheet th { color: var(--timber-muted); font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; }
.num { font-variant-numeric: tabular-nums; font-weight: 800; }
.expense { display: grid; grid-template-columns: 1.4fr 0.7fr 1fr auto; gap: 0.55rem; margin-bottom: 0.8rem; }
.expense-list { list-style: none; margin: 0.4rem 0 0; padding: 0; display: grid; gap: 0.35rem; }
.expense-list li { padding: 0.65rem 0; border-bottom: 1px solid var(--timber-line); }
.expense-list span { display: block; color: var(--timber-muted); font-size: 0.8rem; }
.quiet {
  border: none;
  background: transparent;
  color: var(--timber-danger);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.clients { display: grid; grid-template-columns: 20rem minmax(0, 1fr); gap: 0.85rem; min-height: 28rem; }
.list { display: grid; align-content: start; gap: 0.25rem; max-height: calc(100vh - 11rem); overflow: auto; }
.client {
  display: grid;
  gap: 0.1rem;
  text-align: left;
  padding: 0.65rem 0.7rem;
  border: none;
  border-radius: 0.7rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.client.on { background: var(--timber-primary-soft); }
.client.wait { background: color-mix(in srgb, var(--timber-danger) 8%, var(--timber-panel)); }
.client-top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.wait-badge {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--timber-danger);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.waiting-list { display: grid; gap: 0.45rem; }
.waiting {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.7rem;
  text-align: left;
  width: 100%;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  color: inherit;
  border-radius: 0.75rem;
  padding: 0.7rem 0.8rem;
  cursor: pointer;
  font: inherit;
}
.waiting span { color: var(--timber-muted); font-size: 0.85rem; font-weight: 700; }
.client span, .people span, .contact { color: var(--timber-muted); font-size: 0.8rem; }
.detail { min-height: 24rem; }
.detail.empty { display: grid; place-items: center; color: var(--timber-muted); }
.segs {
  display: inline-flex;
  gap: 0.15rem;
  margin: 0.85rem 0;
  padding: 0.15rem;
  border-radius: 0.7rem;
  background: var(--timber-surface);
  border: 1px solid var(--timber-line);
}
.seg {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.4rem;
  padding: 0 0.9rem;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--timber-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.seg.on { background: var(--timber-primary); color: var(--timber-on-primary); }
.seg.on .wait-badge { background: #fff; color: var(--timber-danger); }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem 0.9rem; }
.form label { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.wide { grid-column: 1 / -1; }
.form input, .form select, .form textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 2.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.65rem;
  padding: 0.45rem 0.7rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font: inherit;
}
.form textarea { min-height: 6.5rem; resize: vertical; }
.check { display: flex; align-items: center; gap: 0.5rem; color: var(--timber-ink); font-size: 0.95rem; }
.check input { width: 1.05rem; height: 1.05rem; min-height: 0; }
.mini-facts { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.55rem; }
.mini-facts div { display: grid; gap: 0.15rem; padding: 0.7rem 0.75rem; border-radius: 0.75rem; background: var(--timber-panel-elevated); }
.mini-facts span { color: var(--timber-muted); font-size: 0.75rem; font-weight: 700; }
.pill {
  display: inline-flex;
  align-items: center;
  height: 1.7rem;
  padding: 0 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.pill.active { background: var(--timber-success-soft); color: var(--timber-success); }
.pill.past_due { background: var(--timber-warning-soft); color: var(--timber-warning); }
.pill.suspended { background: var(--timber-danger-soft); color: var(--timber-danger); }
.people { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.people li, .bubble { padding: 0.75rem 0.8rem; border-radius: 0.8rem; background: var(--timber-panel-elevated); }
.contact { text-align: right; }
.mail { display: grid; gap: 0.75rem; }
.desk { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 0.85rem; align-items: start; }
.ticket-list { display: grid; align-content: start; gap: 0.4rem; }
.ticket {
  display: grid;
  gap: 0.2rem;
  text-align: left;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  border-radius: 0.75rem;
  padding: 0.65rem 0.7rem;
  cursor: pointer;
  font: inherit;
}
.ticket.on { border-color: var(--timber-primary); background: var(--timber-primary-soft); }
.ticket strong { font-size: 0.88rem; }
.when { color: var(--timber-muted); font-size: 0.75rem; font-weight: 700; }
.state {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  height: 1.4rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
}
.state.open { background: var(--timber-warning-soft); color: var(--timber-warning); }
.state.answered { background: var(--timber-success-soft); color: var(--timber-success); }
.ticket-pane { display: grid; gap: 0.75rem; }
.thread { display: grid; gap: 0.4rem; max-height: 22rem; overflow: auto; }
.bubble { display: grid; }
.bubble header { display: flex; justify-content: space-between; gap: 0.6rem; }
.bubble header span { color: var(--timber-muted); font-size: 0.75rem; font-weight: 700; }
.bubble p { margin: 0.25rem 0 0; white-space: pre-wrap; }
.bubble.out { background: var(--timber-primary-soft); }
.reply { margin-top: 0.2rem; }
.err { color: var(--timber-danger); font-weight: 700; }
.ok { color: var(--timber-success); font-weight: 700; }
</style>
