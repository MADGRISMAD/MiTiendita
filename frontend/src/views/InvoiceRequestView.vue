<template>
  <div class="shell">
    <div class="atmosphere" aria-hidden="true"></div>

    <div class="frame">
      <header class="brand">
        <img src="/logo.svg" alt="" width="40" height="40" class="logo" />
        <div>
          <p class="brand-name"><BrandName tone="dark" /></p>
          <p class="brand-sub">Factura tu compra</p>
        </div>
      </header>

      <main class="panel">
        <div v-if="loading" class="state">
          <span class="spinner" aria-hidden="true" />
          <p>Abriendo tu ticket…</p>
        </div>

        <div v-else-if="err" class="state fail">
          <p class="fail-title">No encontramos este ticket</p>
          <p>{{ err }}</p>
        </div>

        <template v-else-if="ticket">
          <section class="receipt">
            <p class="store">{{ ticket.storeName }}</p>
            <div class="receipt-row">
              <span>Folio {{ ticket.folio }}</span>
              <strong>{{ money(ticket.total) }}</strong>
            </div>
            <button
              v-if="ticket.items?.length"
              type="button"
              class="toggle"
              :aria-expanded="showItems"
              @click="showItems = !showItems"
            >
              {{ showItems ? "Ocultar" : "Ver" }} {{ ticket.items.length }}
              artículo{{ ticket.items.length === 1 ? "" : "s" }}
            </button>
            <ul v-if="showItems" class="items">
              <li v-for="(item, i) in ticket.items" :key="i">
                <span>{{ formatQty(item.quantity) }} × {{ item.name }}</span>
                <em>{{ money(item.price * item.quantity) }}</em>
              </li>
            </ul>
          </section>

          <p v-if="!ticket.paid" class="banner warn">
            Este ticket aún no está cobrado. Escanea el QR cuando te lo entreguen pagado.
          </p>
          <p v-else-if="!ticket.open && ticket.invoice?.status !== 'issued'" class="banner warn">
            El plazo para facturar ya cerró. Solo aplica el mes de la compra.
          </p>

          <section v-if="ticket.invoice && !editing" class="success">
            <div class="success-mark" aria-hidden="true">✓</div>
            <h1>
              {{ ticket.invoice.status === "issued" ? "Factura lista" : "Solicitud enviada" }}
            </h1>
            <p v-if="ticket.invoice.status === 'requested'">
              La tienda ya tiene tus datos. Te mandarán el CFDI a
              <strong>{{ ticket.invoice.email }}</strong>.
              No hace falta volver a caja.
            </p>
            <p v-else>
              Este ticket ya fue facturado a <strong>{{ ticket.invoice.rfc }}</strong>.
            </p>

            <dl class="facts">
              <div>
                <dt>RFC</dt>
                <dd>{{ ticket.invoice.rfc }}</dd>
              </div>
              <div>
                <dt>Razón social</dt>
                <dd>{{ ticket.invoice.legalName }}</dd>
              </div>
              <div>
                <dt>C.P.</dt>
                <dd>{{ ticket.invoice.postalCode }}</dd>
              </div>
              <div>
                <dt>Régimen</dt>
                <dd>{{ regimeLabel(ticket.invoice.taxRegime) }}</dd>
              </div>
              <div>
                <dt>Uso CFDI</dt>
                <dd>{{ useLabel(ticket.invoice.cfdiUse) }}</dd>
              </div>
            </dl>

            <button
              v-if="ticket.invoice.status === 'requested' && ticket.open"
              type="button"
              class="btn ghost"
              @click="editing = true"
            >
              Corregir datos
            </button>
          </section>

          <form v-if="canEdit" class="form" @submit.prevent="submit">
            <div class="form-intro">
              <h1>{{ ticket.invoice ? "Corrige tus datos" : "Tus datos fiscales" }}</h1>
              <p>Como aparecen en tu constancia del SAT. Te enviamos XML y PDF al correo.</p>
            </div>

            <label class="field">
              <span>RFC</span>
              <input
                v-model="form.rfc"
                required
                maxlength="13"
                autocapitalize="characters"
                autocomplete="off"
                spellcheck="false"
                placeholder="XAXX010101000"
                @input="form.rfc = form.rfc.toUpperCase()"
              />
            </label>

            <label class="field">
              <span>Razón social</span>
              <input
                v-model="form.legalName"
                required
                maxlength="200"
                autocomplete="organization"
                placeholder="Como en tu constancia"
              />
            </label>

            <div class="row-2">
              <label class="field">
                <span>C.P. fiscal</span>
                <input
                  v-model="form.postalCode"
                  required
                  inputmode="numeric"
                  pattern="[0-9]{5}"
                  maxlength="5"
                  placeholder="44100"
                />
              </label>
              <label class="field">
                <span>Uso CFDI</span>
                <select v-model="form.cfdiUse" required>
                  <option v-for="u in ticket.uses" :key="u.code" :value="u.code">
                    {{ u.code }} · {{ u.label }}
                  </option>
                </select>
              </label>
            </div>

            <label class="field">
              <span>Régimen fiscal</span>
              <select v-model="form.taxRegime" required>
                <option value="" disabled>Elige uno</option>
                <option v-for="r in ticket.regimes" :key="r.code" :value="r.code">
                  {{ r.code }} · {{ r.label }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Correo para XML y PDF</span>
              <input
                v-model="form.email"
                type="email"
                required
                inputmode="email"
                autocomplete="email"
                placeholder="tu@correo.com"
              />
            </label>

            <p v-if="formErr" class="form-err" role="alert">{{ formErr }}</p>

            <div class="actions">
              <button
                v-if="ticket.invoice"
                type="button"
                class="btn ghost"
                :disabled="busy"
                @click="editing = false"
              >
                Cancelar
              </button>
              <button type="submit" class="btn primary" :disabled="busy">
                {{ busy ? "Enviando…" : ticket.invoice ? "Guardar cambios" : "Pedir factura" }}
              </button>
            </div>
          </form>
        </template>
      </main>

      <p class="foot">Powered by <BrandName /> · No compartas este enlace</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import BrandName from "../components/BrandName.vue";
import { useRoute } from "vue-router";
import { apiService } from "../apiService";

const route = useRoute();
const ticket = ref(null);
const loading = ref(true);
const err = ref("");
const formErr = ref("");
const busy = ref(false);
const editing = ref(false);
const showItems = ref(false);
const form = reactive({
  rfc: "",
  legalName: "",
  postalCode: "",
  taxRegime: "",
  cfdiUse: "G03",
  email: "",
});

const canEdit = computed(() => {
  if (!ticket.value?.paid || !ticket.value.open) return false;
  if (!ticket.value.invoice) return true;
  return editing.value && ticket.value.invoice.status === "requested";
});

function money(n) {
  return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function formatQty(q) {
  const n = Number(q || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}
function regimeLabel(code) {
  return ticket.value?.regimes?.find((r) => r.code === code)?.label || code;
}
function useLabel(code) {
  return ticket.value?.uses?.find((u) => u.code === code)?.label || code;
}
function fillForm(invoice) {
  if (!invoice) return;
  form.rfc = invoice.rfc || "";
  form.legalName = invoice.legalName || "";
  form.postalCode = invoice.postalCode || "";
  form.taxRegime = invoice.taxRegime || "";
  form.cfdiUse = invoice.cfdiUse || "G03";
  form.email = invoice.email || "";
}

async function load() {
  loading.value = true;
  err.value = "";
  try {
    ticket.value = await apiService.getPublicInvoice(String(route.params.token));
    fillForm(ticket.value.invoice);
  } catch (e) {
    err.value = e.response?.data || "No se pudo abrir este ticket";
  } finally {
    loading.value = false;
  }
}

async function submit() {
  busy.value = true;
  formErr.value = "";
  try {
    ticket.value = await apiService.submitPublicInvoice(String(route.params.token), {
      rfc: form.rfc,
      legalName: form.legalName,
      postalCode: form.postalCode,
      taxRegime: form.taxRegime,
      cfdiUse: form.cfdiUse,
      email: form.email,
    });
    editing.value = false;
    if (ticket.value?.mail?.customer?.sent === false) {
      formErr.value =
        ticket.value.mail.customer.error ||
        "Solicitud guardada, pero el correo de confirmación no se pudo enviar.";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    formErr.value = e.response?.data || "No se pudo enviar la solicitud";
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.shell {
  position: relative;
  height: 100%;
  max-height: 100dvh;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  font-family: var(--font-sans, "Figtree", system-ui, sans-serif);
  color: #f0f4fa;
}

.atmosphere {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse 80% 50% at 12% 8%, rgba(224, 138, 30, 0.28), transparent 55%),
    radial-gradient(ellipse 60% 45% at 92% 88%, rgba(30, 90, 168, 0.45), transparent 50%),
    linear-gradient(160deg, #0a1a30 0%, #123056 45%, #1e5aa8 100%);
}

.frame {
  position: relative;
  z-index: 1;
  width: min(28rem, 100%);
  margin: 0 auto;
  padding: max(0.85rem, env(safe-area-inset-top)) 1rem max(1.5rem, env(safe-area-inset-bottom));
  display: grid;
  gap: 0.85rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.15rem 0.15rem 0;
}
.logo {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.65rem;
  flex-shrink: 0;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}
.brand-name {
  margin: 0;
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
}
.brand-sub {
  margin: 0.05rem 0 0;
  font-size: 0.78rem;
  opacity: 0.72;
  font-weight: 600;
}

.panel {
  background: #fff;
  color: #1a2332;
  border-radius: 1.25rem;
  padding: 1.15rem 1rem 1.25rem;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.28);
}

.state {
  display: grid;
  place-items: center;
  gap: 0.65rem;
  min-height: 10rem;
  text-align: center;
  color: #64748b;
  font-weight: 600;
}
.state p { margin: 0; }
.spinner {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 2.5px solid #e7f0fb;
  border-top-color: #1e5aa8;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.fail { color: #b42318; }
.fail-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #1a2332;
}

.receipt {
  padding: 0.85rem 0.9rem;
  border-radius: 0.9rem;
  background: #f4f7fb;
  border: 1px solid rgba(26, 35, 50, 0.08);
}
.store {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1e5aa8;
}
.receipt-row {
  margin-top: 0.35rem;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #64748b;
}
.receipt-row strong {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #1a2332;
}
.toggle {
  margin-top: 0.55rem;
  border: none;
  background: transparent;
  padding: 0;
  color: #1e5aa8;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.items {
  list-style: none;
  margin: 0.55rem 0 0;
  padding: 0.55rem 0 0;
  border-top: 1px dashed rgba(26, 35, 50, 0.12);
  display: grid;
  gap: 0.4rem;
}
.items li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: #1a2332;
}
.items em {
  font-style: normal;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.banner {
  margin: 0.85rem 0 0;
  padding: 0.75rem 0.85rem;
  border-radius: 0.8rem;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.4;
}
.banner.warn {
  background: #fff3e0;
  color: #9a4d00;
}

.success {
  margin-top: 1rem;
  display: grid;
  gap: 0.55rem;
  justify-items: center;
  text-align: center;
}
.success-mark {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #e8f5e9;
  color: #2e7d32;
  font-size: 1.35rem;
  font-weight: 800;
}
.success h1,
.form-intro h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.success p {
  margin: 0;
  color: #64748b;
  font-size: 0.92rem;
  line-height: 1.45;
  max-width: 22rem;
}
.success strong { color: #1a2332; }

.facts {
  width: 100%;
  margin: 0.35rem 0 0;
  padding: 0.75rem 0.85rem;
  border-radius: 0.85rem;
  background: #f4f7fb;
  display: grid;
  gap: 0.55rem;
  text-align: left;
}
.facts div {
  display: grid;
  grid-template-columns: 6.2rem 1fr;
  gap: 0.5rem;
  align-items: start;
}
.facts dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-top: 0.12rem;
}
.facts dd {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: #1a2332;
  word-break: break-word;
}

.form {
  margin-top: 1rem;
  display: grid;
  gap: 0.8rem;
}
.form-intro p {
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.88rem;
  line-height: 1.4;
}
.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}
.field input,
.field select {
  width: 100%;
  min-height: 3rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(26, 35, 50, 0.14);
  padding: 0.7rem 0.85rem;
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  color: #1a2332;
  background: #fff;
  appearance: none;
  -webkit-appearance: none;
}
.field select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.85rem center;
  padding-right: 2.4rem;
}
.field input:focus,
.field select:focus {
  outline: 2px solid rgba(30, 90, 168, 0.35);
  outline-offset: 1px;
  border-color: #1e5aa8;
}
.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
@media (max-width: 360px) {
  .row-2 { grid-template-columns: 1fr; }
}

.actions {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.25rem;
  position: sticky;
  bottom: 0;
  padding-top: 0.35rem;
  background: linear-gradient(to top, #fff 70%, rgba(255, 255, 255, 0));
}
.btn {
  min-height: 3.1rem;
  border-radius: 0.85rem;
  font: inherit;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  width: 100%;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.primary {
  border: none;
  background: #1e5aa8;
  color: #fff;
  box-shadow: 0 10px 22px rgba(30, 90, 168, 0.28);
}
.btn.ghost {
  border: 1px solid rgba(26, 35, 50, 0.14);
  background: #fff;
  color: #1a2332;
}
.success .btn.ghost { margin-top: 0.35rem; max-width: 16rem; }

.form-err {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 0.7rem;
  background: #fdecea;
  color: #b42318;
  font-size: 0.88rem;
  font-weight: 700;
}

.foot {
  margin: 0;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.55;
}

@media (min-width: 640px) {
  .frame {
    padding-top: 1.75rem;
    padding-bottom: 2rem;
  }
  .panel {
    padding: 1.4rem 1.35rem 1.5rem;
  }
  .actions {
    grid-template-columns: 1fr 1.4fr;
  }
}
</style>
