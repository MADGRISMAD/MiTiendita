<template>
  <AuthLayout wide>
    <!-- Solicitud de proveedor enviada -->
    <section v-if="partnerSent" class="auth-done" role="status">
      <span class="auth-done-ico" aria-hidden="true">✓</span>
      <h1>¡Recibimos tu solicitud!</h1>
      <p>
        Revisamos tus datos y te escribimos a <strong>{{ email }}</strong>. Mientras, ya puedes entrar a tu portal de proveedor
        con tu usuario <strong>{{ username }}</strong>: la primera vez activarás la verificación en dos pasos.
      </p>
      <p class="auth-note">Tu código para registrar tiendas se activa cuando aprobemos tu solicitud.</p>
      <router-link class="auth-btn" to="/login">Entrar a mi portal</router-link>
    </section>

    <template v-else>
    <header class="auth-head">
      <h1>{{ isPartner ? "Sé proveedor oficial" : "Crea tu tienda" }}</h1>
      <p v-if="isPartner">Vende Mi Tiendita en tu zona y gana del 10% al 20% de cada cobro de las tiendas que traigas.</p>
      <p v-else>14 días gratis. Toma menos de un minuto y puedes cobrar hoy mismo.</p>
    </header>

    <div class="auth-kind" role="radiogroup" aria-label="¿Qué quieres crear?">
      <button type="button" role="radio" :aria-checked="!isPartner" :class="{ on: !isPartner }" @click="setKind('store')">
        <strong>Mi tienda</strong>
        <small>Para cobrar y llevar inventario</small>
      </button>
      <button type="button" role="radio" :aria-checked="isPartner" :class="{ on: isPartner }" @click="setKind('partner')">
        <strong>Proveedor oficial</strong>
        <small>Para vender Mi Tiendita a tiendas</small>
      </button>
    </div>

    <form class="auth-form" novalidate @submit.prevent="register">
      <p v-if="serverError" class="auth-alert" role="alert">
        <PosIcon name="alert" :size="18" />
        <span>{{ serverError }}</span>
      </p>

      <fieldset class="auth-group">
        <legend>Tus datos</legend>
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
        <div class="auth-row">
          <div v-if="!isPartner" class="auth-field">
            <label for="reg-shop">Nombre de la tienda <em>(opcional)</em></label>
            <input
              id="reg-shop"
              v-model="businessName"
              class="auth-input"
              type="text"
              maxlength="80"
              placeholder="Ej. Abarrotes Lupe"
              autocomplete="organization"
            />
          </div>
          <div class="auth-field">
            <label for="reg-phone">Celular</label>
            <input
              id="reg-phone"
              :value="phoneDisplay"
              class="auth-input"
              type="tel"
              inputmode="numeric"
              placeholder="55 1234 5678"
              autocomplete="tel-national"
              :aria-invalid="Boolean(shown.phone)"
              aria-describedby="reg-phone-err"
              @input="onPhone"
              @blur="touch('phone')"
            />
            <p v-if="shown.phone" id="reg-phone-err" class="auth-err">{{ shown.phone }}</p>
          </div>
        </div>
        <div v-if="isPartner" class="auth-row">
          <div class="auth-field">
            <label for="reg-state">Estado</label>
            <input
              id="reg-state"
              v-model="partnerState"
              class="auth-input"
              type="text"
              maxlength="60"
              placeholder="Ej. Sonora"
              autocomplete="address-level1"
              :aria-invalid="Boolean(shown.state)"
              aria-describedby="reg-state-err"
              @blur="touch('state')"
            />
            <p v-if="shown.state" id="reg-state-err" class="auth-err">{{ shown.state }}</p>
          </div>
          <div class="auth-field">
            <label for="reg-city">Ciudad <em>(opcional)</em></label>
            <input id="reg-city" v-model="partnerCity" class="auth-input" type="text" maxlength="60" autocomplete="address-level2" />
          </div>
        </div>
        <div v-if="!isPartner" class="auth-field">
          <label for="reg-ref">Código de vendedor <em>(opcional)</em></label>
          <input
            id="reg-ref"
            v-model="referralCode"
            class="auth-input"
            type="text"
            maxlength="12"
            placeholder="MT-XXXXXX"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            @input="onReferral"
          />
          <p v-if="referralState === 'ok'" class="auth-note" role="status">✓ Te atiende {{ referralSeller }}.</p>
          <p v-else-if="referralState === 'bad'" class="auth-err" role="alert">Ese código no existe o ya no está activo. Revísalo o déjalo vacío.</p>
          <p v-else class="auth-note">Si te recomendó un vendedor de Mi Tiendita, escribe su código.</p>
        </div>
      </fieldset>

      <fieldset class="auth-group">
        <legend>Tu acceso</legend>
        <div class="auth-row">
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
            <label for="reg-user">Usuario <em>(para entrar)</em></label>
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
              aria-describedby="reg-user-err"
              @input="onUsername"
              @blur="touch('username')"
            />
            <p v-if="shown.username" id="reg-user-err" class="auth-err">{{ shown.username }}</p>
          </div>
        </div>
        <div class="auth-row">
          <div class="auth-field">
            <label for="reg-pass">Contraseña</label>
            <div class="auth-pass">
              <input
                id="reg-pass"
                v-model="password"
                class="auth-input"
                :type="showPass ? 'text' : 'password'"
                placeholder="Mínimo 10 caracteres (puede ser una frase)"
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
        <template v-if="isPartner">{{ loading ? 'Enviando…' : 'Enviar mi solicitud' }}</template>
        <template v-else>{{ loading ? 'Creando tu tienda…' : 'Crear mi tienda' }}</template>
      </button>
    </form>

    </template>

    <div class="auth-alt compact">
      <span>
        ¿Ya tienes cuenta? <router-link to="/login" class="inline">Inicia sesión</router-link>
        <span aria-hidden="true"> · </span>
        <router-link to="/" class="inline muted">Volver al inicio</router-link>
      </span>
    </div>
  </AuthLayout>
