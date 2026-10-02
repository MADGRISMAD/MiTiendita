<template>
  <AppShell>
    <div class="settings">
      <div class="tabs">
        <button v-for="t in tabs" :key="t.id" type="button" :class="{ active: tab === t.id }" @click="tab = t.id">
          {{ t.label }}
        </button>
      </div>

      <section v-if="tab === 'brand'" class="panel">
        <h2>Negocio y marca</h2>
        <div class="form-grid">
          <label>Nombre<input v-model="form.businessName" /></label>
          <label>Tipo
            <select v-model="form.businessType">
              <option value="abarrotes">Abarrotes / tienda</option>
              <option value="convenience">Conveniencia</option>
              <option value="pharmacy">Farmacia</option>
              <option value="hardware">Ferretería / tlapalería</option>
              <option value="other">Otro comercio</option>
            </select>
          </label>
          <label>Dirección<input v-model="form.address" /></label>
          <label>Teléfono<input v-model="form.phone" /></label>
          <label>Logo URL<input v-model="form.logoUrl" /></label>
          <label>Zona horaria
            <select v-model="form.timezone">
              <option value="America/Mexico_City">Ciudad de México</option>
              <option value="America/Tijuana">Tijuana</option>
              <option value="America/Monterrey">Monterrey</option>
              <option value="America/Bogota">Bogotá</option>
              <option value="Europe/Madrid">Madrid</option>
            </select>
          </label>
        </div>
        <button type="button" class="btn-primary" :disabled="saving" @click="saveBrand">
          {{ saving ? 'Guardando…' : 'Guardar cambios' }}
        </button>
        <p v-if="message" class="ok">{{ message }}</p>
      </section>

      <section v-else-if="tab === 'appearance'" class="panel">
        <h2>Apariencia</h2>
        <p class="hint">Paleta fija (azul y ámbar). Solo eliges claro u oscuro.</p>
        <div class="theme-switch" role="group" aria-label="Tema de interfaz">
          <button type="button" :class="{ on: !isDark }" @click="setLight">
            <span class="theme-ico" aria-hidden="true">☀</span>
            Claro
          </button>
          <button type="button" :class="{ on: isDark }" @click="setDark">
            <span class="theme-ico" aria-hidden="true">☾</span>
            Oscuro
          </button>
        </div>
        <div class="swatch-row" aria-hidden="true">
          <span class="swatch primary" />
          <span class="swatch accent" />
          <span class="swatch surface" />
          <span class="swatch ink" />
        </div>
      </section>

      <section v-else-if="tab === 'team'" class="panel">
        <h2>Invitar al equipo</h2>
        <p class="hint">Se envía un correo con el enlace para unirse al equipo.</p>
        <form class="invite-form" @submit.prevent="sendInvite">
          <label>Correo<input v-model="invite.email" type="email" required placeholder="persona@negocio.com" /></label>
          <label>Rol
            <select v-model="invite.role">
              <option value="admin">Admin</option>
              <option value="cashier">Cajero</option>
              <option value="waiter">Vendedor</option>
            </select>
          </label>
          <button type="submit" class="btn-primary" :disabled="inviting">{{ inviting ? 'Enviando…' : 'Enviar invitación' }}</button>
        </form>
        <p v-if="inviteMsg" class="ok">{{ inviteMsg }}</p>
        <p v-if="inviteErr" class="err">{{ inviteErr }}</p>

        <h3>Invitaciones</h3>
        <ul class="invite-list">
          <li v-for="i in invites" :key="i.id">
            <div>
              <strong>{{ i.email }}</strong>
              <span class="meta">{{ roleText(i.role) }} · {{ inviteText(i.status) }}</span>
            </div>
            <div class="row-actions">
              <button v-if="i.status === 'pending'" type="button" @click="revoke(i)">Revocar</button>
              <button type="button" class="danger" @click="removeInvite(i)">Eliminar</button>
            </div>
          </li>
          <li v-if="!invites.length" class="empty">Sin invitaciones aún.</li>
        </ul>
      </section>

      <section v-else-if="tab === 'support'" class="panel">
        <h2>Soporte</h2>
        <p class="hint">Escríbenos desde aquí con tu correo. Solo tú ves tus conversaciones; otro admin de la tienda no las ve.</p>
        <form class="support-form" @submit.prevent="sendSupport">
          <label>Asunto<input v-model="support.subject" required maxlength="140" placeholder="No puedo abrir caja" /></label>
          <label>Mensaje
            <textarea v-model="support.message" required minlength="8" rows="5" placeholder="Cuéntanos qué pasa y en qué pantalla." />
          </label>
          <button type="submit" class="btn-primary" :disabled="supportBusy">
            {{ supportBusy ? "Enviando…" : "Enviar a soporte" }}
          </button>
        </form>
        <p v-if="supportMsg" class="ok">{{ supportMsg }}</p>
        <p v-if="supportErr" class="err">{{ supportErr }}</p>
        <h3 v-if="tickets.length">Conversaciones</h3>
        <ul class="invite-list">
          <li v-for="t in tickets" :key="t.id">
            <div>
              <strong>{{ t.subject }}</strong>
              <span class="meta">{{ t.status === "open" ? "Abierta" : "Respondida" }} · {{ t.messages?.length || 0 }} mensaje(s)</span>
            </div>
          </li>
        </ul>
      </section>

      <section v-else-if="tab === 'prefs'" class="panel">
        <h2>Preferencias</h2>
        <label class="check-row">
          <input v-model="form.inventoryEnabled" type="checkbox" />
          <span>
            <strong>Llevar inventario</strong>
            <small>Al cobrar, se resta la cantidad de todos los productos. Si lo apagas, las ventas no tocan existencias.</small>
          </span>
        </label>

        <label class="field-inline">
          <strong>Costo al registrar una compra</strong>
          <small>Último deja el costo de la entrada más reciente. Promedio pondera existencias actuales y la compra nueva.</small>
          <select v-model="form.costMethod" class="tax-input">
            <option value="last">Último costo</option>
            <option value="average">Promedio ponderado</option>
          </select>
        </label>

        <label class="field-inline">
          <strong>Tasa de IVA (%)</strong>
          <small>Porcentaje de impuesto aplicado a ventas. México: 16%, Colombia: 19%.</small>
          <input v-model.number="form.taxRate" type="number" min="0" max="100" step="1" class="tax-input" />
        </label>

        <button type="button" class="btn-primary" :disabled="saving" @click="savePrefs">
          {{ saving ? "Guardando…" : "Guardar preferencias" }}
        </button>
        <p v-if="prefsMsg" class="ok">{{ prefsMsg }}</p>
        <hr class="prefs-rule" />
        <p class="hint">Puedes volver a ejecutar el asistente de configuración inicial.</p>
        <router-link to="/setup" class="link">Volver a ejecutar el wizard</router-link>
      </section>

      <section v-else class="panel">
        <h2>Cambiar contraseña</h2>
        <p class="hint">Actualiza tu contraseña de acceso. Mínimo 6 caracteres.</p>
        <form class="pw-form" @submit.prevent="changePassword">
          <label>Contraseña actual
            <input v-model="pwForm.current" type="password" required autocomplete="current-password" />
          </label>
          <label>Nueva contraseña
            <input v-model="pwForm.newPw" type="password" required minlength="6" autocomplete="new-password" />
          </label>
          <label>Confirmar nueva contraseña
            <input v-model="pwForm.confirm" type="password" required minlength="6" autocomplete="new-password" />
          </label>
          <button type="submit" class="btn-primary" :disabled="pwBusy">
            {{ pwBusy ? "Cambiando…" : "Cambiar contraseña" }}
          </button>
        </form>
        <p v-if="pwMsg" class="ok">{{ pwMsg }}</p>
        <p v-if="pwErr" class="err">{{ pwErr }}</p>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from "vue";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";
