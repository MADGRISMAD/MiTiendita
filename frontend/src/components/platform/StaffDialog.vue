<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="st-title" @submit.prevent="submit">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico">+</span>
          <div>
            <h3 id="st-title">Nueva persona del equipo</h3>
            <p>Al entrar por primera vez tendrá que activar la verificación en dos pasos.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')">×</button>
        </div>
        <div class="adm-row2">
          <label class="adm-field"><span>Nombre</span><input v-model="form.name" class="adm-inp" required minlength="2" autocomplete="off" /></label>
          <label class="adm-field"><span>Apellido</span><input v-model="form.lastName" class="adm-inp" required autocomplete="off" /></label>
        </div>
        <label class="adm-field"><span>Correo</span><input v-model="form.email" class="adm-inp" type="email" required autocomplete="off" /></label>
        <div class="adm-row2">
          <label class="adm-field"><span>Usuario</span><input v-model="form.username" class="adm-inp" required minlength="3" autocomplete="off" /></label>
          <label class="adm-field">
            <span>Perfil</span>
            <select v-model="form.role" class="adm-inp">
              <option value="platform_support">Soporte</option>
              <option value="platform_admin">Admin</option>
            </select>
          </label>
        </div>
        <label class="adm-field">
          <span>Contraseña inicial</span>
          <input v-model="form.password" class="adm-inp" type="password" required :minlength="MIN_PASSWORD" autocomplete="new-password" />
          <em>Mínimo {{ MIN_PASSWORD }} caracteres; una frase sirve.</em>
        </label>
        <p class="adm-hint">
          <strong>Soporte</strong> ve clientes y responde sus tickets. <strong>Admin</strong> además cambia planes y licencias, ve el dinero y maneja al equipo.
        </p>
        <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? "Creando…" : "Crear" }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { apiService } from "../../apiService";
import { MIN_PASSWORD, passwordProblem } from "../../passwordPolicy";

const emit = defineEmits(["close", "created"]);

const form = reactive({ name: "", lastName: "", email: "", username: "", password: "", role: "platform_support" });
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
    emit("created", await apiService.platformCreateStaff({ ...form }));
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude crear a esa persona.";
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
