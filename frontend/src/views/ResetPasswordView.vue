<template>
  <div class="auth-shell">
    <div class="panel">
      <h1>Nueva contraseña</h1>
      <form @submit.prevent="submit">
        <label>Contraseña<input v-model="password" type="password" minlength="6" required /></label>
        <label>Confirmar<input v-model="confirm" type="password" minlength="6" required /></label>
        <button type="submit" class="btn" :disabled="loading">{{ loading ? 'Guardando…' : 'Guardar' }}</button>
      </form>
      <p v-if="msg" class="ok">{{ msg }}</p>
      <p v-if="err" class="err">{{ err }}</p>
      <router-link to="/login">Ir al login</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiService } from "../apiService";

const route = useRoute();
const router = useRouter();
const password = ref("");
const confirm = ref("");
const loading = ref(false);
const msg = ref("");
const err = ref("");

async function submit() {
  err.value = "";
  if (password.value !== confirm.value) {
    err.value = "Las contraseñas no coinciden";
    return;
  }
  loading.value = true;
  try {
    await apiService.resetPassword(String(route.params.token), password.value);
    msg.value = "Contraseña actualizada. Ya puedes ingresar.";
    setTimeout(() => router.push("/"), 1200);
  } catch (e) {
    err.value = e.response?.data || "Token inválido o expirado";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-shell { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; background: var(--timber-surface); }
.panel { width: min(24rem, 100%); background: var(--timber-panel); border: 1px solid var(--timber-line); border-radius: 1rem; padding: 1.4rem; display: grid; gap: .7rem; }
h1 { margin: 0; font-size: 1.35rem; font-weight: 800; }
label { display: grid; gap: .3rem; font-size: .85rem; font-weight: 600; }
input { border: 1px solid var(--timber-line); border-radius: .65rem; padding: .7rem; background: var(--timber-panel-elevated); color: var(--timber-ink); }
.btn { border: none; border-radius: .7rem; padding: .75rem; background: var(--timber-primary); color: var(--timber-on-primary); font-weight: 700; cursor: pointer; }
.ok { color: var(--timber-success); margin: 0; }
.err { color: var(--timber-danger); margin: 0; }
a { color: var(--timber-primary); font-weight: 600; }
</style>