import { saveVenueSettings, venueStore } from "../venueStore";
import { themeStore, applyUiTheme } from "../themeStore";
import { inviteStatusLabel, labelOf, roleLabel } from "../labels";

const tab = ref("brand");
const tabs = [
  { id: "brand", label: "Negocio / Marca" },
  { id: "appearance", label: "Apariencia" },
  { id: "team", label: "Equipo" },
  { id: "support", label: "Soporte" },
  { id: "prefs", label: "Preferencias" },
  { id: "security", label: "Seguridad" },
];

const isDark = computed(() => themeStore.mode === "dark");
function setLight() { applyUiTheme("light"); }
function setDark() { applyUiTheme("dark"); }
function inviteText(s) { return labelOf(inviteStatusLabel, s); }
function roleText(r) { return labelOf(roleLabel, r); }

const form = reactive({
  businessName: venueStore.businessName || "",
  businessType: venueStore.businessType || "abarrotes",
  address: venueStore.address || "",
  phone: venueStore.phone || "",
  logoUrl: venueStore.logoUrl || "/logo.svg",
  primaryColor: venueStore.primaryColor || "#1F4D3A",
  accentColor: venueStore.accentColor || "#C4A574",
  timezone: venueStore.timezone || "America/Mexico_City",
  initialTables: venueStore.initialTables || 8,
  inventoryEnabled: Boolean(venueStore.inventoryEnabled),
  costMethod: venueStore.costMethod === "average" ? "average" : "last",
  taxRate: venueStore.taxRate != null ? Number(venueStore.taxRate) * 100 : 16,
});

