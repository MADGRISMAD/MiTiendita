<template>
  <form class="pf-card-stack" @submit.prevent="requestSave">
    <p v-if="!canEdit" class="adm-banner warn" role="note">
      Estás en modo soporte: puedes ver los datos, pero solo un admin cambia el plan, el estado o los datos de la tienda.
    </p>

    <fieldset class="pf-card-stack" style="border: 0; padding: 0; margin: 0" :disabled="!canEdit">
      <h3 class="pf-section-title">Datos de la tienda</h3>
      <div class="pf-form">
        <label class="adm-field">
          <span>Nombre del negocio</span>
          <input v-model="draft.businessName" class="adm-inp" required minlength="2" />
        </label>
        <label class="adm-field">
          <span>Teléfono</span>
          <input v-model="draft.phone" class="adm-inp" inputmode="tel" />
        </label>
        <label class="adm-field wide">
          <span>Dirección</span>
          <input v-model="draft.address" class="adm-inp" />
        </label>
        <label class="adm-field wide" style="grid-auto-flow: column; justify-content: start; align-items: center; gap: 0.5rem">
          <input v-model="draft.inventoryEnabled" type="checkbox" />
          <span>Lleva inventario</span>
        </label>
      </div>

      <h3 class="pf-section-title">Licencia</h3>
      <div class="pf-plans" role="group" aria-label="Plan de la tienda">
        <button v-for="p in PLANS" :key="p.id" type="button" :aria-pressed="draft.plan === p.id" @click="setPlan(p.id)">
          {{ p.name }}<small>{{ p.note }}</small>
        </button>
      </div>
      <p v-if="draft.plan === 'perpetual'" class="adm-hint">
        Pago único, sin cuota. La tienda cobra normal y se ocultan Inventario Mágico y Precio Mágico. Si tenía Mercado Pago, se cancela.
      </p>

      <div class="pf-form">
        <label class="adm-field">
          <span>Estado</span>
          <select v-model="draft.billingStatus" class="adm-inp">
            <option v-if="draft.plan !== 'perpetual'" value="trialing">Prueba</option>
            <option value="active">Activo</option>
            <option v-if="draft.plan !== 'perpetual'" value="past_due">Pago atrasado</option>
            <option value="suspended">Suspendido</option>
          </select>
        </label>
        <label v-if="draft.plan !== 'perpetual'" class="adm-field">
          <span>Fin de la prueba</span>
          <input v-model="draft.trialEndsOn" class="adm-inp" type="date" />
        </label>
        <label v-if="draft.billingStatus === 'suspended'" class="adm-field wide">
          <span>Motivo de la suspensión</span>
          <input v-model="draft.suspendedReason" class="adm-inp" maxlength="200" />
        </label>
      </div>
    </fieldset>

    <div v-if="confirming" class="adm-banner warn" role="alert">
      <div class="pf-grow">
        <strong>Confirma estos cambios:</strong>
        <ul style="margin: 0.3rem 0 0; padding-left: 1.1rem">
          <li v-for="r in risks" :key="r">{{ r }}</li>
        </ul>
      </div>
      <div class="acts" style="display: flex; gap: 0.4rem">
        <button type="button" class="adm-btn sm" @click="confirming = false">Cancelar</button>
        <button type="button" class="adm-btn sm danger" :disabled="saving" @click="save">Sí, guardar</button>
      </div>
    </div>

    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>

    <div v-if="canEdit" class="pf-detail-head">
      <button type="submit" class="adm-btn primary" :disabled="saving || !dirty">
        {{ saving ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios" }}
      </button>
      <button v-if="dirty" type="button" class="adm-btn" :disabled="saving" @click="fill">Descartar</button>
    </div>
  </form>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import { apiService } from "../../apiService";
import { PLAN_NAMES } from "../../platform/format";

const props = defineProps({
  detail: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
});
const emit = defineEmits(["saved"]);

const PLANS = [
  { id: "basic", name: "Básico", note: "250 productos · 2 cuentas" },
  { id: "growth", name: "Crecimiento", note: "1,500 productos · 6 cuentas" },
  { id: "pro", name: "Pro", note: "Sin límite de productos" },
  { id: "perpetual", name: "Perpetua", note: "Pago único, sin IA" },
];

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
const saving = ref(false);
const confirming = ref(false);
const error = ref("");
const ok = ref("");

function fill() {
  const c = props.detail;
  Object.assign(draft, {
    businessName: c.businessName || "",
    phone: c.phone || "",
    address: c.address || "",
    plan: c.plan || "basic",
    billingStatus: c.billingStatus || "trialing",
    trialEndsOn: c.trialEndsOn || "",
    inventoryEnabled: Boolean(c.inventoryEnabled),
    suspendedReason: c.suspendedReason || "",
  });
  confirming.value = false;
}
watch(() => [props.detail.id, props.detail.updatedAtKey], fill, { immediate: true });

const dirty = computed(() => {
  const c = props.detail;
  return (
    draft.businessName !== (c.businessName || "") ||
    draft.phone !== (c.phone || "") ||
    draft.address !== (c.address || "") ||
    draft.plan !== (c.plan || "basic") ||
    draft.billingStatus !== (c.billingStatus || "trialing") ||
    draft.trialEndsOn !== (c.trialEndsOn || "") ||
    draft.inventoryEnabled !== Boolean(c.inventoryEnabled) ||
    (draft.billingStatus === "suspended" && draft.suspendedReason !== (c.suspendedReason || ""))
  );
});

// Lo que merece una segunda mirada antes de guardar
const risks = computed(() => {
  const c = props.detail;
  const out = [];
  if (draft.plan === "perpetual" && c.plan !== "perpetual") {
    out.push("Activar la licencia perpetua apaga la magia y cancela el cobro mensual de Mercado Pago.");
  }
  if (draft.billingStatus === "suspended" && c.billingStatus !== "suspended") {
    out.push("Suspender la tienda: nadie podrá cobrar hasta que se reactive.");
  }
  if (draft.plan !== c.plan && draft.plan !== "perpetual") {
    out.push(`Cambiar el plan de ${PLAN_NAMES[c.plan] || c.plan} a ${PLAN_NAMES[draft.plan]} cambia sus límites al instante.`);
  }
  return out;
});

function setPlan(id) {
  draft.plan = id;
  if (id === "perpetual" && draft.billingStatus !== "suspended") draft.billingStatus = "active";
  if (id !== "perpetual" && draft.billingStatus === "active" && props.detail.isPerpetual) draft.billingStatus = "trialing";
}

function requestSave() {
  if (!props.canEdit || !dirty.value) return;
  error.value = "";
  ok.value = "";
  if (risks.value.length && !confirming.value) {
    confirming.value = true;
    return;
  }
  save();
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  ok.value = "";
  try {
    const updated = await apiService.platformUpdateTenant(props.detail.id, { ...draft });
    confirming.value = false;
    ok.value = "Cambios guardados.";
    emit("saved", updated);
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude guardar los cambios.";
  } finally {
    saving.value = false;
  }
}
</script>
