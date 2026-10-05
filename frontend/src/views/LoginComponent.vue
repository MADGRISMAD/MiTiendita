<template>
  <AuthLayout>
    <!-- Paso 2: código de la app de autenticación -->
    <template v-if="step === 'code'">
      <header class="auth-head">
        <h1>Verificación en dos pasos</h1>
        <p>Escribe el código de 6 dígitos de tu app de autenticación.</p>
      </header>
      <form class="auth-form" novalidate @submit.prevent="submitCode">
        <p v-if="error" class="auth-alert" role="alert">
          <PosIcon name="alert" :size="18" />
          <span>{{ error }}</span>
        </p>
        <div class="auth-field">
          <label for="login-code">{{ useRecovery ? 'Código de respaldo' : 'Código' }}</label>
          <input
            id="login-code"
            ref="codeInput"
            v-model.trim="code"
            class="auth-input auth-code"
            type="text"
            :inputmode="useRecovery ? 'text' : 'numeric'"
            :autocomplete="useRecovery ? 'off' : 'one-time-code'"
            :maxlength="useRecovery ? 9 : 6"
            :placeholder="useRecovery ? 'ABCD-EFGH' : '123456'"
          />
        </div>
        <button type="submit" class="auth-btn" :disabled="loading">
          <span v-if="loading" class="auth-spin" aria-hidden="true"></span>
          {{ loading ? 'Verificando…' : 'Entrar' }}
        </button>
        <button type="button" class="auth-link-btn" @click="toggleRecovery">
          {{ useRecovery ? 'Usar el código de la app' : '¿Perdiste el celular? Usa un código de respaldo' }}
        </button>
      </form>
      <button type="button" class="auth-back" @click="restart">← Volver</button>
    </template>

    <!-- Equipo de la plataforma: activar 2FA es obligatorio -->
    <template v-else-if="step === 'setup'">
      <header class="auth-head">
        <h1>Activa la verificación en dos pasos</h1>
        <p>El equipo de Mi Tiendita la necesita para entrar. Escanea el código con Google Authenticator, Authy o similar.</p>
      </header>
      <div class="auth-form">
        <p v-if="error" class="auth-alert" role="alert">
          <PosIcon name="alert" :size="18" />
          <span>{{ error }}</span>
        </p>
        <template v-if="recoveryCodes.length">
          <p class="auth-note">
            <strong>Guarda estos códigos de respaldo</strong> en un lugar seguro. Cada uno sirve una vez si pierdes el celular.
          </p>
          <ul class="auth-codes">
            <li v-for="c in recoveryCodes" :key="c">{{ c }}</li>
          </ul>
          <button type="button" class="auth-btn" @click="finish(pendingSession)">Ya los guardé, entrar</button>
        </template>
        <form v-else class="auth-form" novalidate @submit.prevent="submitSetup">
          <img v-if="qr" :src="qr" alt="Código QR para tu app de autenticación" class="auth-qr" />
          <p class="auth-note">¿No puedes escanear? Escribe esta clave: <code>{{ setupSecret }}</code></p>
          <div class="auth-field">
            <label for="setup-code">Código de 6 dígitos</label>
            <input
              id="setup-code"
              ref="codeInput"
              v-model.trim="code"
              class="auth-input auth-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="123456"
            />
          </div>
          <button type="submit" class="auth-btn" :disabled="loading || !setupSecret">
            {{ loading ? 'Activando…' : 'Activar y entrar' }}
          </button>
        </form>
      </div>
      <button type="button" class="auth-back" @click="restart">← Volver</button>
    </template>

    <template v-else>
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
    </template>
  </AuthLayout>
</template>

<script>
import { apiService } from "../apiService";
import { setSession, homeForRole } from "../authStore";
import { fetchVenueSettings, isSetupComplete } from "../venueStore";
import AuthLayout from "../components/AuthLayout.vue";
import PosIcon from "../components/PosIcon.js";
import { isNetworkError } from "../net";
import QRCode from "qrcode";
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
      step: "password", // 'password' | 'code' | 'setup'
      mfaToken: "",
      code: "",
      useRecovery: false,
      setupSecret: "",
      qr: "",
      recoveryCodes: [],
      pendingSession: null,
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
        this.password = "";
        if (res.mfaRequired) {
          this.mfaToken = res.mfaToken;
          this.goTo("code");
        } else if (res.mfaSetupRequired) {
          this.mfaToken = res.mfaToken;
          this.goTo("setup");
          await this.prepareSetup();
        } else {
          await this.finish(res);
        }
      } catch (e) {
        this.error = this.messageOf(e, "Usuario o contraseña incorrectos.");
        this.password = "";
        this.$nextTick(() => this.$refs.passInput?.focus());
      } finally {
        this.loading = false;
      }
    },
    messageOf(e, fallback) {
      if (isNetworkError(e)) return "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
      return typeof e.response?.data === "string" && e.response.data ? e.response.data : fallback;
    },
    goTo(step) {
      this.step = step;
      this.error = "";
      this.code = "";
      this.useRecovery = false;
      this.$nextTick(() => this.$refs.codeInput?.focus());
    },
    restart() {
      this.step = "password";
      this.error = "";
      this.code = "";
      this.mfaToken = "";
      this.setupSecret = "";
      this.qr = "";
      this.recoveryCodes = [];
      this.pendingSession = null;
      this.$nextTick(() => this.$refs.passInput?.focus());
    },
    toggleRecovery() {
      this.useRecovery = !this.useRecovery;
      this.code = "";
      this.$nextTick(() => this.$refs.codeInput?.focus());
    },
    async submitCode() {
      if (!this.code) {
        this.error = "Escribe el código.";
        return;
      }
      this.loading = true;
      this.error = "";
      try {
        await this.finish(await apiService.loginMfa(this.mfaToken, this.code));
      } catch (e) {
        this.error = this.messageOf(e, "Código incorrecto.");
        if (e.response?.status === 401 && /terminó|Vuelve a entrar/.test(this.error)) this.restart();
        this.code = "";
      } finally {
        this.loading = false;
      }
    },
    async prepareSetup() {
      try {
        const res = await apiService.mfaSetup(this.mfaToken);
        this.setupSecret = res.secret;
        this.qr = await QRCode.toDataURL(res.otpauthUrl, { width: 220, margin: 1 });
      } catch (e) {
        this.error = this.messageOf(e, "No se pudo preparar la verificación. Vuelve a entrar.");
      }
    },
    async submitSetup() {
      if (!/^\d{6}$/.test(this.code)) {
        this.error = "Escribe los 6 dígitos que muestra tu app.";
        return;
      }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiService.mfaEnable(this.code, this.mfaToken);
        this.recoveryCodes = res.recoveryCodes || [];
        this.pendingSession = res;
        if (!this.recoveryCodes.length) await this.finish(res);
      } catch (e) {
        this.error = this.messageOf(e, "Código incorrecto.");
        this.code = "";
      } finally {
        this.loading = false;
      }
    },
    async finish(res) {
      setSession({
        token: res.token,
        role: res.role,
        tenantId: res.tenantId,
        partnerId: res.partnerId || null,
        username: res.username,
        email: res.email,
      });
      // Solo las cuentas de tienda tienen configuración de tienda
      if (res.tenantId) await fetchVenueSettings();
      if (res.role === "admin" && !isSetupComplete()) {
        this.$router.push("/setup");
      } else {
        this.$router.push({ name: homeForRole(res.role) });
      }
    },
  },
};
</script>