const saving = ref(false);
const message = ref("");
const prefsMsg = ref("");
const invites = ref([]);
const inviting = ref(false);
const inviteMsg = ref("");
const inviteErr = ref("");
const invite = reactive({ email: "", role: "cashier" });
const support = reactive({ subject: "", message: "" });
const supportBusy = ref(false);
const supportMsg = ref("");
const supportErr = ref("");

// Cambiar contraseña
const pwForm = reactive({ current: "", newPw: "", confirm: "" });
const pwBusy = ref(false);
const pwMsg = ref("");
const pwErr = ref("");
const tickets = ref([]);

async function saveBrand() {
  saving.value = true;
  message.value = "";
  try {
    await saveVenueSettings({
      ...form,
      taxRate: Math.min(100, Math.max(0, Number(form.taxRate) || 0)) / 100,
      costMethod: form.costMethod === "average" ? "average" : "last",
      inventoryEnabled: Boolean(form.inventoryEnabled),
    });
    message.value = "Configuración guardada.";
  } catch {
    message.value = "No se pudo guardar.";
  } finally {
    saving.value = false;
  }
}

async function savePrefs() {
  saving.value = true;
  prefsMsg.value = "";
  try {
    const taxDecimal = Math.min(100, Math.max(0, Number(form.taxRate) || 0)) / 100;
    await saveVenueSettings({
      businessName: venueStore.businessName || form.businessName,
      businessType: venueStore.businessType || form.businessType,
      address: venueStore.address || form.address,
      phone: venueStore.phone || form.phone,
      logoUrl: venueStore.logoUrl || form.logoUrl,
      primaryColor: venueStore.primaryColor || form.primaryColor,
      accentColor: venueStore.accentColor || form.accentColor,
      timezone: venueStore.timezone || form.timezone,
      initialTables: venueStore.initialTables || form.initialTables,
      inventoryEnabled: form.inventoryEnabled,
      costMethod: form.costMethod === "average" ? "average" : "last",
      taxRate: taxDecimal,
    });
    prefsMsg.value = form.inventoryEnabled
      ? "Inventario activado. Aplica a todo el catálogo."
      : "Preferencias guardadas.";
  } catch {
    prefsMsg.value = "No se pudo guardar.";
  } finally {
    saving.value = false;
  }
}

