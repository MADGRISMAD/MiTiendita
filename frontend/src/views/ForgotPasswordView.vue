<template>
  <div class="auth-shell">
    <div class="auth-atmosphere" aria-hidden="true"></div>

    <div class="auth-panel">
      <div class="brand-block">
        <img src="/logo.svg" alt="Mi Tiendita" class="brand-logo" />
        <h1 class="brand-name"><BrandName /></h1>
        <p class="brand-tagline">Te enviaremos un enlace a tu correo para elegir una nueva contraseña</p>
      </div>

      <h2 class="auth-heading">Recuperar contraseña</h2>
      <form @submit.prevent="submit" class="auth-form">
        <label class="field">
          <span>Correo electrónico</span>
          <input
            v-model="email"
            type="email"
            placeholder="tu@negocio.com"
            autocomplete="email"
            required
          />
        </label>

        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Enviando…' : 'Enviar enlace' }}
        </button>

        <p v-if="msg" class="success-text">{{ msg }}</p>
        <p v-if="err" class="error-text">{{ err }}</p>
      </form>

      <router-link to="/login" class="auth-link">← Volver al login</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { apiService } from "../apiService";
import BrandName from "../components/BrandName.vue";

const email = ref("");
const loading = ref(false);
const msg = ref("");
const err = ref("");

async function submit() {
  loading.value = true;
  msg.value = "";
  err.value = "";
  try {
    await apiService.forgotPassword(email.value);
    msg.value = "Revisa tu correo. Si la cuenta existe, te enviamos el enlace.";
  } catch (e) {
    const data = e.response?.data;
    err.value = typeof data === "string" ? data : "No se pudo enviar";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-shell {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  font-family: var(--font-sans);
}
.auth-atmosphere {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 50% at 12% 18%, rgba(224, 138, 30, 0.22), transparent 55%),
    radial-gradient(ellipse 55% 40% at 88% 78%, rgba(30, 90, 168, 0.4), transparent 50%),
    linear-gradient(155deg, #0a1a30 0%, #123056 42%, #1e5aa8 100%);
}
.auth-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 28rem;
  background: var(--timber-panel, #ffffff);
  border-radius: 1.15rem;
  padding: 1.75rem 1.5rem 1.4rem;
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.28);
}
.brand-block { text-align: center; margin-bottom: 1.5rem; }
.brand-logo {
  width: 3.6rem; height: 3.6rem; border-radius: 0.95rem;
  margin: 0 auto 0.85rem; display: block;
}
.brand-name {
  font-family: var(--font-display);
  font-size: 1.9rem;
  letter-spacing: -0.03em;
  margin: 0;
  color: var(--timber-primary, #1e5aa8);
  font-weight: 800;
}
.brand-tagline { margin: 0.4rem 0 0; color: var(--timber-muted, #64748b); font-size: 0.92rem; }
.auth-heading { font-size: 1.05rem; font-weight: 600; margin: 0 0 1rem; }
.auth-form { display: grid; gap: 0.9rem; }
.field { display: grid; gap: 0.35rem; font-size: 0.85rem; font-weight: 500; }
.field input {
  border: 1px solid var(--timber-line, rgba(26, 35, 50, 0.18));
  border-radius: 0.7rem;
  padding: 0.75rem 0.85rem;
  font: inherit;
  background: transparent;
  color: inherit;
  caret-color: currentColor;
  min-width: 0;
}
.field input:focus {
  outline: none;
  border-color: var(--timber-primary, #1e5aa8);
  box-shadow: 0 0 0 3px rgba(30, 90, 168, 0.25);
}
.field input::placeholder {
  color: var(--timber-muted, #94a3b8);
  opacity: 1;
}
.field input:-webkit-autofill,
.field input:-webkit-autofill:focus {
  -webkit-text-fill-color: currentColor;
  -webkit-box-shadow: 0 0 0 1000px var(--timber-panel, #fff) inset;
  transition: background-color 9999s ease-out 0s;
}

.btn-primary {
  margin-top: 0.25rem;
  border: none;
  border-radius: 0.7rem;
  padding: 0.8rem;
  background: var(--timber-primary, #1e5aa8);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.btn-primary:hover:not(:disabled) { filter: brightness(0.82); }
.btn-primary:active:not(:disabled) { filter: brightness(0.72); }
.btn-primary:focus-visible {
  outline: 2px solid var(--timber-primary, #1e5aa8);
  outline-offset: 2px;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.success-text { margin: 0; text-align: center; color: var(--timber-success, #147a3d); font-size: 0.85rem; }
.error-text { margin: 0; text-align: center; color: #b42318; font-size: 0.85rem; }
.auth-link {
  display: block;
  text-align: center;
  margin-top: 0.75rem;
  color: var(--timber-primary, #1e5aa8);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
}
.auth-link:hover,
.auth-link:focus-visible {
  text-decoration: underline;
}
.auth-link:focus-visible {
  outline: 2px solid var(--timber-primary, #1e5aa8);
  outline-offset: 3px;
  border-radius: 0.3rem;
}
</style>