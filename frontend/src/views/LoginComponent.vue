<template>
  <AuthLayout>
    <header class="auth-head">
      <h1>Bienvenido de vuelta</h1>
      <p>Entra para abrir tu caja y empezar a vender.</p>
    </header>

    <form class="auth-form" novalidate @submit.prevent="login">
      <p v-if="error" class="auth-alert" role="alert">
        <PosIcon name="alert" :size="18" />
        <span>{{ error }}</span>
      </p>

      <div class="auth-field">
        <label for="login-user">Usuario o correo</label>
        <input
          id="login-user"
          ref="userInput"
          v-model.trim="username"
          class="auth-input"
          type="text"
          placeholder="tu@negocio.com"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          :aria-invalid="missing.username"
          @input="missing.username = false"
        />
      </div>

      <div class="auth-field">
        <div class="auth-field-top">
          <label for="login-pass">Contraseña</label>
          <router-link to="/forgot">¿La olvidaste?</router-link>
        </div>
        <div class="auth-pass">
          <input
            id="login-pass"
            ref="passInput"
            v-model="password"
            class="auth-input"
            :type="showPass ? 'text' : 'password'"
            placeholder="Tu contraseña"
            autocomplete="current-password"
            :aria-invalid="missing.password"
            @input="missing.password = false"
            @keydown="checkCaps"
            @keyup="checkCaps"
          />
          <button
            type="button"
            class="auth-eye"
            :aria-label="showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            :aria-pressed="showPass"
            @click="showPass = !showPass"
          >
            <PosIcon :name="showPass ? 'eye-off' : 'eye'" :size="20" />
          </button>
        </div>
        <p v-if="capsOn" class="auth-warn">Bloq Mayús está activado.</p>
      </div>

      <button type="submit" class="auth-btn" :disabled="loading">
        <span v-if="loading" class="auth-spin" aria-hidden="true"></span>
        {{ loading ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>

    <div class="auth-alt">
      <span>¿Aún no tienes cuenta?</span>
      <router-link to="/register" class="auth-btn ghost">Crear mi tienda gratis</router-link>
    </div>
    <router-link to="/" class="auth-back">← Volver al inicio</router-link>
  </AuthLayout>
</template>

<script>
import { apiService } from "../apiService";
import { setSession, homeForRole } from "../authStore";
import { fetchVenueSettings, isSetupComplete } from "../venueStore";
import AuthLayout from "../components/AuthLayout.vue";
import PosIcon from "../components/PosIcon.js";
import { isNetworkError } from "../net";
import "../auth.css";

export default {
  components: { AuthLayout, PosIcon },
  data() {
    return {
      username: "",
      password: "",
      error: "",
      loading: false,
      showPass: false,
      capsOn: false,
      missing: { username: false, password: false },
    };
  },
  mounted() {
    this.$refs.userInput?.focus();
  },
  methods: {
    checkCaps(e) {
      if (typeof e.getModifierState === "function") this.capsOn = e.getModifierState("CapsLock");
    },
    async login() {
      this.error = "";
      this.missing.username = !this.username;
      this.missing.password = !this.password;
      if (this.missing.username || this.missing.password) {
        this.error = "Escribe tu usuario (o correo) y tu contraseña.";
        (this.missing.username ? this.$refs.userInput : this.$refs.passInput)?.focus();
        return;
      }
      this.loading = true;
      try {
        const res = await apiService.login(this.username, this.password);
        setSession({
          token: res.token,
          role: res.role,
          tenantId: res.tenantId,
          username: res.username,
          email: res.email,
        });
        await fetchVenueSettings();
        if (res.role === "admin" && !isSetupComplete()) {
          this.$router.push("/setup");
        } else {
          this.$router.push({ name: homeForRole(res.role) });
        }
      } catch (e) {
        if (isNetworkError(e)) {
          this.error = "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
        } else {
          this.error = typeof e.response?.data === "string" && e.response.data
            ? e.response.data
            : "Usuario o contraseña incorrectos.";
        }
        this.password = "";
        this.$nextTick(() => this.$refs.passInput?.focus());
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