async function changePassword() {
  pwMsg.value = "";
  pwErr.value = "";
  if (!pwForm.current || !pwForm.newPw) {
    pwErr.value = "Llena todos los campos.";
    return;
  }
  if (pwForm.newPw.length < 6) {
    pwErr.value = "La nueva contraseña debe tener al menos 6 caracteres.";
    return;
  }
  if (pwForm.newPw !== pwForm.confirm) {
    pwErr.value = "Las contraseñas no coinciden.";
    return;
  }
  pwBusy.value = true;
  try {
    await apiService.changePassword(pwForm.current, pwForm.newPw);
    pwMsg.value = "Contraseña actualizada correctamente.";
    pwForm.current = "";
    pwForm.newPw = "";
    pwForm.confirm = "";
  } catch (e) {
    const raw = e.response?.data;
    pwErr.value = typeof raw === "string" ? raw : raw?.message || "No se pudo cambiar la contraseña.";
  } finally {
    pwBusy.value = false;
  }
}

async function loadInvites() {
  try {
    invites.value = (await apiService.getInvites()) || [];
  } catch {
    invites.value = [];
  }
}

async function loadSupport() {
  try {
    const data = await apiService.getSupportThread();
    tickets.value = data.tickets || [];
  } catch {
    tickets.value = [];
  }
}

async function sendSupport() {
  supportBusy.value = true;
  supportMsg.value = "";
  supportErr.value = "";
  try {
    const data = await apiService.sendSupportMessage({
      subject: support.subject,
      message: support.message,
    });
    tickets.value = data.tickets || [];
    support.subject = "";
    support.message = "";
    supportMsg.value = "Mensaje enviado. Te respondemos a tu correo.";
  } catch (e) {
    const raw = e.response?.data;
    supportErr.value = typeof raw === "string" ? raw : raw?.message || "No se pudo enviar.";
  } finally {
    supportBusy.value = false;
  }
}

async function sendInvite() {
  inviting.value = true;
  inviteMsg.value = "";
  inviteErr.value = "";
  try {
    const res = await apiService.createInvite({ email: invite.email, role: invite.role });
    inviteMsg.value = "Invitación enviada por correo.";
    invite.email = "";
    await loadInvites();
  } catch (e) {
    const raw = e.response?.data;
    inviteErr.value = typeof raw === "string" ? raw : raw?.message || "No se pudo enviar la invitación.";
  } finally {
    inviting.value = false;
  }
}

async function revoke(i) {
  await apiService.revokeInvite(i.id);
  await loadInvites();
}

async function removeInvite(i) {
  if (!confirm("¿Eliminar invitación?")) return;
  await apiService.deleteInvite(i.id);
  await loadInvites();
}

onMounted(() => {
  loadInvites();
  loadSupport();
});
</script>

