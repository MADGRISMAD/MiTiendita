<template>
  <div class="pf-card-stack">
    <button type="button" class="adm-btn sm pf-back" @click="$emit('close')">← Todas mis tiendas</button>

    <p v-if="loading && !detail" class="adm-card pf-muted">Abriendo la tienda…</p>
    <p v-else-if="error && !detail" class="adm-banner err" role="alert">{{ error }}</p>

    <section v-else-if="detail" class="adm-card pf-card-stack">
      <div class="pf-detail-head">
        <ClientAvatar :name="detail.businessName" size="3rem" />
        <div class="pf-grow">
          <h2>{{ detail.businessName }}</h2>
          <div class="meta" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem">
            <StatusPill :client="detail" />
            <span class="pf-chip">{{ detail.planName }}</span>
            <span class="pf-chip">{{ lastSeen(detail) === "nunca ha entrado" ? "Nunca ha entrado" : `Entró ${lastSeen(detail)}` }}</span>
          </div>
        </div>
      </div>

      <p v-if="detail.attention" class="adm-banner" :class="detail.attention.tone === 'bad' ? 'err' : 'warn'" role="status">
        {{ detail.attention.label }}
      </p>

      <dl class="pf-facts">
        <div class="pf-fact">
          <dt>Dueño</dt>
          <dd>{{ detail.ownerName || "Sin dueño" }}</dd>
          <small v-if="detail.ownerEmail"><a :href="`mailto:${detail.ownerEmail}`">{{ detail.ownerEmail }}</a></small>
          <small v-if="phone">
            <a :href="`tel:${phone}`">{{ phone }}</a> ·
            <a :href="whatsapp" target="_blank" rel="noopener">WhatsApp</a>
          </small>
        </div>
        <div class="pf-fact">
          <dt>Plan</dt>
          <dd>{{ detail.planName }}</dd>
          <small>{{ planNote }}</small>
        </div>
        <div class="pf-fact">
          <dt>Llegó contigo</dt>
          <dd>{{ shortDate(detail.referredAt) }}</dd>
          <small>{{ ago(detail.referredAt) }}</small>
        </div>
        <div class="pf-fact">
          <dt>Quién la atiende</dt>
          <dd v-if="!canManage">{{ detail.assigneeName || "Sin asignar" }}</dd>
          <select v-else v-model="assignee" class="adm-inp" :disabled="busy" aria-label="Quién la atiende" @change="saveAssignee">
            <option value="">Sin asignar</option>
            <option v-for="m in activeTeam" :key="m.username" :value="m.username">{{ m.fullName }}</option>
          </select>
        </div>
      </dl>
      <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>

      <section v-if="detail.usage" class="pf-card-stack" aria-labelledby="pu-title">
        <h3 id="pu-title" class="pf-section-title">Cómo usa Mi Tiendita</h3>
        <div class="pf-two even">
          <div class="pf-fact">
            <dt>Cuentas</dt>
            <dd class="pf-num">{{ detail.usage.users.used }}{{ cap(detail.usage.users.max) }}</dd>
          </div>
          <div class="pf-fact">
            <dt>Productos</dt>
            <dd class="pf-num">{{ detail.usage.products.used }}{{ cap(detail.usage.products.max) }}</dd>
          </div>
          <div class="pf-fact">
            <dt>Configuración</dt>
            <dd>{{ detail.setupCompleted ? "Terminada" : "Pendiente" }}</dd>
          </div>
        </div>
      </section>

      <ClientNotes :tenant-id="detail.id" :notes="detail.notes" />

      <section class="pf-card-stack" aria-labelledby="pp-title">
        <h3 id="pp-title" class="pf-section-title">Personas de la tienda</h3>
        <ul class="pf-list">
          <li v-for="p in detail.people" :key="p.id" class="pf-row static">
            <ClientAvatar :name="p.name" size="2.2rem" />
            <span class="body">
              <span class="top"><strong>{{ p.name }}</strong><span class="pf-chip">{{ p.role }}</span></span>
              <span class="sub">{{ p.email }} · {{ p.lastLoginAt ? `entró ${ago(p.lastLoginAt)}` : "nunca ha entrado" }}<template v-if="p.disabled"> · desactivada</template></span>
            </span>
          </li>
        </ul>
      </section>

      <section v-if="detail.commissions" class="pf-card-stack" aria-labelledby="pc-title">
        <h3 id="pc-title" class="pf-section-title">Lo que te ha dejado esta tienda</h3>
        <p v-if="!detail.commissions.length" class="pf-muted">Todavía no paga: la comisión llega con su primer cobro.</p>
        <div v-else class="pf-table-wrap">
          <table class="pf-table">
            <thead>
              <tr><th scope="col">Fecha</th><th scope="col" class="num">Cobro</th><th scope="col" class="num">Tu comisión</th><th scope="col">Estado</th></tr>
            </thead>
            <tbody>
              <tr v-for="c in detail.commissions" :key="c.id" :class="{ void: c.status === 'void' }">
                <td>{{ shortDate(c.createdAt) }}</td>
                <td class="num">{{ money(c.amount) }}</td>
                <td class="num"><strong>{{ money(c.commission) }}</strong> <small class="pf-muted">({{ Math.round(c.rate * 100) }}%)</small></td>
                <td><span class="adm-pill" :class="COMMISSION[c.status].tone">{{ COMMISSION[c.status].label }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="pf-card-stack" aria-labelledby="ph-title">
        <h3 id="ph-title" class="pf-section-title">Historia de su cuenta</h3>
        <ul v-if="detail.history.length" class="pf-timeline">
          <li v-for="h in detail.history" :key="h.id">
            <span class="dot" aria-hidden="true"></span>
            <div>
              <p>{{ h.note || h.type }}</p>
              <small v-if="h.amount != null">{{ money(h.amount) }}</small>
            </div>
            <time :datetime="h.at">{{ ago(h.at) }}</time>
          </li>
        </ul>
        <p v-else class="pf-muted">Sin movimientos todavía.</p>
      </section>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import ClientAvatar from "../platform/ClientAvatar.vue";
import StatusPill from "../platform/StatusPill.vue";
import ClientNotes from "./ClientNotes.vue";
import { apiService } from "../../apiService";
import { isPartnerAdmin } from "../../authStore";
import { ago, daysUntil, lastSeen, money, shortDate } from "../../platform/format";

const props = defineProps({
  id: { type: String, required: true },
  team: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "updated"]);

const COMMISSION = { pending: { label: "Por pagar", tone: "warn" }, paid: { label: "Pagada", tone: "good" }, void: { label: "Anulada", tone: "" } };

const detail = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const ok = ref("");
const assignee = ref("");

const canManage = computed(() => isPartnerAdmin());
const activeTeam = computed(() =>
  props.team.filter((m) => !m.disabled).map((m) => ({ ...m, fullName: `${m.name || ""} ${m.lastName || ""}`.trim() || m.username }))
);
const phone = computed(() => String(detail.value?.ownerPhone || "").replace(/\D/g, ""));
const whatsapp = computed(() => `https://wa.me/${phone.value.length === 10 ? `52${phone.value}` : phone.value}`);
const planNote = computed(() => {
  const d = detail.value;
  if (!d) return "";
  if (d.isPerpetual) return "Pago único";
  if (d.billingStatus === "trialing" && d.trialEndsAt) {
    const days = daysUntil(d.trialEndsAt);
    return days < 0 ? `La prueba venció ${shortDate(d.trialEndsAt)}` : `La prueba termina ${shortDate(d.trialEndsAt)}`;
  }
  if (d.currentPeriodEnd) return `Próximo cobro ${shortDate(d.currentPeriodEnd)}`;
  return d.billingStatusName;
});
const cap = (max) => (max == null ? "" : ` de ${max}`);

async function load() {
  loading.value = true;
  error.value = "";
  ok.value = "";
  detail.value = null;
  try {
    detail.value = await apiService.partnerClient(props.id);
    assignee.value = detail.value.assignee || "";
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude abrir esa tienda.";
  } finally {
    loading.value = false;
  }
}

async function saveAssignee() {
  busy.value = true;
  ok.value = "";
  try {
    await apiService.partnerAssign(props.id, assignee.value || null);
    const who = activeTeam.value.find((m) => m.username === assignee.value);
    detail.value = { ...detail.value, assignee: assignee.value || null, assigneeName: who?.fullName || "" };
    ok.value = who ? `Ahora la atiende ${who.fullName}.` : "Quedó sin asignar.";
    emit("updated", { id: props.id, assignee: assignee.value || null, assigneeName: who?.fullName || "" });
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude asignarla.";
    assignee.value = detail.value?.assignee || "";
  } finally {
    busy.value = false;
  }
}

watch(() => props.id, load, { immediate: true });
</script>
