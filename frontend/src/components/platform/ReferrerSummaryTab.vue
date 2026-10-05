<template>
  <div class="pf-card-stack">
    <section class="pf-code-card" aria-labelledby="code-title">
      <div>
        <h3 id="code-title" class="pf-section-title">Número de referencia</h3>
        <p class="pf-code" aria-label="Código del vendedor">{{ detail.code }}</p>
        <p class="adm-hint">
          Quien se registre con este código queda asignado a {{ firstName }}, y <strong>cada cobro</strong> de esa tienda le genera comisión.
        </p>
      </div>
      <div class="acts">
        <button type="button" class="adm-btn sm" @click="copy(detail.code, 'Código copiado.')">Copiar código</button>
        <button type="button" class="adm-btn sm" @click="copy(link, 'Enlace copiado.')">Copiar enlace de registro</button>
      </div>
    </section>
    <p v-if="copied" class="pf-ok" role="status">{{ copied }}</p>

    <dl class="pf-facts">
      <div class="pf-fact">
        <dt>Por pagar</dt>
        <dd class="pf-num" :class="{ good: detail.pending > 0 }">{{ money(detail.pending) }}</dd>
        <small>{{ detail.pendingCount }} {{ detail.pendingCount === 1 ? "cobro" : "cobros" }}</small>
      </div>
      <div class="pf-fact">
        <dt>Ya pagado</dt>
        <dd class="pf-num">{{ money(detail.paid) }}</dd>
        <small>{{ detail.payouts.length }} {{ detail.payouts.length === 1 ? "liquidación" : "liquidaciones" }}</small>
      </div>
      <div class="pf-fact">
        <dt>Clientes</dt>
        <dd class="pf-num">{{ detail.clients }}</dd>
        <small>{{ detail.activeClients }} pagando · {{ detail.trialClients }} en prueba</small>
      </div>
      <div class="pf-fact">
        <dt>Contacto</dt>
        <dd>{{ detail.phone || "Sin teléfono" }}</dd>
        <small><a :href="`mailto:${detail.email}`">{{ detail.email }}</a></small>
        <small v-if="place">{{ place }}</small>
      </div>
    </dl>

    <section class="adm-card pf-card-stack" aria-labelledby="lvl-title">
      <div class="adm-card-head">
        <div>
          <h3 id="lvl-title" class="pf-section-title">Nivel de comisión: {{ Math.round(detail.rate * 100) }}%</h3>
          <p>{{ detail.closedSales }} {{ detail.closedSales === 1 ? "venta cerrada" : "ventas cerradas" }} (tiendas que ya pagaron).</p>
        </div>
      </div>
      <ReferralLadder :ladder="detail.ladder" :closed="detail.closedSales" />
      <p class="adm-hint">
        La comisión de cada cobro usa el nivel que tenía el vendedor en ese momento y queda fija: subir de nivel no cambia lo ya ganado.
        Si anulas un cobro, esa tienda deja de contar como venta cerrada.
      </p>
    </section>

    <p v-if="detail.notes" class="adm-hint"><strong>Notas:</strong> {{ detail.notes }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import ReferralLadder from "./ReferralLadder.vue";
import { money } from "../../platform/format";

const props = defineProps({ detail: { type: Object, required: true } });

const copied = ref("");
const firstName = computed(() => String(props.detail.name || "").split(" ")[0] || "el vendedor");
const place = computed(() => [props.detail.city, props.detail.state].filter(Boolean).join(", "));
const link = computed(() => `${window.location.origin}/register?ref=${encodeURIComponent(props.detail.code)}`);

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = message;
  } catch {
    copied.value = `Cópialo a mano: ${text}`;
  }
  setTimeout(() => (copied.value = ""), 4000);
}
</script>