<style scoped>
.settings { animation: t-fade-up .45s ease both; }
.tabs { display:flex; gap:.45rem; margin-bottom:1.1rem; flex-wrap:wrap; }
.tabs button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:999px; padding:.45rem .9rem; cursor:pointer; font-size:.85rem; font-weight:600; }
.tabs button.active { background:var(--timber-primary); color:var(--timber-on-primary); border-color:transparent; }
.panel { background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1.15rem; padding:1.3rem; box-shadow:var(--timber-shadow); }
.panel h2 { margin:0 0 .75rem; font-family:var(--font-display); font-size:1.35rem; font-weight:700; letter-spacing:-0.01em; }
.panel h3 { margin:1.25rem 0 .6rem; font-size:.95rem; }
.hint { color:var(--timber-muted); font-size:.9rem; margin:0 0 .9rem; line-height:1.45; }
.check-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin: 0 0 1rem;
  padding: 0.85rem 0.9rem;
  border-radius: 0.85rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  cursor: pointer;
}
.check-row input { margin-top: 0.2rem; width: 1.1rem; height: 1.1rem; flex-shrink: 0; }
.check-row span { display: grid; gap: 0.25rem; }
.check-row strong { color: var(--timber-ink); font-size: 0.95rem; }
.check-row small { color: var(--timber-muted); font-size: 0.82rem; line-height: 1.4; font-weight: 500; }
.prefs-rule {
  border: none;
  border-top: 1px solid var(--timber-line);
  margin: 1.25rem 0 1rem;
}
.theme-switch {
  display: flex;
  gap: 0.5rem;
  background: var(--timber-surface);
  padding: 0.35rem;
  border-radius: 0.9rem;
  border: 1px solid var(--timber-line);
  max-width: 22rem;
}
.theme-switch button {
  flex: 1;
  min-height: 3rem;
  border: none;
  border-radius: 0.7rem;
  background: transparent;
  color: var(--timber-ink);
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}
.theme-switch button.on {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.theme-ico { font-size: 1.05rem; line-height: 1; }
.swatch-row {
  display: flex;
  gap: 0.45rem;
  margin-top: 1rem;
}
.swatch {
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 0.45rem;
  border: 1px solid var(--timber-line);
}
.swatch.primary { background: var(--timber-primary); }
.swatch.accent { background: var(--timber-accent); }
.swatch.surface { background: var(--timber-surface); }
.swatch.ink { background: var(--timber-ink); }
.form-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(14rem,1fr)); gap:.8rem; margin-bottom:1rem; }
label { display:grid; gap:.3rem; font-size:.85rem; font-weight:500; }
input, select { border:1px solid var(--timber-line); border-radius:.65rem; padding:.65rem .75rem; font:inherit; background:var(--timber-panel-elevated); color:var(--timber-ink); }
.btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; border-radius:.7rem; padding:.65rem 1.05rem; font-weight:600; cursor:pointer; box-shadow:var(--timber-shadow); }
.ok { color:var(--timber-success); font-size:.88rem; }
.err { color:var(--timber-danger); font-size:.88rem; }
.invite-form { display:grid; grid-template-columns:1.4fr .8fr auto; gap:.65rem; align-items:end; margin-bottom:.85rem; }
.invite-list { list-style:none; margin:0; padding:0; }
.invite-list li { display:flex; justify-content:space-between; gap:1rem; padding:.75rem 0; border-bottom:1px solid var(--timber-line); }
.meta { display:block; font-size:.8rem; color:var(--timber-muted); }
.row-actions { display:flex; gap:.35rem; }
.row-actions button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:.55rem; padding:.4rem .6rem; cursor:pointer; font-size:.78rem; font-weight:600; }
.danger { color:var(--timber-danger); }
.support-form { display:grid; gap:.75rem; margin-bottom:.85rem; max-width:32rem; }
.support-form textarea {
  border:1px solid var(--timber-line); border-radius:.65rem; padding:.65rem .75rem;
  font:inherit; background:var(--timber-panel-elevated); color:var(--timber-ink); resize:vertical;
}
.link { display:inline-block; margin-top:1rem; color:var(--timber-primary); font-weight:600; }
.empty { color:var(--timber-muted); }
.field-inline {
  display: grid;
  gap: 0.3rem;
  margin: 0 0 1rem;
  padding: 0.85rem 0.9rem;
  border-radius: 0.85rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
}
.field-inline strong { font-size: 0.95rem; color: var(--timber-ink); }
.field-inline small { color: var(--timber-muted); font-size: 0.82rem; line-height: 1.4; font-weight: 500; }
.tax-input {
  width: 6rem;
  min-height: 2.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.65rem;
  padding: 0.5rem 0.65rem;
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  background: var(--timber-panel);
  color: var(--timber-ink);
  text-align: center;
}
.pw-form { display: grid; gap: 0.75rem; max-width: 24rem; margin-bottom: 0.85rem; }
@media (max-width:720px) { .invite-form { grid-template-columns:1fr; } }
</style>
