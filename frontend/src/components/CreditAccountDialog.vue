<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <div class="adm-dlg wide ca" role="dialog" aria-modal="true" aria-labelledby="ca-title" :class="{ 'adm-loading': loading }">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico"><PosIcon name="receipt" :size="22" /></span>
          <div>
            <h3 id="ca-title">Cuenta de {{ customer.name }}</h3>
            <p>Fiado y abonos</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        </div>

        <p v-if="error" class="adm-err" role="alert">{{ error }}</p>
        <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>

        <template v-if="acct">
          <div class="ca-kpis">
            <div class="ca-kpi" :class="{ bad: acct.balance > 0, good: acct.balance < 0 }">
              <span>{{ acct.balance < 0 ? "Saldo a su favor" : "Debe" }}</span>
              <strong>{{ money(Math.abs(acct.balance)) }}</strong>
              <small v-if="acct.balance > 0 && acct.days">desde hace {{ acct.days }} {{ acct.days === 1 ? "día" : "días" }}</small>
            </div>
            <div class="ca-kpi">
              <span>Límite de fiado</span>
              <strong>{{ acct.creditLimit ? money(acct.creditLimit) : "Sin fiado" }}</strong>
              <small v-if="acct.creditLimit">disponible {{ money(acct.available) }}</small>
            </div>
          </div>

          <!-- Límite (solo administrador) -->
          <form v-if="isAdmin" class="ca-limit" @submit.prevent="saveLimit">
            <label class="adm-field">
              <span>Límite de fiado <em>(0 = no se le fía)</em></span>
              <input v-model.number="limit" class="adm-inp" type="number" inputmode="decimal" min="0" max="1000000" step="50" />
            </label>
            <button type="submit" class="adm-btn" :disabled="busy || Number(limit) === Number(acct.creditLimit)">Guardar límite</button>
          </form>
          <p v-else-if="!acct.creditLimit" class="adm-hint">Pídele al administrador que le autorice un límite para poder fiarle.</p>

          <!-- Abono -->
          <form v-if="acct.balance > 0" class="ca-pay" @submit.prevent="pay">
            <h4>Recibir un abono</h4>
            <div class="ca-pay-row">
              <label class="adm-field">
                <span>Monto</span>
                <input
                  v-model.number="amount"
                  class="adm-inp"
                  type="number"
                  inputmode="decimal"
                  min="0.01"
                  :max="acct.balance"
                  step="0.01"
                  placeholder="0.00"
                  required
                />
              </label>
              <button type="button" class="adm-btn sm" @click="amount = acct.balance">Todo ({{ money(acct.balance) }})</button>
            </div>
            <div class="ca-methods" role="radiogroup" aria-label="Forma de pago del abono">
              <label v-for="m in METHODS" :key="m.id" class="ca-method" :class="{ on: method === m.id }">
                <input v-model="method" type="radio" name="ca-method" :value="m.id" />
                <PosIcon :name="m.icon" :size="16" /> {{ m.label }}
              </label>
            </div>
            <label class="adm-field">
              <span>Nota <em>(opcional)</em></span>
              <input v-model.trim="note" class="adm-inp" maxlength="140" autocomplete="off" placeholder="Ej. abono de la quincena" />
            </label>
            <p class="adm-hint">El abono entra a la caja abierta y se suma al corte.</p>
            <button type="submit" class="adm-btn primary block" :disabled="busy || !(amount > 0)">
              {{ busy ? "Registrando…" : "Registrar abono" }}
            </button>
          </form>

          <a v-if="acct.balance > 0 && reminderLink" class="adm-btn wa block" :href="reminderLink" target="_blank" rel="noopener">
            <PosIcon name="chat" :size="16" /> Recordarle por WhatsApp
          </a>

          <!-- Movimientos -->
          <h4 class="ca-h">Movimientos</h4>
          <ul v-if="acct.entries.length" class="ca-list">
            <li v-for="e in acct.entries" :key="e.id" class="ca-row">
              <div class="ca-what">
                <strong>{{ labelOf(e) }}</strong>
                <small>{{ when(e.createdAt) }}<template v-if="e.createdBy"> · {{ e.createdBy }}</template><template v-if="e.note"> · {{ e.note }}</template></small>
              </div>
              <b :class="e.type === 'charge' ? 'neg' : 'pos'">{{ e.type === "charge" ? "+" : "−" }}{{ money(e.amount) }}</b>
            </li>
          </ul>
          <p v-else class="adm-hint">Todavía no hay movimientos.</p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PosIcon from "./PosIcon.js";
import { apiService } from "../apiService";
import { money } from "../textUtils";

const props = defineProps({
  customer: { type: Object, required: true },
  isAdmin: { type: Boolean, default: false },
  businessName: { type: String, default: "" },
});
const emit = defineEmits(["close", "changed"]);

const METHODS = [
  { id: "cash", label: "Efectivo", icon: "cash" },
  { id: "card", label: "Tarjeta", icon: "card" },
  { id: "transfer", label: "Transferencia", icon: "transfer" },
];

