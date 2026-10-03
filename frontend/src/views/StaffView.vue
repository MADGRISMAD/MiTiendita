<template>
  <AppShell>
    <div class="adm stf">
      <header class="adm-head">
        <div>
          <h1>Empleados</h1>
          <p>{{ headline }}</p>
        </div>
        <div class="adm-acts">
          <button v-if="tab === 'access'" type="button" class="adm-btn primary" :disabled="seatsFull" @click="openInvite">
            <PosIcon name="mail" :size="18" /> <span>Invitar</span>
          </button>
          <button v-else type="button" class="adm-btn primary" @click="openPerson()">
            <PosIcon name="user-plus" :size="18" /> <span>Agregar persona</span>
          </button>
        </div>
      </header>

      <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
        <button type="button" class="adm-x" aria-label="Cerrar aviso" @click="error = ''"><PosIcon name="x" :size="16" /></button>
      </p>

      <nav class="adm-tabs main" role="tablist" aria-label="Secciones de empleados">
        <button type="button" role="tab" :aria-selected="tab === 'access'" :class="{ on: tab === 'access' }" @click="setTab('access')">
          Acceso<span class="hide-mobile"> a la app</span><em v-if="activeUsers">{{ activeUsers }}</em>
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'staff'" :class="{ on: tab === 'staff' }" @click="setTab('staff')">
          Personal<span class="hide-mobile"> y turnos</span><em v-if="people.length">{{ people.length }}</em>
        </button>
      </nav>

      <!-- ============ Acceso a la app ============ -->
      <section v-if="tab === 'access'" class="sec" :class="{ 'adm-loading': loading.team }">
        <div v-if="seats" class="adm-card seats">
          <div class="seats-top">
            <div>
              <h2>Lugares del plan {{ planName }}</h2>
              <p>
                {{ seats.used }} {{ seats.used === 1 ? 'persona entra' : 'personas entran' }}
                <template v-if="seats.pending"> · {{ seats.pending }} {{ seats.pending === 1 ? 'invitación pendiente' : 'invitaciones pendientes' }}</template>
              </p>
            </div>
            <strong>{{ seats.max == null ? 'Sin límite' : `${seats.used + seats.pending} de ${seats.max}` }}</strong>
          </div>
          <div v-if="seats.max != null" class="seats-bar" aria-hidden="true">
            <i class="used" :style="{ width: `${pct(seats.used)}%` }"></i>
            <i class="pend" :style="{ width: `${pct(seats.pending)}%` }"></i>
          </div>
          <p v-if="seatsFull" class="seats-full">
            Ya usas todos los lugares. <router-link to="/billing">Cambia de plan</router-link> para invitar a más.
          </p>
        </div>

        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <h2>Quién entra a la app</h2>
              <p>Cada quien con su usuario; así se sabe quién cobró y quién hizo el corte.</p>
            </div>
          </div>
          <ul v-if="users.length" class="people">
            <li v-for="u in sortedUsers" :key="u.id" :class="{ off: u.disabled }">
              <span class="adm-avatar" :style="hueStyle(displayName(u))">{{ initials(displayName(u)) }}</span>
              <div class="who">
                <strong>{{ displayName(u) }}<span v-if="u.username === me" class="adm-pill info me">Tú</span></strong>
                <small>{{ u.email || `@${u.username}` }} · {{ lastAccess(u) }}</small>
              </div>
              <span v-if="u.disabled" class="adm-pill">Desactivado</span>
              <span v-else class="adm-pill role" :class="ROLE[u.role]?.tone">
                <PosIcon v-if="u.role === 'admin'" name="shield" :size="13" /> {{ ROLE[u.role]?.label || u.role }}
              </span>
              <div v-if="u.username !== me" class="inv-acts">
                <button
                  v-if="!u.disabled"
                  type="button"
                  class="adm-btn sm"
                  :disabled="busyId === u.id"
                  :aria-label="roleButtonLabel(u)"
                  @click="changeRole(u)"
                >
                  {{ confirmId === `role${u.id}` ? '¿Confirmar?' : u.role === 'admin' ? 'Hacer cajero' : 'Hacer dueño' }}
                </button>
                <button
                  v-if="!u.disabled"
                  type="button"
                  class="adm-btn sm danger-ghost"
                  :disabled="busyId === u.id"
                  :aria-label="confirmId === `x${u.id}` ? `¿Desactivar a ${displayName(u)}? Toca otra vez para confirmar` : `Desactivar a ${displayName(u)}`"
                  @click="deactivate(u)"
                >
                  {{ confirmId === `x${u.id}` ? '¿Desactivar?' : 'Desactivar' }}
                </button>
                <button v-else type="button" class="adm-btn sm" :disabled="busyId === u.id || seatsFull" @click="reactivate(u)">
                  Reactivar
                </button>
              </div>
            </li>
          </ul>
          <p v-else-if="!loading.team" class="adm-hint">No se pudo leer el equipo.</p>
          <p class="adm-hint foot">
            Si alguien se va, desactívalo: deja de poder entrar y cobrar al instante, aunque tenga la sesión abierta.
            Libera su lugar en el plan y puedes reactivarlo cuando quieras. Al cambiar un rol, la persona vuelve a iniciar sesión.
            Siempre debe quedar al menos un dueño activo.
          </p>
        </div>

        <div class="adm-card">
          <div class="adm-card-head">
            <div>
              <h2>Invitaciones</h2>
              <p>Le llega un correo con el enlace para crear su usuario. Vence en 7 días.</p>
            </div>
            <button type="button" class="adm-btn sm" :disabled="seatsFull" @click="openInvite">
              <PosIcon name="add" :size="16" /> Invitar
            </button>
          </div>
          <ul v-if="invites.length" class="invites">
            <li v-for="i in sortedInvites" :key="i.id">
              <span class="inv-ico"><PosIcon name="mail" :size="17" /></span>
              <div class="who">
                <strong>{{ i.email }}</strong>
                <small>{{ ROLE[roleKey(i.role)]?.label || i.role }} · {{ inviteWhen(i) }}</small>
              </div>
              <span class="adm-pill" :class="INVITE[i.status]?.tone">{{ INVITE[i.status]?.label || i.status }}</span>
              <div class="inv-acts">
                <button v-if="i.status === 'pending'" type="button" class="adm-btn sm" :disabled="busyId === i.id" @click="revoke(i)">
                  {{ confirmId === `r${i.id}` ? '¿Revocar?' : 'Revocar' }}
                </button>
                <button type="button" class="adm-btn sm danger-ghost" :disabled="busyId === i.id" :aria-label="`Eliminar invitación de ${i.email}`" @click="removeInvite(i)">
                  <PosIcon v-if="confirmId !== `d${i.id}`" name="trash" :size="16" />
                  <template v-else>¿Eliminar?</template>
                </button>
              </div>
            </li>
          </ul>
          <p v-else-if="!loading.team" class="adm-hint">Sin invitaciones. Invita a tu cajero o a quien te ayude a vender.</p>
        </div>
      </section>

      <!-- ============ Personal y turnos ============ -->
      <section v-else class="sec" :class="{ 'adm-loading': loading.staff }">
        <p class="adm-hint">Lista del personal de la tienda con su turno. No necesitan cuenta para estar aquí.</p>
        <div v-if="people.length" class="adm-kpis">
          <div class="adm-kpi good">
            <span>En turno</span>
            <strong>{{ counts.active }}</strong>
            <small>trabajando ahora</small>
          </div>
          <div class="adm-kpi">
            <span>Descansando</span>
            <strong>{{ counts.rest }}</strong>
            <small>fuera de turno</small>
          </div>
        </div>
        <div v-if="people.length" class="adm-tools">
          <div class="adm-tabs" role="group" aria-label="Filtrar por turno">
            <button type="button" :class="{ on: shift === 'all' }" @click="shift = 'all'">Todos<em>{{ people.length }}</em></button>
            <button v-for="s in SHIFTS" :key="s.id" type="button" :class="{ on: shift === s.id }" @click="shift = s.id">
              {{ s.label }}<em>{{ people.filter((p) => p.workSchedule === s.id).length }}</em>
            </button>
          </div>
        </div>
        <div v-if="shownPeople.length" class="crew">
          <article v-for="p in shownPeople" :key="p.cellphone" class="adm-card mate" :class="{ resting: p.status !== 'active' }">
            <div class="mate-top">
              <span class="adm-avatar" :style="hueStyle(fullName(p))">{{ initials(fullName(p)) }}</span>
              <div class="who">
                <strong>{{ fullName(p) }}</strong>
                <small>{{ prettyPhone(p.cellphone) }}</small>
              </div>
              <button type="button" class="adm-btn icon sm" :aria-label="`Editar a ${fullName(p)}`" @click="openPerson(p)">
                <PosIcon name="edit" :size="17" />
              </button>
            </div>
            <div class="mate-shift">
              <span class="adm-pill" :class="SHIFT[p.workSchedule]?.tone">{{ SHIFT[p.workSchedule]?.label || 'Sin turno' }}</span>
              <small>{{ SHIFT[p.workSchedule]?.hours }}</small>
            </div>
            <div class="mate-status">
              <span>{{ p.status === 'active' ? 'En turno' : 'Descansando' }}</span>
              <button
                type="button"
                role="switch"
                class="adm-switch"
                :aria-checked="p.status === 'active'"
                :aria-label="`${fullName(p)} en turno`"
                :disabled="busyId === p.cellphone"
                @click="toggleStatus(p)"
              ></button>
            </div>
            <div class="mate-acts">
              <a class="adm-btn wa sm" :href="waLink(p.cellphone)" target="_blank" rel="noopener"><PosIcon name="chat" :size="16" /> WhatsApp</a>
              <a class="adm-btn sm" :href="`tel:${p.cellphone}`"><PosIcon name="phone" :size="16" /> Llamar</a>
            </div>
          </article>
        </div>
        <div v-else-if="!loading.staff" class="adm-empty">
          <PosIcon name="users" :size="30" />
          <h3>{{ people.length ? 'Nadie en ese turno' : 'Sin personal registrado' }}</h3>
          <p v-if="!people.length">Anota a quien te ayuda en la tienda con su celular y turno para tenerlos a la mano.</p>
          <button v-if="!people.length" type="button" class="adm-btn primary" @click="openPerson()">
            <PosIcon name="user-plus" :size="18" /> Agregar persona
          </button>
        </div>
      </section>

      <!-- ============ Diálogo: invitar ============ -->
      <Teleport to="body">
        <div v-if="showInvite" class="adm-dlg-bg" @click.self="showInvite = false">
          <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="inv-title" @submit.prevent="sendInvite">
            <div class="adm-dlg-head">
              <span class="adm-dlg-ico"><PosIcon name="mail" :size="22" /></span>
              <div>
                <h3 id="inv-title">Invitar al equipo</h3>
                <p>Le mandamos un correo para que cree su usuario y contraseña.</p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showInvite = false"><PosIcon name="x" :size="18" /></button>
            </div>
            <label class="adm-field">
              <span>Correo</span>
              <input ref="inviteInput" v-model="inviteForm.email" class="adm-inp" type="email" required maxlength="120" autocomplete="off" placeholder="persona@correo.com" />
            </label>
            <div class="adm-field">
              <span>¿Qué puede hacer?</span>
              <div class="adm-choices">
                <button
                  v-for="r in INVITE_ROLES"
                  :key="r"
                  type="button"
                  class="adm-choice"
                  :aria-pressed="inviteForm.role === r"
                  @click="inviteForm.role = r"
                >
                  <strong>{{ ROLE[r].label }}</strong>
                  <small>{{ ROLE[r].can }}</small>
                </button>
              </div>
            </div>
            <p v-if="inviteErr" class="adm-err">{{ inviteErr }}</p>
            <div class="adm-dlg-acts">
              <button type="button" class="adm-btn" @click="showInvite = false">Cancelar</button>
              <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? 'Enviando…' : 'Enviar invitación' }}</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- ============ Diálogo: persona ============ -->
      <Teleport to="body">
        <div v-if="showPerson" class="adm-dlg-bg" @click.self="showPerson = false">
          <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="per-title" @submit.prevent="savePerson">
            <div class="adm-dlg-head">
              <span class="adm-dlg-ico"><PosIcon name="user-plus" :size="22" /></span>
              <div>
                <h3 id="per-title">{{ editingPhone ? 'Editar persona' : 'Agregar persona' }}</h3>
                <p>{{ editingPhone ? 'El celular no se puede cambiar.' : 'Se identifica por su celular.' }}</p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showPerson = false"><PosIcon name="x" :size="18" /></button>
            </div>
            <div class="adm-row2">
              <label class="adm-field">
                <span>Nombre</span>
                <input ref="personInput" v-model="personForm.name" class="adm-inp" required maxlength="80" autocomplete="off" />
              </label>
              <label class="adm-field">
                <span>Apellido</span>
                <input v-model="personForm.lastName" class="adm-inp" required maxlength="80" autocomplete="off" />
              </label>
            </div>
            <label class="adm-field">
              <span>Celular</span>
              <input
                :value="formatMxPhone(personForm.cellphone)"
                class="adm-inp"
                type="tel"
                inputmode="numeric"
                autocomplete="off"
                required
                :disabled="Boolean(editingPhone)"
                placeholder="55 1234 5678"
                @input="onCell"
              />
            </label>
            <div class="adm-field">
              <span>Turno</span>
              <div class="adm-choices cols3">
                <button
                  v-for="s in SHIFTS"
                  :key="s.id"
                  type="button"
                  class="adm-choice"
                  :aria-pressed="personForm.workSchedule === s.id"
                  @click="personForm.workSchedule = s.id"
                >
                  <strong>{{ s.label }}</strong>
                  <small>{{ s.hours }}</small>
                </button>
              </div>
            </div>
            <div class="switch-row">
              <span>{{ personForm.status === 'active' ? 'En turno ahora' : 'Descansando ahora' }}</span>
              <button
                type="button"
                role="switch"
                class="adm-switch"
                :aria-checked="personForm.status === 'active'"
                aria-label="En turno"
                @click="personForm.status = personForm.status === 'active' ? 'rest' : 'active'"
              ></button>
            </div>
            <p v-if="personErr" class="adm-err">{{ personErr }}</p>
            <div class="adm-dlg-acts" :class="{ three: editingPhone }">
              <button v-if="editingPhone" type="button" class="adm-btn danger-ghost" :disabled="saving" @click="removePerson">
                {{ confirmId === `p${editingPhone}` ? '¿Seguro?' : 'Eliminar' }}
              </button>
              <button type="button" class="adm-btn" @click="showPerson = false">Cancelar</button>
              <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import "../admin.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";
