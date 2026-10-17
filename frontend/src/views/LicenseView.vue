<template>
  <AuthLayout>
    <header class="auth-head">
      <h1>{{ title }}</h1>
      <p>{{ text }}</p>
    </header>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <p v-if="error" class="auth-alert" role="alert"><PosIcon name="alert" :size="18" /><span>{{ error }}</span></p>
      <div class="auth-field">
        <label for="lic-code">Código de licencia</label>
        <input id="lic-code" :value="code" class="auth-input license-input" maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" @input="onCode" />
      </div>
      <div class="auth-field">
        <label for="lic-email">Correo con el que compraste</label>
        <input id="lic-email" v-model.trim="email" class="auth-input" type="email" autocomplete="email" autocapitalize="none" />
      </div>
      <button type="submit" class="auth-btn" :disabled="loading || code.replace(/-/g, '').length !== 20">
        <span v-if="loading" class="auth-spin" aria-hidden="true"></span>{{ loading ? "Reactivando…" : "Reactivar con internet" }}
      </button>
      <p class="auth-note">Tus ventas, productos y clientes siguen guardados en esta computadora. Si cambiaste de computadora, pide a soporte que libere tu licencia.</p>
    </form>
  </AuthLayout>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import PosIcon from "../components/PosIcon.js";
import { desktopStore, reactivateLicense } from "../desktopStore";
import "../auth.css";

const router = useRouter();
const code = ref("");
const email = ref(desktopStore.owner?.email || "");
const loading = ref(false);
const error = ref("");
const title = computed(() => (desktopStore.status === "other_device" ? "Esta licencia es de otra computadora" : "Hay que reactivar la licencia"));
const text = computed(() =>
  desktopStore.status === "other_device"
    ? "Mi Tiendita se activó en otra computadora. Para usarla aquí, reactívala con tu código (necesitas internet)."
    : "No se pudo validar la licencia de esta computadora. Reactívala con tu código (necesitas internet)."
);
function onCode(e) {
  const raw = String(e.target.value || "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "").slice(0, 20);
  code.value = raw.match(/.{1,4}/g)?.join("-") || "";
  e.target.value = code.value;
}
async function submit() {
  loading.value = true;
  error.value = "";
  try {
    const s = await reactivateLicense(code.value, email.value.toLowerCase());
    if (s.status === "ok") router.replace("/");
  } catch (e) {
    error.value = e?.response?.data?.message || "No se pudo reactivar. Revisa tu internet e inténtalo de nuevo.";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.license-input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; }
</style>
