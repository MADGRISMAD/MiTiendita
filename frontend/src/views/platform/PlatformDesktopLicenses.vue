<template>
  <PlatformFrame title="Licencias de escritorio" :subtitle="subtitle">
    <template #actions>
      <button v-if="isAdmin" type="button" class="adm-btn primary" @click="openNew">Generar licencia</button>
    </template>

    <p v-if="flash" class="adm-banner ok" role="status">{{ flash }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <!-- Código recién generado: se ve una sola vez -->
    <section v-if="newCode" class="adm-card pf-card-stack">
      <div class="pf-code-card">
        <div>
          <small>Código de licencia {{ newCode.who ? `para ${newCode.who}` : "" }} · cópialo ahora, no se vuelve a mostrar</small>
          <p class="pf-code">{{ newCode.code }}</p>
          <small>El cliente lo escribe al activar Mi Tiendita en su computadora (con internet, una sola vez).</small>
        </div>
        <div class="acts">
          <button type="button" class="adm-btn" @click="copy(newCode.code)">{{ copied ? "Copiado" : "Copiar" }}</button>
          <button type="button" class="adm-btn ghost" @click="newCode = null">Listo</button>
        </div>
      </div>
    </section>

    <section v-if="showNew" class="adm-card pf-card-stack">
      <div class="adm-card-head"><div><h2>Nueva licencia</h2><p>Si pones el correo, solo se podrá activar con ese correo.</p></div></div>
      <form class="pf-form" @submit.prevent="create">
        <label class="adm-field"><span>Nombre del cliente</span><input v-model="form.ownerName" class="adm-inp" maxlength="120" /></label>
        <label class="adm-field"><span>Correo</span><input v-model="form.email" class="adm-inp" type="email" maxlength="200" /></label>
        <label class="adm-field"><span>Negocio</span><input v-model="form.businessName" class="adm-inp" maxlength="160" /></label>
        <label class="adm-field"><span>Nota</span><input v-model="form.note" class="adm-inp" maxlength="300" placeholder="Folio de venta, cómo pagó…" /></label>
        <div class="acts">
          <button type="submit" class="adm-btn primary" :disabled="busy">{{ busy ? "Generando…" : "Generar código" }}</button>
          <button type="button" class="adm-btn ghost" @click="showNew = false">Cancelar</button>
        </div>
      </form>
    </section>

    <div class="pf-split" :class="{ detail: !!selectedId }">
      <section class="adm-card pf-pane-list" :class="{ 'adm-loading': loading }">
        <div class="pf-inline">
          <input v-model="q" class="adm-inp adm-search" type="search" placeholder="Buscar cliente, correo, equipo o MAC" @input="debouncedLoad" />
          <select v-model="status" class="adm-inp pf-select" @change="load">
            <option value="">Todas</option>
            <option value="issued">Sin activar</option>
            <option value="active">Activas</option>
            <option value="revoked">Revocadas</option>
          </select>
        </div>
        <p v-if="!loading && !items.length" class="pf-muted">No hay licencias{{ q || status ? " con ese filtro" : " todavía" }}.</p>
        <ul v-else class="pf-list">
          <li v-for="l in items" :key="l.id">
            <router-link :to="{ name: 'platformDesktopLicense', params: { id: l.id } }" class="pf-row" :class="{ on: l.id === selectedId }">
              <span>
                <strong>{{ l.businessName || l.ownerName || l.email || "Sin nombre" }}</strong>
                <small>…{{ l.codeSuffix }} · {{ l.activation?.device?.hostname || (l.status === "issued" ? "sin activar" : "—") }}</small>
              </span>
              <span class="adm-pill" :class="tone(l.status)">{{ label(l.status) }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <section class="adm-card pf-pane-detail">
        <p v-if="!detail" class="pf-muted">Elige una licencia para ver en qué computadora está activada.</p>
        <template v-else>
          <div class="pf-detail-head">
            <div>
              <h2>{{ detail.businessName || detail.ownerName || "Licencia" }}</h2>
              <p class="pf-muted">{{ detail.ownerName }}{{ detail.email ? ` · ${detail.email}` : "" }} · código …{{ detail.codeSuffix }}</p>
            </div>
            <span class="adm-pill" :class="tone(detail.status)">{{ label(detail.status) }}</span>
          </div>

          <dl class="pf-facts">
            <div class="pf-fact"><dt>Generada</dt><dd>{{ dateTime(detail.createdAt) }}</dd><small>por {{ detail.createdBy || "—" }}</small></div>
            <div class="pf-fact"><dt>Activada</dt><dd>{{ detail.activatedAt ? dateTime(detail.activatedAt) : "Aún no" }}</dd><small v-if="detail.activation?.ip">desde {{ detail.activation.ip }}</small></div>
            <div class="pf-fact"><dt>Cambios de equipo</dt><dd>{{ (detail.generation || 1) - 1 }}</dd></div>
            <div v-if="detail.note" class="pf-fact"><dt>Nota</dt><dd>{{ detail.note }}</dd></div>
          </dl>

          <template v-if="detail.activation">
            <h3 class="pf-section-title">Computadora (información recibida al activar)</h3>
            <dl class="pf-facts">
              <div class="pf-fact"><dt>Nombre del equipo</dt><dd>{{ detail.activation.device.hostname || "—" }}</dd></div>
              <div class="pf-fact"><dt>Sistema</dt><dd>{{ [detail.activation.device.os, detail.activation.device.osVersion].filter(Boolean).join(" ") || "—" }}</dd></div>
              <div class="pf-fact"><dt>Modelo</dt><dd>{{ detail.activation.device.model || "—" }}</dd></div>
              <div class="pf-fact"><dt>Procesador</dt><dd>{{ detail.activation.device.cpu || "—" }}</dd></div>
              <div class="pf-fact"><dt>Dirección MAC</dt><dd><span v-for="m in detail.activation.device.macs" :key="m" class="pf-chip">{{ m }}</span><template v-if="!detail.activation.device.macs?.length">—</template></dd></div>
              <div class="pf-fact"><dt>Huella</dt><dd>{{ detail.activation.fingerprintId }}</dd><small>Señales: {{ detail.activation.signals.map(signalName).join(", ") }}</small></div>
              <div class="pf-fact"><dt>Versión de la app</dt><dd>{{ detail.activation.appVersion || "—" }}</dd></div>
              <div class="pf-fact"><dt>Dueño registrado</dt><dd>{{ detail.activation.owner?.name || "—" }}</dd><small>{{ detail.activation.owner?.email }}</small></div>
            </dl>
          </template>

          <template v-if="isAdmin && detail.status !== 'revoked'">
            <h3 class="pf-section-title">Acciones</h3>
            <form class="lic-acts" @submit.prevent>
              <label class="adm-field"><span>Motivo</span><input v-model="reason" class="adm-inp" maxlength="300" placeholder="Cambió de computadora, se descompuso, fraude…" /></label>
              <div class="acts">
                <button v-if="detail.status === 'active'" type="button" class="adm-btn" :disabled="busy || reason.trim().length < 3" @click="act('release')">Liberar para otra computadora</button>
                <button type="button" class="adm-btn danger-ghost" :disabled="busy || reason.trim().length < 3" @click="act('revoke')">{{ confirm === "revoke" ? "¿Revocar? Toca otra vez" : "Revocar" }}</button>
              </div>
              <p class="adm-hint">Liberar genera un código nuevo e invalida el anterior. Una computadora que ya estaba activada y sin internet sigue funcionando: la licencia es permanente.</p>
            </form>
          </template>

          <template v-if="detail.history?.length">
            <h3 class="pf-section-title">Computadoras anteriores</h3>
            <ul class="pf-timeline">
              <li v-for="(h, i) in detail.history" :key="i">
                <span class="dot" aria-hidden="true"></span>
                <div><p>{{ h.device?.hostname || "Equipo" }} · {{ (h.device?.macs || []).join(", ") }}</p><small>Liberada por {{ h.releasedBy || "—" }}: {{ h.reason }}</small></div>
                <time :datetime="h.releasedAt">{{ ago(h.releasedAt) }}</time>
              </li>
            </ul>
          </template>

          <h3 class="pf-section-title">Intentos de activación</h3>
          <p v-if="!detail.attempts?.length" class="pf-muted">Sin intentos registrados.</p>
          <ul v-else class="pf-timeline">
            <li v-for="(a, i) in detail.attempts" :key="i">
              <span class="dot" aria-hidden="true"></span>
              <div><p>{{ attemptName(a.result) }}</p><small>{{ a.device?.hostname || "Equipo" }} · {{ (a.device?.macs || []).join(", ") || "sin MAC" }}{{ a.ip ? ` · ${a.ip}` : "" }}</small></div>
              <time :datetime="a.at" :title="dateTime(a.at)">{{ ago(a.at) }}</time>
            </li>
          </ul>
        </template>
      </section>
    </div>
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import { apiService } from "../../apiService";
import { isPlatformAdmin } from "../../authStore";
import { ago, dateTime } from "../../platform/format";

const route = useRoute();
const items = ref([]);
const detail = ref(null);
const loading = ref(true);
const error = ref("");
const flash = ref("");
const q = ref("");
const status = ref("");
const busy = ref(false);
const showNew = ref(false);
const newCode = ref(null);
const copied = ref(false);
const reason = ref("");
const confirm = ref("");
const form = reactive({ ownerName: "", email: "", businessName: "", note: "" });

const isAdmin = computed(() => isPlatformAdmin());
const selectedId = computed(() => String(route.params.id || ""));
const subtitle = computed(() => {
  const active = items.value.filter((l) => l.status === "active").length;
  return `${items.value.length} licencia(s) · ${active} activa(s) en una computadora`;
});

const LABELS = { issued: "Sin activar", active: "Activa", released: "Liberada", revoked: "Revocada" };
const TONES = { issued: "warn", active: "good", released: "", revoked: "bad" };
const label = (s) => LABELS[s] || s;
const tone = (s) => TONES[s] || "";
const signalName = (s) => ({ uuid: "UUID de hardware", serial: "número de serie", guid: "id de Windows", macs: "MAC" })[s] || s;
const attemptName = (r) =>
  ({
    activated: "Activada en esta computadora",
    reactivated_same_device: "Reactivada en la misma computadora",
    other_device: "Intento en OTRA computadora (rechazado)",
    email_mismatch: "Correo distinto al de la licencia (rechazado)",
    rejected_revoked: "Intento con licencia revocada",
    rejected_released: "Intento con un código ya reemplazado",
    device_unreadable: "No se pudo identificar la computadora",
  })[r] || r;
const errText = (e, f) => e?.response?.data?.message || (typeof e?.response?.data === "string" ? e.response.data : "") || f;

async function load() {
  loading.value = true;
  try {
    items.value = await apiService.platformDesktopLicenses({ q: q.value.trim() || undefined, status: status.value || undefined });
  } catch (e) {
    error.value = errText(e, "No se pudieron cargar las licencias.");
  } finally {
    loading.value = false;
  }
}
let t = null;
function debouncedLoad() {
  clearTimeout(t);
  t = setTimeout(load, 250);
}
async function loadDetail() {
  reason.value = "";
  confirm.value = "";
  if (!selectedId.value) return (detail.value = null);
  try {
    detail.value = await apiService.platformDesktopLicense(selectedId.value);
  } catch (e) {
    detail.value = null;
    error.value = errText(e, "No se pudo cargar la licencia.");
  }
}
function openNew() {
  Object.assign(form, { ownerName: "", email: "", businessName: "", note: "" });
  showNew.value = true;
}
async function create() {
  busy.value = true;
  error.value = "";
  try {
    const out = await apiService.platformCreateDesktopLicense({ ...form });
    newCode.value = { code: out.code, who: form.businessName || form.ownerName || form.email };
    copied.value = false;
    showNew.value = false;
    await load();
  } catch (e) {
    error.value = errText(e, "No se pudo generar la licencia.");
  } finally {
    busy.value = false;
  }
}
async function act(kind) {
  if (kind === "revoke" && confirm.value !== "revoke") {
    confirm.value = "revoke";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    if (kind === "release") {
      const out = await apiService.platformReleaseDesktopLicense(detail.value.id, reason.value.trim());
      newCode.value = { code: out.code, who: detail.value.businessName || detail.value.ownerName };
      copied.value = false;
      flash.value = "Licencia liberada: dale al cliente el código nuevo para su otra computadora.";
    } else {
      await apiService.platformRevokeDesktopLicense(detail.value.id, reason.value.trim());
      flash.value = "Licencia revocada.";
    }
    await Promise.all([load(), loadDetail()]);
  } catch (e) {
    error.value = errText(e, "No se pudo completar la acción.");
  } finally {
    busy.value = false;
  }
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

watch(selectedId, loadDetail);
onMounted(() => {
  load();
  loadDetail();
});
</script>

<style scoped>
.pf-section-title { margin: 1.25rem 0 0.5rem; }
.lic-acts { display: grid; gap: 0.6rem; max-width: 40rem; }
.lic-acts .acts { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.pf-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; }
</style>
