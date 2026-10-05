<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="mb-title" @submit.prevent="submit">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico">+</span>
          <div>
            <h3 id="mb-title">{{ title }}</h3>
            <p>Entra con la contraseña inicial y, la primera vez, activa la verificación en dos pasos en su celular.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')">×</button>
        </div>
        <div class="adm-row2">
          <label class="adm-field"><span>Nombre</span><input v-model="form.name" class="adm-inp" required minlength="2" autocomplete="off" /></label>
          <label class="adm-field"><span>Apellido</span><input v-model="form.lastName" class="adm-inp" autocomplete="off" /></label>
        </div>
        <div class="adm-row2">
          <label class="adm-field"><span>Correo</span><input v-model="form.email" class="adm-inp" type="email" required autocomplete="off" /></label>
          <label class="adm-field"><span>Celular</span><input v-model="form.cellphone" class="adm-inp" inputmode="tel" maxlength="14" autocomplete="off" /></label>
        </div>
        <div class="adm-row2">
          <label class="adm-field"><span>Usuario</span><input v-model="form.username" class="adm-inp" required minlength="3" autocomplete="off" /></label>
          <label class="adm-field">
            <span>Perfil</span>
            <select v-model="form.role" class="adm-inp">
              <option value="partner_staff">Asesor</option>
              <option value="partner_admin">Dueño</option>
            </select>
          </label>
        </div>
        <label class="adm-field">
          <span>Contraseña inicial</span>
          <input v-model="form.password" class="adm-inp" type="password" required :minlength="MIN_PASSWORD" autocomplete="new-password" />
          <em>Mínimo {{ MIN_PASSWORD }} caracteres; una frase sirve. Compártela por un medio seguro.</em>
        </label>
        <p class="adm-hint">
          <strong>Asesor</strong> ve y atiende las tiendas. <strong>Dueño</strong> además ve las comisiones, reparte tiendas y maneja al equipo.
        </p>
        <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? "Creando…" : "Crear acceso" }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { MIN_PASSWORD, passwordProblem } from "../../passwordPolicy";

// `save` recibe los datos y crea la cuenta (portal del socio o panel de la plataforma)
const props = defineProps({
  title: { type: String, default: "Nueva persona del equipo" },
  defaultRole: { type: String, default: "partner_staff" },
  save: { type: Function, required: true },
});
const emit = defineEmits(["close", "created"]);

const form = reactive({ name: "", lastName: "", email: "", cellphone: "", username: "", password: "", role: props.defaultRole });
const saving = ref(false);
const error = ref("");

async function submit() {
  const weak = passwordProblem(form.password, { email: form.email, username: form.username, name: form.name });
  if (weak) {
    error.value = weak;
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    emit("created", await props.save({ ...form, username: form.username.trim().toLowerCase() }));
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude crear el acceso.";
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