const loading = ref(true);
const busy = ref(false);
const error = ref("");
const flash = ref("");
const acct = ref(null);
const limit = ref(0);
const amount = ref(null);
const method = ref("cash");
const note = ref("");

const when = (v) => (v ? new Date(v).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const msgOf = (e, fallback) => e?.response?.data?.message || (typeof e?.response?.data === "string" ? e.response.data : "") || fallback;
const labelOf = (e) => (e.type === "charge" ? "Venta fiada" : e.type === "void" ? "Venta anulada" : `Abono en ${({ cash: "efectivo", card: "tarjeta", transfer: "transferencia" })[e.method] || "otro medio"}`);

const reminderLink = computed(() => {
  const digits = String(props.customer.phone || "").replace(/\D/g, "");
  if (digits.length < 10 || !acct.value) return "";
  const shop = props.businessName ? ` en ${props.businessName}` : "";
  const text = `Hola ${props.customer.name}, te recordamos que tienes un saldo pendiente de ${money(acct.value.balance)}${shop}. ¡Gracias por tu preferencia!`;
  return `https://wa.me/${digits.length === 10 ? `52${digits}` : digits}?text=${encodeURIComponent(text)}`;
});

async function load() {
  loading.value = true;
  try {
    acct.value = await apiService.getCustomerCredit(props.customer.id);
    limit.value = acct.value.creditLimit;
  } catch (e) {
    error.value = msgOf(e, "No se pudo cargar la cuenta.");
  } finally {
    loading.value = false;
  }
}

async function saveLimit() {
  busy.value = true;
  error.value = "";
  try {
    await apiService.setCustomerCreditLimit(props.customer.id, Number(limit.value) || 0);
    flash.value = "Límite guardado.";
    emit("changed");
    await load();
  } catch (e) {
    error.value = msgOf(e, "No se pudo guardar el límite.");
  } finally {
    busy.value = false;
  }
}

async function pay() {
  busy.value = true;
  error.value = "";
  flash.value = "";
  try {
    const r = await apiService.addCreditPayment(props.customer.id, { amount: Number(amount.value), method: method.value, note: note.value || undefined });
    flash.value = r.balance > 0 ? `Abono registrado. Todavía debe ${money(r.balance)}.` : "Abono registrado. ¡Quedó al corriente!";
    amount.value = null;
    note.value = "";
    emit("changed");
    await load();
  } catch (e) {
    error.value = msgOf(e, "No se pudo registrar el abono.");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ca > * + * { margin-top: 0.8rem; }
.ca-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.6rem; }
.ca-kpi { display: grid; gap: 0.15rem; padding: 0.7rem 0.85rem; border: 1px solid var(--timber-line); border-radius: 0.9rem; background: var(--timber-panel-elevated); }
.ca-kpi span { font-size: 0.78rem; font-weight: 700; color: var(--timber-muted); }
.ca-kpi strong { font-size: 1.35rem; }
.ca-kpi small { font-size: 0.78rem; color: var(--timber-muted); font-weight: 600; }
.ca-kpi.bad strong { color: var(--timber-danger); }
.ca-kpi.good strong { color: #1f9d57; }
.ca-limit { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; }
.ca-limit .adm-field { flex: 1 1 12rem; }
.ca-pay { display: grid; gap: 0.7rem; padding: 0.85rem; border: 1px solid var(--timber-line); border-radius: 1rem; background: var(--timber-panel-elevated); }
.ca-pay h4, .ca-h { margin: 0; font-size: 0.95rem; font-weight: 800; }
.ca-pay-row { display: flex; align-items: flex-end; gap: 0.6rem; flex-wrap: wrap; }
.ca-pay-row .adm-field { flex: 1 1 8rem; }
.ca-methods { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
.ca-method { display: flex; align-items: center; justify-content: center; gap: 0.35rem; min-height: 2.6rem; padding: 0 0.4rem; border: 1px solid var(--timber-line); border-radius: 0.75rem; background: var(--timber-panel); font-size: 0.82rem; font-weight: 700; cursor: pointer; text-align: center; }
.ca-method input { position: absolute; opacity: 0; pointer-events: none; }
.ca-method.on { border-color: var(--timber-primary); background: color-mix(in srgb, var(--timber-primary) 12%, var(--timber-panel)); }
.ca-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--timber-line); border-radius: 1rem; overflow: hidden; background: var(--timber-panel); }
.ca-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 0.8rem; }
.ca-row + .ca-row { border-top: 1px solid var(--timber-line); }
.ca-what { display: grid; min-width: 0; }
.ca-what small { color: var(--timber-muted); font-weight: 600; overflow-wrap: anywhere; }
.ca-row b.neg { color: var(--timber-danger); }
.ca-row b.pos { color: #1f9d57; }
@media (max-width: 380px) {
  .ca-method { font-size: 0.74rem; flex-direction: column; gap: 0.1rem; padding: 0.3rem; }
}
</style>
