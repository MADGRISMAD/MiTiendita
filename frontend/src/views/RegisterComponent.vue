<template>
  <AuthLayout>
    <header class="auth-head">
      <h1>Crea tu tienda</h1>
      <p>14 días gratis. Toma menos de un minuto y puedes cobrar hoy mismo.</p>
    </header>

    <form class="auth-form" novalidate @submit.prevent="register">
      <p v-if="serverError" class="auth-alert" role="alert">
        <PosIcon name="alert" :size="18" />
        <span>{{ serverError }}</span>
      </p>

      <fieldset class="auth-group">
        <legend>Tu negocio</legend>
        <div class="auth-field">
          <label for="reg-shop">Nombre de la tienda <em>(opcional)</em></label>
          <input
            id="reg-shop"
            v-model="businessName"
            class="auth-input"
            type="text"
            maxlength="80"
            placeholder="Ej. Abarrotes Doña Lupe"
            autocomplete="organization"
          />
        </div>
        <div class="auth-row">
          <div class="auth-field">
            <label for="reg-name">Nombre</label>
            <input
              id="reg-name"
              v-model="firstName"
              class="auth-input"
              type="text"
              autocomplete="given-name"
              :aria-invalid="Boolean(shown.firstName)"
              aria-describedby="reg-name-err"
              @blur="touch('firstName')"
            />
            <p v-if="shown.firstName" id="reg-name-err" class="auth-err">{{ shown.firstName }}</p>
          </div>
          <div class="auth-field">
            <label for="reg-last">Apellido</label>
            <input
              id="reg-last"
              v-model="lastName"
              class="auth-input"
              type="text"
              autocomplete="family-name"
              :aria-invalid="Boolean(shown.lastName)"
              aria-describedby="reg-last-err"
              @blur="touch('lastName')"
            />
            <p v-if="shown.lastName" id="reg-last-err" class="auth-err">{{ shown.lastName }}</p>
          </div>
        </div>
        <div class="auth-field">
          <label for="reg-phone">Celular</label>
          <input
            id="reg-phone"
            :value="phoneDisplay"
            class="auth-input"
            type="tel"
            inputmode="numeric"
            placeholder="(664) 123-4567"
            autocomplete="tel-national"
            :aria-invalid="Boolean(shown.phone)"
            aria-describedby="reg-phone-err"
            @input="onPhone"
            @blur="touch('phone')"
          />
          <p v-if="shown.phone" id="reg-phone-err" class="auth-err">{{ shown.phone }}</p>
        </div>
      </fieldset>

      <fieldset class="auth-group">
        <legend>Tu acceso</legend>
        <div class="auth-field">
          <label for="reg-email">Correo electrónico</label>
          <input
            id="reg-email"
            v-model.trim="email"
            class="auth-input"
            type="email"
            placeholder="tu@negocio.com"
            autocomplete="email"
            autocapitalize="none"
            spellcheck="false"
            :aria-invalid="Boolean(shown.email)"
            aria-describedby="reg-email-err"
            @blur="touch('email')"
          />
          <p v-if="shown.email" id="reg-email-err" class="auth-err">{{ shown.email }}</p>
        </div>
        <div class="auth-field">
          <label for="reg-user">Usuario</label>
          <input
            id="reg-user"
            :value="username"
            class="auth-input"
            type="text"
            placeholder="lupe"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            :aria-invalid="Boolean(shown.username)"
            aria-describedby="reg-user-err reg-user-note"
            @input="onUsername"
            @blur="touch('username')"
          />
          <p v-if="shown.username" id="reg-user-err" class="auth-err">{{ shown.username }}</p>
          <p v-else id="reg-user-note" class="auth-note">Con esto o con tu correo entras después.</p>
        </div>
        <div class="auth-field">
          <label for="reg-pass">Contraseña</label>
          <div class="auth-pass">
            <input
              id="reg-pass"
              v-model="password"
              class="auth-input"
              :type="showPass ? 'text' : 'password'"
              placeholder="Mínimo 6 caracteres"
              autocomplete="new-password"
              :aria-invalid="Boolean(shown.password)"
              aria-describedby="reg-pass-err"
              @blur="touch('password')"
            />
            <button
              type="button"
              class="auth-eye"
              :aria-label="showPass ? 'Ocultar contraseñas' : 'Mostrar contraseñas'"
              :aria-pressed="showPass"
              @click="showPass = !showPass"
            >
              <PosIcon :name="showPass ? 'eye-off' : 'eye'" :size="20" />
            </button>
          </div>
          <div v-if="password" class="auth-strength" :class="`s${strength.level}`" aria-live="polite">
            <i></i><i></i><i></i><span>{{ strength.label }}</span>
          </div>
          <p v-if="shown.password" id="reg-pass-err" class="auth-err">{{ shown.password }}</p>
        </div>
        <div class="auth-field">
          <label for="reg-pass2">Confirmar contraseña</label>
          <input
            id="reg-pass2"
            v-model="confirmPassword"
            class="auth-input"
            :type="showPass ? 'text' : 'password'"
            autocomplete="new-password"
            :aria-invalid="Boolean(shown.confirm)"
            aria-describedby="reg-pass2-err"
            @blur="touch('confirm')"
          />
          <p v-if="shown.confirm" id="reg-pass2-err" class="auth-err">{{ shown.confirm }}</p>
        </div>
      </fieldset>

      <label class="auth-check">
        <input v-model="acceptedTerms" type="checkbox" @change="touch('terms')" />
        <span>
          Acepto los <router-link to="/terminos" target="_blank">términos</router-link> y el
          <router-link to="/privacidad" target="_blank">aviso de privacidad</router-link>.
        </span>
      </label>
      <p v-if="shown.terms" class="auth-err">{{ shown.terms }}</p>

      <button type="submit" class="auth-btn" :disabled="loading">
        <span v-if="loading" class="auth-spin" aria-hidden="true"></span>
        {{ loading ? 'Creando tu tienda…' : 'Crear mi tienda' }}
      </button>
    </form>

    <div class="auth-alt">
      <span>¿Ya tienes cuenta? <router-link to="/login" class="inline">Inicia sesión</router-link></span>
    </div>
    <router-link to="/" class="auth-back">← Volver al inicio</router-link>
  </AuthLayout>
