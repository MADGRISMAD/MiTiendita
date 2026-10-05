<template>
  <PartnerFrame title="Inicio" :subtitle="subtitle">
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>
    <p v-if="data?.partner?.status === 'pending'" class="adm-banner warn" role="status">
      Estamos revisando tu solicitud. Cuando la aprobemos, tu código empezará a registrar tiendas a tu nombre; te avisamos por correo.
    </p>
    <p v-if="data?.partner?.status === 'paused'" class="adm-banner warn" role="status">
      Tu código está en pausa: las tiendas nuevas no se registran con él. Tus tiendas actuales siguen contigo. Escribe a Mi Tiendita.
    </p>

    <template v-if="data">
      <section class="pf-code-card" aria-labelledby="pcode-title">
        <div>
          <h2 id="pcode-title" class="pf-section-title">Tu código para registrar tiendas</h2>
          <p class="pf-code">{{ data.partner.code }}</p>
          <p class="adm-hint">Comparte el enlace: la tienda que se registre con él queda contigo y cada cobro te deja comisión.</p>
        </div>
        <div class="acts">
          <button type="button" class="adm-btn sm" @click="copy(link, 'Enlace copiado.')">Copiar enlace</button>
          <a class="adm-btn sm" :href="whatsappShare" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        </div>
      </section>
      <p v-if="copied" class="pf-ok" role="status">{{ copied }}</p>

      <div class="adm-kpis" aria-label="Tus tiendas">
        <router-link class="adm-kpi" :to="{ name: 'partnerClients' }">
          <span>Tiendas</span><strong class="pf-num">{{ data.counts.total }}</strong><small>{{ data.counts.active }} pagando · {{ data.counts.trialing }} en prueba</small>
        </router-link>
        <router-link class="adm-kpi" :class="{ bad: data.counts.atRisk }" :to="{ name: 'partnerClients', query: { f: 'risk' } }">
          <span>En riesgo</span><strong class="pf-num">{{ data.counts.atRisk }}</strong><small>pago atrasado, suspendidas o prueba vencida</small>
        </router-link>
        <router-link class="adm-kpi" :to="{ name: 'partnerClients', query: { f: 'mine' } }">
          <span>Asignadas a ti</span><strong class="pf-num">{{ data.counts.mine }}</strong><small>las que tú atiendes</small>
        </router-link>
        <router-link v-if="data.money" class="adm-kpi good" :to="{ name: 'partnerCommissions' }">
          <span>Por cobrar</span><strong class="pf-num">{{ money(data.money.pending) }}</strong><small>comisión de {{ Math.round(data.money.rate * 100) }}%</small>
        </router-link>
      </div>

      <div class="pf-two">
        <section class="adm-card pf-card-stack" aria-labelledby="att-title">
          <div class="adm-card-head">
            <div>
              <h2 id="att-title">Necesita tu atención</h2>
              <p>Llama o escribe antes de que la tienda se vaya.</p>
            </div>
          </div>
          <ul v-if="data.attention.length" class="pf-queue">
            <li v-for="item in data.attention" :key="item.id" class="pf-queue-item" :class="item.attention.tone">
              <ClientAvatar :name="item.businessName" />
              <div class="who">
                <strong>{{ item.businessName }}</strong>
                <span class="what">{{ item.attention.label }}</span>
                <span class="detail">{{ item.ownerName || "Sin dueño" }}<template v-if="item.assigneeName"> · atiende {{ item.assigneeName }}</template></span>
              </div>
              <router-link class="adm-btn sm" :to="{ name: 'partnerClient', params: { id: item.id } }">Abrir</router-link>
            </li>
          </ul>
          <div v-else class="pf-allclear"><span>Todo en orden: ninguna tienda pide atención.</span></div>
        </section>

        <div class="pf-card-stack">
          <section v-if="data.money" class="adm-card pf-card-stack" aria-labelledby="lvl-title">
            <div class="adm-card-head">
              <div>
                <h2 id="lvl-title">Tu nivel: {{ Math.round(data.money.rate * 100) }}%</h2>
                <p>{{ data.money.closedSales }} {{ data.money.closedSales === 1 ? "venta cerrada" : "ventas cerradas" }}</p>
              </div>
            </div>
            <ReferralLadder v-if="data.money.ladder?.length" :ladder="data.money.ladder" :closed="data.money.closedSales" />
          </section>

          <section class="adm-card pf-card-stack" aria-labelledby="new-title">
            <div class="adm-card-head">
              <div>
                <h2 id="new-title">Últimas tiendas</h2>
                <p>Las que llegaron más reciente con tu código.</p>
              </div>
              <router-link class="adm-btn sm" :to="{ name: 'partnerClients' }">Todas</router-link>
            </div>
            <ul v-if="data.newest.length" class="pf-list">
              <li v-for="c in data.newest" :key="c.id">
                <router-link class="pf-row" :to="{ name: 'partnerClient', params: { id: c.id } }">
                  <ClientAvatar :name="c.businessName" size="2.2rem" />
                  <span class="body">
                    <span class="top"><strong>{{ c.businessName }}</strong><time :datetime="c.referredAt">{{ ago(c.referredAt) }}</time></span>
                    <span class="meta"><StatusPill :client="c" /><span class="pf-chip">{{ c.planName }}</span></span>
                  </span>
                </router-link>
              </li>
            </ul>
            <p v-else class="pf-muted">Aún no tienes tiendas. Comparte tu enlace para empezar.</p>
          </section>
        </div>
      </div>
    </template>
    <p v-else-if="loading" class="adm-card pf-muted">Cargando…</p>
  </PartnerFrame>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PartnerFrame from "../../components/partner/PartnerFrame.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import StatusPill from "../../components/platform/StatusPill.vue";
import ReferralLadder from "../../components/platform/ReferralLadder.vue";
import { apiService } from "../../apiService";
import { setPartnerName } from "../../authStore";
import { ago, money } from "../../platform/format";

const data = ref(null);
const loading = ref(true);
const error = ref("");
const copied = ref("");

const subtitle = computed(() => (data.value ? data.value.partner.name : "Portal de socios"));
const link = computed(() => `${window.location.origin}/register?ref=${encodeURIComponent(data.value?.partner.code || "")}`);
const whatsappShare = computed(
  () => `https://wa.me/?text=${encodeURIComponent(`Crea tu tienda en Mi Tiendita con 14 días gratis: ${link.value}`)}`
);

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = message;
  } catch {
    copied.value = `Cópialo a mano: ${text}`;
  }
  setTimeout(() => (copied.value = ""), 4000);
}

onMounted(async () => {
  try {
    data.value = await apiService.partnerHome();
    setPartnerName(data.value.partner.name);
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar tu inicio.";
  } finally {
    loading.value = false;
  }
});
</script>