import { formatMxPhone, phoneDigits, prettyPhone } from "../phone";

const ROLE = {
  admin: { label: "Admin", tone: "info", can: "Todo: productos, precios, reportes, ajustes y equipo." },
  cashier: { label: "Cajero", tone: "good", can: "Vende, cobra, abre y cierra caja. Ve Resumen, Clientes e Inventario." },
};
const INVITE_ROLES = ["cashier", "admin"];
const INVITE = {
  pending: { label: "Pendiente", tone: "warn" },
  accepted: { label: "Aceptada", tone: "good" },
  revoked: { label: "Revocada", tone: "" },
  expired: { label: "Vencida", tone: "" },
};
const SHIFTS = [
  { id: "morning", label: "Mañana", hours: "7 a 14 h", tone: "warn" },
  { id: "afternoon", label: "Tarde", hours: "14 a 21 h", tone: "info" },
  { id: "evening", label: "Noche", hours: "21 a 7 h", tone: "" },
];
const SHIFT = Object.fromEntries(SHIFTS.map((s) => [s.id, s]));

const route = useRoute();
const router = useRouter();
const tab = ref(route.query.tab === "staff" ? "staff" : "access");
function setTab(id) {
  tab.value = id;
  router.replace({ query: { ...route.query, tab: id } }).catch(() => {});
}

