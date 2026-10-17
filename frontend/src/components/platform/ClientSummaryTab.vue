<template>
  <div class="pf-card-stack">
    <dl class="pf-facts">
      <div class="pf-fact">
        <dt>Dueño</dt>
        <dd>{{ detail.ownerName || "Sin dueño" }}</dd>
        <small>
          <a v-if="detail.ownerEmail" :href="`mailto:${detail.ownerEmail}`">{{ detail.ownerEmail }}</a>
          <template v-else>Sin correo</template>
        </small>
        <small v-if="phone">
          <a :href="`tel:${phone}`">{{ phone }}</a> ·
          <a :href="whatsapp" target="_blank" rel="noopener">WhatsApp</a>
        </small>
      </div>
      <div class="pf-fact">
        <dt>Alta</dt>
        <dd>{{ shortDate(detail.createdAt) }}</dd>
        <small>{{ ago(detail.createdAt) }}</small>
      </div>
      <div class="pf-fact">
        <dt>Última vez que entraron</dt>
        <dd>{{ lastSeen(detail) }}</dd>
        <small v-if="detail.lastSeenAt">{{ shortDate(detail.lastSeenAt) }}</small>
      </div>
      <div class="pf-fact">
        <dt>Plan</dt>
        <dd>{{ detail.planName }}</dd>
        <small>{{ planNote }}</small>
      </div>
    </dl>

    <p v-if="detail.isBranch" class="adm-banner warn" role="note">
      Esta tienda es una <strong>sucursal</strong><template v-if="detail.matrix">
        de <router-link :to="{ name: 'platformClient', params: { id: detail.matrix.id } }">{{ detail.matrix.businessName }}</router-link></template>.
      Su plan y sus cobros son los de la matriz; desde aquí solo se puede consultar.
    </p>

    <section v-if="detail.isMatrix" class="pf-card-stack" aria-labelledby="branches-title">
      <h3 id="branches-title" class="pf-section-title">
        Matriz · {{ detail.branchCount }} {{ detail.branchCount === 1 ? "sucursal" : "sucursales" }}
      </h3>
      <p v-if="detail.blockedBranches" class="adm-banner warn" role="status">
        El plan de esta matriz ({{ detail.planName }}) cubre menos sucursales de las que tiene: {{ detail.blockedBranches }} {{ detail.blockedBranches === 1 ? "quedó" : "quedaron" }} sin acceso. Sus datos se conservan y vuelven a abrirse si la matriz sube de plan.
      </p>
      <p class="pf-muted">Las sucursales las administra el dueño de la cuenta; aquí solo se consultan. El plan y el cobro son los de esta matriz.</p>
      <div class="pf-table-wrap">
        <table class="pf-table">
          <thead>
            <tr><th scope="col">Sucursal</th><th scope="col">Alta</th><th scope="col" class="num">Personas</th><th scope="col">Última vez que entraron</th><th scope="col">Estado</th></tr>
          </thead>
          <tbody>
            <tr v-for="b in detail.branches" :key="b.id">
              <td>{{ b.businessName }}</td>
              <td>{{ shortDate(b.createdAt) }}</td>
              <td class="num">{{ b.usersCount }}</td>
              <td>{{ lastSeen(b) }}</td>
              <td>{{ b.suspended ? "Dada de baja" : b.overPlan ? "Sin acceso (el plan ya no la incluye)" : "Activa" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ClientReferralCard v-if="canEdit" :detail="detail" @changed="$emit('changed')" />

    <section v-if="detail.usage" class="pf-card-stack" aria-labelledby="usage-title">
      <h3 id="usage-title" class="pf-section-title">Uso del plan</h3>
      <div class="pf-two even">
        <div class="pf-fact">
          <div class="pf-usage">
            <dt>Cuentas</dt>
            <dd class="pf-num">{{ detail.usage.users.used }}{{ cap(detail.usage.users.max) }}</dd>
            <div class="pf-meter" :class="meterTone(detail.usage.users.used, detail.usage.users.max)">
              <i :style="{ width: pct(detail.usage.users.used, detail.usage.users.max) + '%' }"></i>
            </div>
          </div>
          <small v-if="detail.usage.users.pending">{{ detail.usage.users.pending }} invitaciones pendientes</small>
        </div>
        <div class="pf-fact">
          <div class="pf-usage">
            <dt>Productos</dt>
            <dd class="pf-num">{{ detail.usage.products.used }}{{ cap(detail.usage.products.max) }}</dd>
            <div class="pf-meter" :class="meterTone(detail.usage.products.used, detail.usage.products.max)">
              <i :style="{ width: pct(detail.usage.products.used, detail.usage.products.max) + '%' }"></i>
            </div>
          </div>
        </div>
        <div class="pf-fact">
          <div class="pf-usage">
            <dt>Inventario y Precio Mágico</dt>
            <dd class="pf-num">{{ detail.aiEnabled ? `${detail.aiUsed} de ${detail.aiLimit ?? "—"}` : "No incluido" }}</dd>
            <div v-if="detail.aiEnabled" class="pf-meter" :class="meterTone(detail.aiUsed, detail.aiLimit)">
              <i :style="{ width: pct(detail.aiUsed, detail.aiLimit) + '%' }"></i>
            </div>
          </div>
          <small>usos de este mes</small>
        </div>
      </div>
    </section>

    <p v-if="detail.billingStatus === 'suspended' && detail.suspendedReason" class="adm-banner err">
      Suspendida: {{ detail.suspendedReason }}
    </p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ClientReferralCard from "./ClientReferralCard.vue";
import { ago, daysUntil, lastSeen, shortDate } from "../../platform/format";

const props = defineProps({
  detail: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
});
defineEmits(["changed"]);

const phone = computed(() => String(props.detail.ownerPhone || props.detail.phone || "").replace(/\D/g, ""));
const whatsapp = computed(() => `https://wa.me/${phone.value.length === 10 ? `52${phone.value}` : phone.value}`);

const planNote = computed(() => {
  const d = props.detail;
  if (d.isPerpetual) return "Pago único, sin cuota";
  if (d.billingStatus === "trialing") {
    const days = daysUntil(d.trialEndsAt);
    if (days == null) return "En prueba";
    return days < 0 ? `La prueba venció ${shortDate(d.trialEndsAt)}` : `La prueba termina ${shortDate(d.trialEndsAt)} (${days} ${days === 1 ? "día" : "días"})`;
  }
  if (d.currentPeriodEnd) return `Próximo corte ${shortDate(d.currentPeriodEnd)}`;
  return d.billingStatusName;
});

const cap = (max) => (max == null ? "" : ` de ${max}`);
const pct = (used, max) => (max ? Math.min(100, Math.round((Number(used) / Number(max)) * 100)) : 0);
const meterTone = (used, max) => {
  const p = pct(used, max);
  return p >= 100 ? "bad" : p >= 80 ? "warn" : "";
};
</script>
