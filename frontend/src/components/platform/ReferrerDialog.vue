<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="rf-title" @submit.prevent="submit">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico">{{ referrer ? "✎" : "+" }}</span>
          <div>
            <h3 id="rf-title">{{ referrer ? "Editar vendedor" : "Nuevo vendedor" }}</h3>
            <p v-if="!referrer">Se le crea un código de referencia para que lo den sus clientes al registrarse.</p>
            <p v-else>El código <strong>{{ referrer.code }}</strong> no cambia.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')">×</button>
        </div>
        <label class="adm-field"><span>Nombre completo</span><input v-model="form.name" class="adm-inp" required minlength="2" maxlength="80" autocomplete="off" /></label>
        <div class="adm-row2">
          <label class="adm-field"><span>Correo</span><input v-model="form.email" class="adm-inp" type="email" required autocomplete="off" /></label>
          <label class="adm-field"><span>Teléfono</span><input v-model="form.phone" class="adm-inp" inputmode="tel" maxlength="20" autocomplete="off" /></label>
        </div>
        <div class="adm-row2">
          <label class="adm-field"><span>Estado</span><input v-model="form.state" class="adm-inp" maxlength="60" placeholder="Ej. Baja California" autocomplete="off" /></label>
          <label class="adm-field"><span>Ciudad</span><input v-model="form.city" class="adm-inp" maxlength="60" autocomplete="off" /></label>
        </div>
        <label class="adm-field"><span>Notas (opcional)</span><input v-model="form.notes" class="adm-inp" maxlength="300" placeholder="Ej. cómo se le paga, zona que cubre" /></label>
        <fieldset class="pf-pay">
          <legend>Cómo pagarle sus comisiones</legend>
          <label class="adm-field"><span>Nombre del titular</span><input v-model="form.payoutHolder" class="adm-inp" maxlength="80" autocomplete="off" /></label>
          <div class="adm-row2">
            <label class="adm-field"><span>CLABE (18 dígitos)</span><input v-model="form.payoutClabe" class="adm-inp" inputmode="numeric" maxlength="22" autocomplete="off" /></label>
            <label class="adm-field"><span>Banco</span><input v-model="form.payoutBank" class="adm-inp" maxlength="60" autocomplete="off" /></label>
          </div>
          <label class="adm-field">
            <span>O correo de su cuenta de Mercado Pago</span>
            <input v-model="form.payoutMpEmail" class="adm-inp" type="email" autocomplete="off" />
          </label>
        </fieldset>
        <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? "Guardando…" : referrer ? "Guardar" : "Crear vendedor" }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { apiService } from "../../apiService";

const props = defineProps({ referrer: { type: Object, default: null } });
const emit = defineEmits(["close", "saved"]);

const r = props.referrer;
const form = reactive({
  name: r?.name || "",
  email: r?.email || "",
  phone: r?.phone || "",
  state: r?.state || "",
  city: r?.city || "",
  notes: r?.notes || "",
  payoutHolder: r?.payoutHolder || "",
  payoutClabe: r?.payoutClabe || "",
  payoutBank: r?.payoutBank || "",
  payoutMpEmail: r?.payoutMpEmail || "",
});
const saving = ref(false);
const error = ref("");

async function submit() {
  saving.value = true;
  error.value = "";
  try {
    const saved = r ? await apiService.platformUpdateReferrer(r.id, { ...form }) : await apiService.platformCreateReferrer({ ...form });
    emit("saved", saved);
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude guardar al vendedor.";
  } finally {
    saving.value = false;
  }
}

function onKey(e) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>