</template>

<script>
import { apiService } from "../apiService";
import { setSession } from "../authStore";
import { fetchVenueSettings } from "../venueStore";
import AuthLayout from "../components/AuthLayout.vue";
import PosIcon from "../components/PosIcon.js";
import { isNetworkError } from "../net";
import "../auth.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELD_ORDER = ["firstName", "lastName", "phone", "email", "username", "password", "confirm", "terms"];
const FIELD_ID = {
  firstName: "reg-name",
  lastName: "reg-last",
  phone: "reg-phone",
  email: "reg-email",
  username: "reg-user",
  password: "reg-pass",
  confirm: "reg-pass2",
};

export default {
  components: { AuthLayout, PosIcon },
  data() {
    return {
      businessName: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      username: "",
      usernameEdited: false,
      password: "",
      confirmPassword: "",
      acceptedTerms: false,
      showPass: false,
      touched: {},
      submitted: false,
      serverErrors: {},
      serverError: "",
      loading: false,
    };
  },
  computed: {
    phoneDisplay() {
      const d = this.phone;
      if (d.length <= 3) return d;
      if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    },
    errors() {
      const e = {};
      if (!this.firstName.trim()) e.firstName = "Escribe tu nombre.";
      if (!this.lastName.trim()) e.lastName = "Escribe tu apellido.";
      if (this.phone.length !== 10) e.phone = "El celular debe tener 10 dígitos.";
      if (!EMAIL_RE.test(this.email)) e.email = this.email ? "Ese correo no parece válido." : "Escribe tu correo.";
      if (!this.username) e.username = "Elige un usuario.";
      else if (this.username.length < 3) e.username = "Usa al menos 3 caracteres.";
      if (this.password.length < 6) e.password = "La contraseña debe tener al menos 6 caracteres.";
      if (this.confirmPassword !== this.password) e.confirm = "Las contraseñas no coinciden.";
      if (!this.acceptedTerms) e.terms = "Acepta los términos para continuar.";
      return { ...e, ...this.serverErrors };
    },
    shown() {
      const out = {};
      for (const key of FIELD_ORDER) {
        if (this.errors[key] && (this.submitted || this.touched[key] || this.serverErrors[key])) out[key] = this.errors[key];
      }
      return out;
    },
    strength() {
      const p = this.password;
      let score = 0;
      if (p.length >= 8) score += 1;
      if (/[a-zA-Z]/.test(p) && /\d/.test(p)) score += 1;
      if (/[^a-zA-Z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score += 1;
      if (p.length < 6) return { level: 1, label: "Muy corta" };
      if (score <= 1) return { level: 1, label: "Débil" };
      if (score === 2) return { level: 2, label: "Aceptable" };
      return { level: 3, label: "Fuerte" };
    },
  },
  watch: {
    email(value) {
      delete this.serverErrors.email;
      // Sugiere el usuario a partir del correo mientras no lo hayan escrito
      if (!this.usernameEdited) this.username = this.cleanUsername(String(value).split("@")[0]);
    },
    username() {
      delete this.serverErrors.username;
    },
  },
  methods: {
    touch(field) {
      this.touched = { ...this.touched, [field]: true };
    },
    cleanUsername(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 30);
    },
    onUsername(e) {
      this.usernameEdited = true;
      this.username = this.cleanUsername(e.target.value);
      e.target.value = this.username;
    },
    onPhone(e) {
      // Solo dígitos; acepta pegar "+52 664 123 4567"
      let digits = String(e.target.value || "").replace(/\D/g, "");
      if (digits.length > 10 && digits.startsWith("52")) digits = digits.slice(2);
      this.phone = digits.slice(0, 10);
      e.target.value = this.phoneDisplay;
    },
    focusFirstError() {
      const first = FIELD_ORDER.find((key) => this.shown[key]);
      const id = FIELD_ID[first];
      if (id) document.getElementById(id)?.focus();
    },
    mapServerError(text) {
      const msg = String(text || "");
      if (/nombre de usuario/i.test(msg)) return { field: "username", text: "Ese usuario ya existe. Prueba con otro." };
      if (/correo ya registrado/i.test(msg)) return { field: "email", text: "Ya hay una cuenta con ese correo. Inicia sesión o recupera tu contraseña." };
      if (/"email"/.test(msg)) return { field: "email", text: "Ese correo no parece válido." };
      if (/"cellphone"/.test(msg)) return { field: "phone", text: "El celular debe tener 10 dígitos." };
      return { field: "", text: msg || "No se pudo crear la cuenta. Inténtalo de nuevo." };
    },
    async register() {
      this.submitted = true;
      this.serverError = "";
      if (Object.keys(this.errors).length) {
        this.$nextTick(() => this.focusFirstError());
        return;
      }
      this.loading = true;
      try {
        const payload = {
          name: this.firstName.trim(),
          lastName: this.lastName.trim(),
          email: this.email.toLowerCase(),
          username: this.username,
          password: this.password,
          cellphone: this.phone,
        };
        if (this.businessName.trim()) payload.businessName = this.businessName.trim();
        const res = await apiService.register(payload);
        setSession({
          token: res.token,
          role: res.role,
          tenantId: res.tenantId,
          username: res.username,
          email: res.email || payload.email,
        });
        // Así el asistente de configuración ya trae el nombre de la tienda
        if (payload.businessName) await fetchVenueSettings().catch(() => {});
        this.$router.push("/setup");
      } catch (e) {
        if (isNetworkError(e)) {
          this.serverError = "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
          return;
        }
        const data = e.response?.data;
        const { field, text } = this.mapServerError(typeof data === "string" ? data : data?.message);
        if (field) {
          this.serverErrors = { ...this.serverErrors, [field]: text };
          this.$nextTick(() => this.focusFirstError());
        } else {
          this.serverError = text;
        }
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
