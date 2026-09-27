<template>
  <div class="auth-shell">
    <div class="auth-atmosphere" aria-hidden="true"></div>

    <div class="auth-panel">
      <div class="brand-block">
        <img src="/logo.svg" alt="Mi Tiendita" class="brand-logo" />
        <h1 class="brand-name"><BrandName /></h1>
        <p class="brand-tagline">Crea la cuenta de administración</p>
      </div>

      <h2 class="auth-heading">Registro</h2>
      <form @submit.prevent="register" class="auth-form">
        <div class="grid-2">
          <label class="field">
            <span>Nombre</span>
            <input v-model="firstName" type="text" placeholder="Nombre" autocomplete="given-name" required />
          </label>
          <label class="field">
            <span>Apellido</span>
            <input v-model="lastName" type="text" placeholder="Apellido" autocomplete="family-name" required />
          </label>
        </div>

        <label class="field">
          <span>Número telefónico</span>
          <input
            id="cellphone"
            v-model="cellphone"
            type="tel"
            maxlength="14"
            placeholder="(xxx)-xxx-xxxx"
            autocomplete="tel"
            required
          />
          <span v-if="formatCellphoneError" class="error-inline">Formato de número incorrecto</span>
        </label>

        <label class="field">
          <span>Usuario</span>
          <input v-model="username" type="text" placeholder="Usuario" autocomplete="username" required />
        </label>

        <label class="field">
          <span>Correo electrónico</span>
          <input v-model="email" type="email" placeholder="tu@negocio.com" autocomplete="email" required />
        </label>

        <label class="field">
          <span>Contraseña</span>
          <input v-model="password" type="password" placeholder="••••••••" autocomplete="new-password" required />
        </label>

        <label class="field">
          <span>Confirmar contraseña</span>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="new-password"
            required
          />
          <span v-if="differentsPassword" class="error-inline">Las contraseñas no coinciden</span>
        </label>

        <label class="terms">
          <input v-model="acceptedTerms" type="checkbox" required />
          <span>
            Acepto los
            <router-link to="/terminos">términos</router-link>
            y el
            <router-link to="/privacidad">aviso de privacidad</router-link>.
            Prueba de 14 días.
          </span>
        </label>

        <button type="submit" class="btn-primary" :disabled="loading || !acceptedTerms">
          {{ loading ? 'Registrando…' : 'Registrar' }}
        </button>

        <router-link v-if="confirmRequest" to="/setup" class="success-link">
          Registro exitoso. Continúa con la configuración
        </router-link>
        <p v-if="onError" class="error-text">{{ Error }}</p>
      </form>

      <router-link to="/login" class="auth-link">¿Ya tienes cuenta? Iniciar sesión</router-link>
      <router-link to="/" class="auth-link">← Volver al inicio</router-link>
    </div>
  </div>
</template>

<script>
import { apiService } from "../apiService";
import { setSession } from "../authStore";
import BrandName from "../components/BrandName.vue";

export default {
  components: { BrandName },
  data() {
    return {
      firstName: "",
      lastName: "",
      cellphone: "",
      username: "",
      email: "",
      password: "",
      formatCellphoneError: false,
      confirmPassword: "",
      differentsPassword: false,
      confirmRequest: false,
      Error: "",
      onError: false,
      loading: false,
      acceptedTerms: false,
    };
  },
  watch: {
    // Antes esto era una propiedad computed que nunca se usaba en el template,
    // por eso no se ejecutaba. Como watcher sí se dispara al escribir.
    cellphone(value) {
      const num = value.replace(/[\s()\-]/g, "");
      if (/\D/.test(num)) {
        this.formatCellphoneError = true;
        return;
      }
      this.formatCellphoneError = false;
      if (num.length === 10) {
        this.cellphone =
          "(" + num.substring(0, 3) + ")-" + num.substring(3, 6) + "-" + num.substring(6, 10);
      }
    },
    confirmPassword() {
      this.differentsPassword = false;
    },
    password() {
      this.differentsPassword = false;
    },
  },
  methods: {
    async register() {
      this.onError = false;
      this.Error = "";
      try {
        if (this.formatCellphoneError) {
          document.getElementById("cellphone").focus();
          return;
        }
        if (this.password !== this.confirmPassword) {
          this.differentsPassword = true;
          document.getElementById("confirmPassword").focus();
          return;
        }
        const num = this.cellphone.replace(/[\s()\-]/g, "");
        if (num.length !== 10) {
          document.getElementById("cellphone").focus();
          this.formatCellphoneError = true;
          return;
        }

        if (!this.acceptedTerms) {
          this.onError = true;
          this.Error = "Debes aceptar los términos y el aviso de privacidad.";
          return;
        }

        this.loading = true;
        const request = await apiService.register({
          name: this.firstName,
          lastName: this.lastName,
          email: this.email,
          username: this.username,
          password: this.password,
          cellphone: num,
        });
        setSession({
          token: request.token,
          role: request.role,
          tenantId: request.tenantId,
          username: request.username,
        });
        this.confirmRequest = true;
        this.$router.push("/setup");
      } catch (error) {
        this.onError = true;
        const data = error.response?.data;
        this.Error = typeof data === "string" ? data : error.message;
        console.error(error);
      } finally {
        this.loading = false;
      }
    },
  },
};
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
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
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

.terms {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--timber-muted, #64748b);
  line-height: 1.4;
}
.terms input { margin-top: 0.2rem; }
.terms a { color: var(--timber-primary, #1e5aa8); font-weight: 700; }

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

.error-inline { color: #b42318; font-size: 0.8rem; font-weight: 500; }
.error-text { margin: 0; text-align: center; color: #b42318; font-size: 0.85rem; }
.success-link {
  display: block;
  text-align: center;
  color: var(--timber-primary, #1e5aa8);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
}
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
@media (max-width: 480px) {
  .grid-2 { grid-template-columns: 1fr; }
}
</style>