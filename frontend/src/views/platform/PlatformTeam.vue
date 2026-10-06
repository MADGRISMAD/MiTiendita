<template>
  <PlatformFrame title="Equipo" :subtitle="subtitle">
    <template #actions>
      <button type="button" class="adm-btn primary" @click="showNew = true">Agregar persona</button>
    </template>

    <p v-if="flash" class="adm-banner ok" role="status">{{ flash }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <section class="adm-card pf-card-stack" :class="{ 'adm-loading': loading }">
      <div class="adm-card-head">
        <div>
          <h2>Quién tiene acceso</h2>
          <p><strong>Admin</strong> ve dinero, planes y equipo. <strong>Soporte</strong> solo atiende clientes y tickets.</p>
        </div>
      </div>
      <div class="pf-table-wrap">
        <table class="pf-table">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Perfil</th>
              <th scope="col">Verificación en 2 pasos</th>
              <th scope="col">Última vez</th>
              <th scope="col"><span class="pf-sr">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in staff" :key="p.id">
              <td>
                <div class="who">
                  <ClientAvatar :name="fullName(p)" />
                  <span>
                    <strong>{{ fullName(p) }}<span v-if="p.username === me" class="adm-pill info" style="margin-left: 0.4rem">Tú</span></strong>
                    <small>{{ p.email }} · @{{ p.username }}</small>
                  </span>
                </div>
              </td>
              <td>
                <span class="adm-pill" :class="p.role === 'platform_admin' ? 'info' : ''">{{ p.roleName }}</span>
                <span v-if="p.permanent" class="adm-pill good" style="margin-left: 0.4rem" title="No se puede quitar del equipo">Permanente</span>
              </td>
              <td>
                <span v-if="p.mfaEnabled" class="adm-pill good">Activa</span>
                <span v-else class="adm-pill warn" title="Tiene que activarla la próxima vez que entre">Pendiente</span>
              </td>
              <td>{{ p.lastLoginAt ? ago(p.lastLoginAt) : "nunca ha entrado" }}</td>
              <td>
                <div v-if="p.username !== me" class="acts">
                  <button type="button" class="adm-btn sm" :disabled="busy === p.id || !p.mfaEnabled" @click="resetMfa(p)">
                    {{ confirm === `mfa${p.id}` ? "¿Restablecer?" : "Restablecer 2FA" }}
                  </button>
                  <button v-if="!p.permanent" type="button" class="adm-btn sm danger-ghost" :disabled="busy === p.id" @click="remove(p)">
                    {{ confirm === `del${p.id}` ? "¿Quitar?" : "Quitar" }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="adm-hint">
        <strong>Restablecer 2FA</strong> es para quien perdió su celular y sus códigos de respaldo: se le cierran las sesiones y la próxima vez que entre
        la activa de nuevo. Quedan registradas ambas acciones.
      </p>
    </section>

    <section class="adm-card pf-card-stack">
      <div class="adm-card-head">
        <div>
          <h2>Movimientos del equipo</h2>
          <p>Lo que se ha cambiado en clientes, licencias, gastos y accesos.</p>
        </div>
      </div>
      <p v-if="!activity.length && !loading" class="pf-muted">Aún no hay movimientos.</p>
      <ul v-else class="pf-timeline">
        <li v-for="a in activity" :key="a.id">
          <span class="dot" aria-hidden="true"></span>
          <div>
            <p>{{ a.message }}</p>
            <small>
              {{ a.actor || "Sistema" }}
              <template v-if="a.businessName"> · <router-link :to="{ name: 'platformClient', params: { id: a.tenantId } }">{{ a.businessName }}</router-link></template>
            </small>
          </div>
          <time :datetime="a.at" :title="dateTime(a.at)">{{ ago(a.at) }}</time>
        </li>
      </ul>
    </section>

    <StaffDialog v-if="showNew" @close="showNew = false" @created="created" />
  </PlatformFrame>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PlatformFrame from "../../components/platform/PlatformFrame.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import StaffDialog from "../../components/platform/StaffDialog.vue";
import { apiService } from "../../apiService";
import { authStore } from "../../authStore";
import { ago, dateTime } from "../../platform/format";

const staff = ref([]);
const activity = ref([]);
const loading = ref(true);
const error = ref("");
const flash = ref("");
const showNew = ref(false);
const busy = ref("");
const confirm = ref("");
let confirmTimer = null;

const me = computed(() => authStore.username || "");
const fullName = (p) => `${p.name || ""} ${p.lastName || ""}`.trim() || p.username;
const subtitle = computed(() => {
  const n = staff.value.length;
  const pending = staff.value.filter((p) => !p.mfaEnabled).length;
  return n ? `${n} ${n === 1 ? "persona" : "personas"}${pending ? ` · ${pending} sin verificación en 2 pasos` : ""}` : "Cargando…";
});

function say(msg) {
  flash.value = msg;
  setTimeout(() => (flash.value = ""), 5000);
}
function needsConfirm(key) {
  if (confirm.value === key) {
    confirm.value = "";
    return false;
  }
  confirm.value = key;
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => (confirm.value = ""), 4000);
  return true;
}

async function load() {
  loading.value = true;
  const [s, a] = await Promise.allSettled([apiService.platformListStaff(), apiService.platformActivity(40)]);
  if (s.status === "fulfilled") staff.value = Array.isArray(s.value) ? s.value : [];
  else error.value = "No pude cargar al equipo.";
  if (a.status === "fulfilled") activity.value = a.value?.items || [];
  loading.value = false;
}

async function created(person) {
  showNew.value = false;
  say(`${person.roleName} creado: ${person.username}. Al entrar tendrá que activar la verificación en dos pasos.`);
  await load();
}

async function resetMfa(p) {
  if (needsConfirm(`mfa${p.id}`)) return;
  busy.value = p.id;
  error.value = "";
  try {
    await apiService.platformResetStaffMfa(p.id);
    say(`Listo: ${fullName(p)} activará la verificación en dos pasos la próxima vez que entre.`);
    await load();
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude restablecer la verificación.";
  } finally {
    busy.value = "";
  }
}

async function remove(p) {
  if (needsConfirm(`del${p.id}`)) return;
  busy.value = p.id;
  error.value = "";
  try {
    await apiService.platformDeleteStaff(p.id);
    say(`${fullName(p)} ya no está en el equipo.`);
    await load();
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude quitar a esa persona.";
  } finally {
    busy.value = "";
  }
}

onMounted(load);
</script>
