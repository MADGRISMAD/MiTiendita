<template>
  <div class="pf-card-stack">
    <section class="adm-card pf-card-stack">
      <div class="adm-card-head">
        <div>
          <h3 class="pf-section-title">Por pagar: {{ money(detail.pending) }}</h3>
          <p>{{ detail.pendingCount }} {{ detail.pendingCount === 1 ? "cobro pendiente" : "cobros pendientes" }}. Al liquidar se marcan como pagados juntos.</p>
        </div>
        <button type="button" class="adm-btn primary" :disabled="!detail.pendingCount || busy" @click="askPay">
          {{ confirmPay ? `¿Confirmas pagar ${money(detail.pending)}?` : "Liquidar" }}
        </button>
      </div>
      <label v-if="confirmPay" class="adm-field">
        <span>Nota de la liquidación (opcional)</span>
        <input v-model="note" class="adm-inp" maxlength="200" placeholder="Ej. transferencia SPEI del 5 de octubre" @keyup.enter="pay" />
      </label>
      <div v-if="confirmPay" class="acts">
        <button type="button" class="adm-btn" @click="confirmPay = false">Cancelar</button>
        <button type="button" class="adm-btn primary" :disabled="busy" @click="pay">{{ busy ? "Liquidando…" : "Sí, ya le pagué" }}</button>
      </div>
      <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    </section>

    <p v-if="!detail.commissions.length" class="adm-empty">
      <strong>Todavía no hay cobros.</strong><br />Las comisiones aparecen cuando una tienda referida paga.
    </p>
    <div v-else class="pf-table-wrap">
      <table class="pf-table">
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Tienda</th>
            <th scope="col" class="num">Cobro</th>
            <th scope="col" class="num">Comisión</th>
            <th scope="col">Estado</th>
            <th scope="col"><span class="pf-sr">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in detail.commissions" :key="c.id" :class="{ void: c.status === 'void' }">
            <td>{{ shortDate(c.createdAt) }}</td>
            <td>
              <router-link :to="{ name: 'platformClient', params: { id: c.tenantId } }">{{ c.businessName || "Tienda" }}</router-link>
              <small class="pf-muted block">{{ SOURCE[c.source] || c.source }}</small>
            </td>
            <td class="num">{{ money(c.amount) }}</td>
            <td class="num"><strong>{{ money(c.commission) }}</strong> <small class="pf-muted">({{ Math.round(c.rate * 100) }}%)</small></td>
            <td>
              <span class="adm-pill" :class="STATUS[c.status].tone">{{ STATUS[c.status].label }}</span>
            </td>
            <td>
              <button v-if="c.status === 'pending'" type="button" class="adm-btn sm danger-ghost" :disabled="busy" @click="voidIt(c)">
                {{ voiding === c.id ? "¿Anular?" : "Anular" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-if="detail.payouts.length" class="pf-card-stack" aria-labelledby="pay-title">
      <h3 id="pay-title" class="pf-section-title">Liquidaciones</h3>
      <ul class="pf-list">
        <li v-for="p in detail.payouts" :key="p.id" class="pf-row static">
          <span class="body">
            <span class="top"><strong>{{ money(p.total) }}</strong><time :datetime="p.paidAt">{{ dateTime(p.paidAt) }}</time></span>
            <span class="sub">{{ p.count }} cobros · {{ p.by || "—" }}</span>
            <span v-if="p.note" class="prev">{{ p.note }}</span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { apiService } from "../../apiService";
import { dateTime, money, shortDate } from "../../platform/format";

const props = defineProps({ detail: { type: Object, required: true } });
const emit = defineEmits(["changed"]);

const SOURCE = { activation: "Activación del plan", authorized_payment: "Cobro de la suscripción", manual: "Cobro registrado a mano" };
const STATUS = {
  pending: { label: "Por pagar", tone: "warn" },
  paid: { label: "Pagada", tone: "good" },
  void: { label: "Anulada", tone: "" },
};

const busy = ref(false);
const error = ref("");
const confirmPay = ref(false);
const note = ref("");
const voiding = ref("");
let timer = null;

function askPay() {
  confirmPay.value = true;
}

async function pay() {
  busy.value = true;
  error.value = "";
  try {
    await apiService.platformPayReferrer(props.detail.id, note.value);
    confirmPay.value = false;
    note.value = "";
    emit("changed", "Liquidación registrada.");
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude registrar la liquidación.";
  } finally {
    busy.value = false;
  }
}

async function voidIt(c) {
  if (voiding.value !== c.id) {
    voiding.value = c.id;
    clearTimeout(timer);
    timer = setTimeout(() => (voiding.value = ""), 4000);
    return;
  }
  voiding.value = "";
  busy.value = true;
  error.value = "";
  try {
    await apiService.platformVoidCommission(c.id, "Anulada desde el panel");
    emit("changed", "Comisión anulada.");
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude anular esa comisión.";
  } finally {
    busy.value = false;
  }
}
</script>