const loading = reactive({ team: true, staff: true });
const saving = ref(false);
const error = ref("");
const flash = ref("");
let flashTimer = null;
function say(msg) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ""), 4000);
}
const busyId = ref("");
const confirmId = ref("");
let confirmTimer = null;
// Botones de borrar: el primer toque pide confirmación y se olvida a los 4 s
function needsConfirm(id) {
  if (confirmId.value === id) {
    confirmId.value = "";
    return false;
  }
  confirmId.value = id;
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => (confirmId.value = ""), 4000);
  return true;
}
function errText(e, fallback) {
  const d = e?.response?.data;
  if (typeof d === "string" && d) return d;
  if (d?.message) return d.message;
  return fallback;
}

// ---------- Utilidades ----------
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
function hueStyle(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { "--h": h };
}
function onCell(e) {
  personForm.cellphone = phoneDigits(e.target.value);
  e.target.value = formatMxPhone(personForm.cellphone);
}
function waLink(p) {
  const d = String(p || "").replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? `52${d}` : d}`;
}

// ---------- Acceso ----------
const users = ref([]);
const me = ref("");
const planName = ref("");
const seats = ref(null);
const invites = ref([]);
function displayName(u) {
  const full = `${u.name || ""} ${u.lastName || ""}`.trim();
  return full || u.username || u.email || "Usuario";
}
const activeUsers = computed(() => users.value.filter((u) => !u.disabled).length);
const sortedUsers = computed(() => {
  const order = { admin: 0, cashier: 1 };
  return [...users.value].sort(
    (a, b) =>
      (a.username === me.value ? -1 : b.username === me.value ? 1 : 0) ||
      Number(a.disabled) - Number(b.disabled) ||
      (order[a.role] ?? 9) - (order[b.role] ?? 9) ||
      displayName(a).localeCompare(displayName(b), "es")
  );
});
const sortedInvites = computed(() => {
  const order = { pending: 0, accepted: 1, expired: 2, revoked: 3 };
  return [...invites.value].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
});
const seatsFull = computed(() => Boolean(seats.value && seats.value.max != null && seats.value.used + seats.value.pending >= seats.value.max));
function pct(n) {
  const max = seats.value?.max;
  return max ? Math.min(100, (Number(n || 0) / max) * 100) : 0;
}
// Invitaciones viejas con roles de restaurante se muestran (y aceptan) como cajero
function roleKey(r) {
  return ["hosstess", "waiter", "kitchen"].includes(r) ? "cashier" : r;
}
function lastAccess(u) {
  if (!u.lastLoginAt) return "aún no ha entrado";
  const d = new Date(u.lastLoginAt);
  if (Number.isNaN(d.getTime())) return "aún no ha entrado";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "entró hoy";
  if (days === 1) return "entró ayer";
  if (days < 30) return `entró hace ${days} días`;
  return `entró el ${d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}`;
}
function roleButtonLabel(u) {
  const name = displayName(u);
  const to = u.role === 'admin' ? 'cajero' : 'dueño';
  return confirmId.value === `role${u.id}`
    ? `¿Confirmar que ${name} pase a ${to}? Toca otra vez para confirmar`
    : `Hacer ${to} a ${name}`;
}
async function changeRole(u) {
  const to = u.role === 'admin' ? 'cashier' : 'admin';
  if (needsConfirm(`role${u.id}`)) return;
  busyId.value = u.id;
  try {
    await apiService.changeUserRole(u.id, to);
    say(
      to === 'admin'
        ? `${displayName(u)} ahora es dueño: ve y cambia todo. Tendrá que volver a iniciar sesión.`
        : `${displayName(u)} ahora es cajero. Tendrá que volver a iniciar sesión.`
    );
    await loadTeam();
  } catch (e) {
    error.value = errText(e, "No se pudo cambiar el rol.");
  } finally {
    busyId.value = "";
  }
}
async function deactivate(u) {
  if (needsConfirm(`x${u.id}`)) return;
  busyId.value = u.id;
  try {
    await apiService.deactivateUser(u.id);
    say(`${displayName(u)} ya no puede entrar. Su lugar quedó libre.`);
    await loadTeam();
  } catch (e) {
    error.value = errText(e, "No se pudo desactivar la cuenta.");
  } finally {
    busyId.value = "";
  }
}
async function reactivate(u) {
  busyId.value = u.id;
  try {
    await apiService.reactivateUser(u.id);
    say(`${displayName(u)} puede volver a entrar.`);
    await loadTeam();
  } catch (e) {
    error.value = errText(e, "No se pudo reactivar la cuenta.");
  } finally {
    busyId.value = "";
  }
}
function inviteWhen(i) {
  if (i.status === "pending" && i.expiresAt) {
    const days = Math.ceil((new Date(i.expiresAt) - Date.now()) / 86400000);
    if (days <= 0) return "vence hoy";
    return `vence en ${days} ${days === 1 ? "día" : "días"}`;
  }
  const d = new Date(i.acceptedAt || i.createdAt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const showInvite = ref(false);
const inviteErr = ref("");
const inviteInput = ref(null);
const inviteForm = reactive({ email: "", role: "cashier" });
function openInvite() {
  inviteForm.email = "";
  inviteForm.role = "cashier";
  inviteErr.value = "";
  showInvite.value = true;
  nextTick(() => inviteInput.value?.focus());
}
async function sendInvite() {
  saving.value = true;
  inviteErr.value = "";
  try {
    const email = inviteForm.email.trim().toLowerCase();
    await apiService.createInvite({ email, role: inviteForm.role });
    showInvite.value = false;
    say(`Invitación enviada a ${email}.`);
    loadTeam();
  } catch (e) {
    inviteErr.value = errText(e, "No se pudo enviar la invitación.");
  } finally {
    saving.value = false;
  }
}
async function revoke(i) {
  if (needsConfirm(`r${i.id}`)) return;
  busyId.value = i.id;
  try {
    await apiService.revokeInvite(i.id);
    say(`Invitación de ${i.email} revocada: el enlace ya no sirve.`);
    await loadTeam();
  } catch (e) {
    error.value = errText(e, "No se pudo revocar.");
  } finally {
    busyId.value = "";
  }
}
async function removeInvite(i) {
  if (needsConfirm(`d${i.id}`)) return;
  busyId.value = i.id;
  try {
    await apiService.deleteInvite(i.id);
    invites.value = invites.value.filter((x) => x.id !== i.id);
    say("Invitación eliminada.");
    loadTeam();
  } catch (e) {
    error.value = errText(e, "No se pudo eliminar.");
  } finally {
    busyId.value = "";
  }
}

// ---------- Personal ----------
const people = ref([]);
const shift = ref("all");
const counts = computed(() => ({
  active: people.value.filter((p) => p.status === "active").length,
  rest: people.value.filter((p) => p.status !== "active").length,
}));
function fullName(p) {
  return `${p.name || ""} ${p.lastName || ""}`.trim() || "Sin nombre";
}
const shownPeople = computed(() =>
  people.value
    .filter((p) => shift.value === "all" || p.workSchedule === shift.value)
    .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || fullName(a).localeCompare(fullName(b), "es"))
);

async function toggleStatus(p) {
  const next = p.status === "active" ? "rest" : "active";
  busyId.value = p.cellphone;
  try {
    await apiService.updateWaiter(p.cellphone, { status: next });
    p.status = next;
  } catch (e) {
    error.value = errText(e, "No se pudo cambiar el estado.");
  } finally {
    busyId.value = "";
  }
}

const showPerson = ref(false);
const editingPhone = ref("");
const personErr = ref("");
const personInput = ref(null);
const personForm = reactive({ name: "", lastName: "", cellphone: "", workSchedule: "morning", status: "active" });
function openPerson(p = null) {
  editingPhone.value = p?.cellphone || "";
  personForm.name = p?.name || "";
  personForm.lastName = p?.lastName || "";
  personForm.cellphone = p?.cellphone || "";
  personForm.workSchedule = p?.workSchedule || "morning";
  personForm.status = p ? p.status || "rest" : "active";
  personErr.value = "";
  confirmId.value = "";
  showPerson.value = true;
  nextTick(() => personInput.value?.focus());
}
async function savePerson() {
  const data = {
    name: personForm.name.trim(),
    lastName: personForm.lastName.trim(),
    workSchedule: personForm.workSchedule,
    status: personForm.status,
  };
  const phone = phoneDigits(personForm.cellphone);
  if (!editingPhone.value && phone.length !== 10) {
    personErr.value = "El celular lleva 10 dígitos.";
    return;
  }
  saving.value = true;
  personErr.value = "";
  try {
    if (editingPhone.value) {
      await apiService.updateWaiter(editingPhone.value, data);
      const idx = people.value.findIndex((x) => x.cellphone === editingPhone.value);
      if (idx >= 0) people.value[idx] = { ...people.value[idx], ...data };
      say(`${data.name} actualizado.`);
    } else {
      const created = await apiService.createWaiter({ ...data, cellphone: phone, role: "waiter" });
      people.value = [...people.value, created && typeof created === "object" ? created : { ...data, cellphone: phone }];
      say(`${data.name} agregado al personal.`);
    }
    showPerson.value = false;
  } catch (e) {
    personErr.value = errText(e, "No se pudo guardar.");
  } finally {
    saving.value = false;
  }
}
async function removePerson() {
  const phone = editingPhone.value;
  if (needsConfirm(`p${phone}`)) return;
  saving.value = true;
  try {
    await apiService.deleteWaiter(phone);
    people.value = people.value.filter((x) => x.cellphone !== phone);
    showPerson.value = false;
    say(`${personForm.name} quitado del personal.`);
  } catch (e) {
    personErr.value = errText(e, "No se pudo eliminar.");
  } finally {
    saving.value = false;
  }
}

// ---------- Carga ----------
const headline = computed(() => {
  if (loading.team && loading.staff) return "Cargando…";
  const parts = [];
  if (activeUsers.value) parts.push(`${activeUsers.value} con acceso`);
  if (people.value.length) parts.push(`${counts.value.active} en turno`);
  return parts.join(" · ") || "Tu equipo de trabajo";
});
async function loadTeam() {
  loading.team = true;
  try {
    const [team, inv] = await Promise.allSettled([apiService.getTeam(), apiService.getInvites()]);
    if (team.status === "fulfilled" && team.value) {
      users.value = Array.isArray(team.value.users) ? team.value.users : [];
      me.value = team.value.me || "";
      planName.value = team.value.planName || "";
      seats.value = team.value.seats || null;
    }
    if (inv.status === "fulfilled") invites.value = Array.isArray(inv.value) ? inv.value : [];
    if (team.status === "rejected" && inv.status === "rejected") error.value = "No se pudo cargar el equipo.";
  } finally {
    loading.team = false;
  }
}
async function loadStaff() {
  loading.staff = true;
  try {
    const list = await apiService.getWaiters();
    people.value = Array.isArray(list) ? list : [];
  } catch {
    error.value = "No se pudo cargar el personal.";
  } finally {
    loading.staff = false;
  }
}

onMounted(() => {
  loadTeam();
  loadStaff();
});
</script>

<style scoped>
.sec > * + * { margin-top: 0.75rem; }
.who { flex: 1; min-width: 0; display: grid; }
.who strong { display: flex; align-items: center; gap: 0.4rem; min-width: 0; overflow: hidden; font-size: 0.95rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.who small { overflow: hidden; font-size: 0.8rem; color: var(--timber-muted); text-overflow: ellipsis; white-space: nowrap; }
.me { padding: 0.1rem 0.45rem; font-size: 0.68rem; }

/* Lugares del plan */
.seats { display: grid; gap: 0.6rem; }
.seats-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
.seats-top h2 { margin: 0; font-size: 1rem; font-weight: 800; }
.seats-top p { margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--timber-muted); }
.seats-top strong { font-size: 1.15rem; font-weight: 800; white-space: nowrap; font-variant-numeric: tabular-nums; }
.seats-bar { display: flex; height: 0.6rem; overflow: hidden; border-radius: 999px; background: var(--timber-surface); }
.seats-bar .used { background: var(--timber-primary); }
.seats-bar .pend { background: repeating-linear-gradient(45deg, var(--timber-warning), var(--timber-warning) 4px, color-mix(in srgb, var(--timber-warning) 50%, transparent) 4px, color-mix(in srgb, var(--timber-warning) 50%, transparent) 8px); }
.seats-full { margin: 0; font-size: 0.85rem; font-weight: 700; color: var(--timber-warning); }

/* Listas de personas e invitaciones */
.people, .invites { list-style: none; margin: 0; padding: 0; }
.people li, .invites li { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0; }
.people li + li, .invites li + li { border-top: 1px solid var(--timber-line); }
.role { flex-shrink: 0; }
.foot { margin-top: 0.75rem; padding-top: 0.7rem; border-top: 1px dashed var(--timber-line); }
.inv-ico {
  width: 2.6rem;
  height: 2.6rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.85rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
}
.inv-acts { display: flex; gap: 0.35rem; flex-shrink: 0; }
.people li.off .who strong, .people li.off .who small { opacity: 0.55; }
.people li.off .adm-avatar { filter: grayscale(1); opacity: 0.6; }

/* Personal */
.crew {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
  gap: 0.65rem;
}
.mate { display: grid; align-content: start; gap: 0.65rem; padding: 0.85rem; border-left: 4px solid var(--timber-success); }
.mate.resting { border-left-color: var(--timber-line); }
.mate-top { display: flex; align-items: center; gap: 0.65rem; }
.mate-shift { display: flex; align-items: center; gap: 0.5rem; }
.mate-shift small { font-size: 0.8rem; color: var(--timber-muted); }
.mate-status,
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.7rem;
  border-radius: 0.75rem;
  background: var(--timber-surface);
  font-size: 0.88rem;
  font-weight: 700;
}
.mate-acts { display: flex; gap: 0.35rem; }
.mate-acts .adm-btn { flex: 1; }

@media (max-width: 767.98px) {
  .invites li, .people li { flex-wrap: wrap; }
  .invites .who, .people .who { flex-basis: calc(100% - 3.3rem); }
  .invites .adm-pill, .people .adm-pill { margin-left: 3.3rem; }
  .inv-acts { margin-left: auto; }
}
</style>