</template>

<script>
import { apiService } from "../apiService";
import { setSession } from "../authStore";
import { fetchVenueSettings } from "../venueStore";
import AuthLayout from "../components/AuthLayout.vue";
import PosIcon from "../components/PosIcon.js";
import { isNetworkError } from "../net";
import { formatMxPhone, phoneDigits } from "../phone";
import "../auth.css";
import { MIN_PASSWORD, passwordProblem } from "../passwordPolicy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELD_ORDER = ["firstName", "lastName", "phone", "state", "email", "username", "password", "confirm", "terms"];
const FIELD_ID = {
  firstName: "reg-name",
  lastName: "reg-last",
  phone: "reg-phone",
  state: "reg-state",
  email: "reg-email",
  username: "reg-user",
  password: "reg-pass",
  confirm: "reg-pass2",
};

export default {
  components: { AuthLayout, PosIcon },
  data() {
    return {
      kind: "store",
      partnerState: "",
      partnerCity: "",
      partnerSent: false,
      businessName: "",
      referralCode: "",
      referralState: "",
      referralSeller: "",
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
  mounted() {
    if (["proveedor", "partner"].includes(String(this.$route?.query?.tipo || ""))) this.kind = "partner";
    // El enlace de un vendedor (?ref=MT-XXXXXX) se recuerda por si el cliente antes recorre la página
    let code = String(this.$route?.query?.ref || "");
    try {
      if (code) localStorage.setItem("mt_ref", code);
      else code = localStorage.getItem("mt_ref") || "";
    } catch {
      /* sin almacenamiento: solo vale lo de la dirección */
    }
    if (code) {
      this.referralCode = code.toUpperCase().slice(0, 12);
      this.onReferral();
    }
  },
  beforeUnmount() {
    clearTimeout(this.referralTimer);
  },
  computed: {
    isPartner() {
      return this.kind === "partner";
    },
    phoneDisplay() {
      return formatMxPhone(this.phone);
    },
    errors() {
      const e = {};
      if (!this.firstName.trim()) e.firstName = "Escribe tu nombre.";
      if (!this.lastName.trim()) e.lastName = "Escribe tu apellido.";
      if (this.phone.length !== 10) e.phone = "El celular debe tener 10 dígitos.";
      if (!EMAIL_RE.test(this.email)) e.email = this.email ? "Ese correo no parece válido." : "Escribe tu correo.";
      if (!this.username) e.username = "Elige un usuario.";
      else if (this.username.length < 3) e.username = "Usa al menos 3 caracteres.";
      const weak = passwordProblem(this.password, {
        email: this.email,
        username: this.username,
        name: this.firstName,
      });
      if (weak) e.password = weak;
      if (this.confirmPassword !== this.password) e.confirm = "Las contraseñas no coinciden.";
      if (this.isPartner && this.partnerState.trim().length < 2) e.state = "Escribe tu estado.";
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
      if (p.length < MIN_PASSWORD) return { level: 1, label: "Muy corta" };
      if (passwordProblem(p)) return { level: 1, label: "Débil" };
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
    setKind(kind) {
      this.kind = kind;
      this.serverError = "";
      this.$router.replace({ query: { ...this.$route.query, tipo: kind === "partner" ? "proveedor" : undefined } }).catch(() => {});
    },
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
    onReferral() {
      this.referralCode = String(this.referralCode || "").toUpperCase();
      clearTimeout(this.referralTimer);
      this.referralState = "";
      if (this.referralCode.replace(/[^A-Z0-9]/g, "").length < 4) return;
      this.referralTimer = setTimeout(async () => {
        try {
          const res = await apiService.checkReferralCode(this.referralCode);
          this.referralState = res.valid ? "ok" : "bad";
          this.referralSeller = res.seller || "";
        } catch {
          this.referralState = "";
        }
      }, 400);
    },
    onPhone(e) {
      // Se guardan solo los 10 dígitos; acepta pegar "+52 1 55 1234 5678"
      this.phone = phoneDigits(e.target.value);
      e.target.value = this.phoneDisplay;
    },
    focusFirstError() {
      const first = FIELD_ORDER.find((key) => this.shown[key]);
      const id = FIELD_ID[first];
      if (id) document.getElementById(id)?.focus();
    },
    mapServerError(text) {
      const msg = String(text || "");
      if (/usuario ya existe/i.test(msg)) return { field: "username", text: "Ese usuario ya existe. Prueba con otro." };
      if (/cuenta con ese correo|vendedor con ese correo/i.test(msg)) return { field: "email", text: "Ya hay una cuenta con ese correo." };
      if (/nombre de usuario/i.test(msg)) return { field: "username", text: "Ese usuario ya existe. Prueba con otro." };
      if (/correo ya registrado/i.test(msg)) return { field: "email", text: "Ya hay una cuenta con ese correo. Inicia sesión o recupera tu contraseña." };
      if (/"email"/.test(msg)) return { field: "email", text: "Ese correo no parece válido." };
      if (/código de referido|propio código/i.test(msg)) return { field: "", text: msg };
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
        if (this.isPartner) {
          await apiService.registerPartner({ ...payload, state: this.partnerState.trim(), city: this.partnerCity.trim() });
          this.partnerSent = true;
          window.scrollTo?.(0, 0);
          return;
        }
        if (this.businessName.trim()) payload.businessName = this.businessName.trim();
        if (this.referralCode.trim()) payload.referralCode = this.referralCode.trim();
        const res = await apiService.register(payload);
        try {
          localStorage.removeItem("mt_ref");
        } catch {
          /* nada */
        }
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
