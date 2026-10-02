<template>
  <div class="invite-shell">
    <div class="invite-panel">
      <img src="/logo.svg" alt="Mi Tiendita" class="logo" />
      <h1>Únete a <BrandName /></h1>
      <p v-if="loading">Validando invitación…</p>
      <p v-else-if="error" class="err">{{ error }}</p>
      <template v-else>
        <p class="meta">Invitación para <strong>{{ invite.email }}</strong> · rol {{ invite.role }}</p>
        <form @submit.prevent="accept">
          <label>Nombre<input v-model="form.name" required /></label>
          <label>Apellido<input v-model="form.lastName" required /></label>
          <label>Usuario<input v-model="form.username" required /></label>
          <label>Celular<input v-model="form.cellphone" maxlength="10" placeholder="10 dígitos" /></label>
          <label>Contraseña<input v-model="form.password" type="password" required minlength="6" /></label>
          <button type="submit" class="btn" :disabled="saving">{{ saving ? 'Creando…' : 'Aceptar e ingresar' }}</button>
        </form>
        <p v-if="ok" class="ok">Cuenta creada. <router-link to="/login">Inicia sesión</router-link></p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import BrandName from "../components/BrandName.vue";
import { useRoute, useRouter } from "vue-router";
import { apiService } from "../apiService";
import { setSession, homeForRole } from "../authStore";

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const ok = ref(false);
const invite = ref({ email: "", role: "" });
const form = reactive({
  name: "",
  lastName: "",
  username: "",
  cellphone: "",
  password: "",
});

onMounted(async () => {
  try {
    invite.value = await apiService.getInviteByToken(route.params.token);
  } catch (e) {
    error.value = e.response?.data || "Invitación no válida o expirada.";
  } finally {
    loading.value = false;
  }
});

async function accept() {
  saving.value = true;
  error.value = "";
  try {
    const res = await apiService.acceptInvite({
      token: route.params.token,
      ...form,
    });
    if (res.token) {
      setSession({
        token: res.token,
        role: res.role,
        tenantId: res.tenantId,
        username: res.username,
      });
      ok.value = true;
      setTimeout(() => router.push({ name: homeForRole(res.role) }), 800);
    } else {
      ok.value = true;
      setTimeout(() => router.push("/"), 1200);
    }
  } catch (e) {
    error.value = e.response?.data || "No se pudo aceptar la invitación.";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.invite-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: linear-gradient(155deg, #1a2e26, #3d4f42);
  font-family: var(--font-sans);
}
.invite-panel {
  width: 100%;
  max-width: 26rem;
  background: #fffdf9;
  border-radius: 1rem;
  padding: 1.5rem;
}
.logo { width: 3rem; height: 3rem; border-radius: .7rem; }
h1 { font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; letter-spacing: -0.02em; margin: .75rem 0 .35rem; color: #1e5aa8; }
.meta { color: #66706a; font-size: .9rem; }
form { display: grid; gap: .65rem; margin-top: 1rem; }
label { display: grid; gap: .25rem; font-size: .85rem; font-weight: 500; }
input { border: 1px solid #cdd5cf; border-radius: .45rem; padding: .6rem; font: inherit; }
.btn { background: #1e5aa8; color: #fff; border: none; border-radius: .5rem; padding: .7rem; font-weight: 600; cursor: pointer; }
.err { color: #b42318; }
.ok { color: #1b5e20; }
</style>
