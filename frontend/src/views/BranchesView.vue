<template>
  <AppShell>
    <div class="adm br">
      <header class="adm-head">
        <div>
          <h1>Sucursales</h1>
          <p>{{ headline }}</p>
        </div>
      </header>

      <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
        <button type="button" class="adm-x" aria-label="Cerrar aviso" @click="error = ''"><PosIcon name="x" :size="16" /></button>
      </p>

      <div :class="{ 'adm-loading': loading }">
        <!-- No es el dueño -->
        <div v-if="ov && !ov.isOwner" class="adm-empty">
          <PosIcon name="store" :size="30" />
          <h3>Solo el dueño administra las sucursales</h3>
          <p>El dueño de la tienda es quien puede abrir sucursales, entrar a ellas y ver el reporte de todas juntas.</p>
        </div>

        <template v-else-if="ov">
          <!-- Plan sin sucursales -->
          <div v-if="!ov.organization && ov.limit <= 1" class="adm-card br-plan">
            <div class="adm-card-head">
              <div>
                <h2>Tu plan incluye una sola tienda</h2>
                <p>Con el plan <b>Pro</b> puedes abrir hasta {{ proLimit }} sucursales y ver todas juntas.</p>
              </div>
            </div>
            <router-link class="adm-btn primary" to="/billing">Ver planes</router-link>
          </div>

          <!-- Lista -->
          <section v-if="ov.organization" class="br-list">
            <article v-for="b in ov.branches" :key="b.id" class="adm-card br-card" :class="{ current: b.current, off: b.suspended }">
              <div class="br-top">
                <span class="adm-avatar" :style="hueStyle(b.name)">{{ initials(b.name) }}</span>
                <div class="br-name">
                  <strong>{{ b.name }}</strong>
                  <small>
                    <span v-if="b.isMatrix" class="adm-pill">Matriz</span>
                    <span v-if="b.current" class="adm-pill ok">Estás aquí</span>
                    <span v-if="b.suspended" class="adm-pill warn">De baja</span>
                  </small>
                </div>
              </div>
              <div class="br-acts">
                <button v-if="!b.current && !b.suspended" type="button" class="adm-btn primary sm" :disabled="busy" @click="enter(b)">
                  <PosIcon name="store" :size="16" /> Entrar
                </button>
                <button v-if="!b.isMatrix && !b.suspended && !b.current" type="button" class="adm-btn danger-ghost sm" :disabled="busy" @click="askSuspend(b)">
                  Dar de baja
                </button>
                <button v-if="b.suspended" type="button" class="adm-btn sm" :disabled="busy" @click="reactivate(b)">Reactivar</button>
              </div>
            </article>
          </section>

          <!-- Nueva sucursal -->
          <form v-if="ov.limit > 1" class="adm-card br-new" @submit.prevent="create">
            <div class="adm-card-head">
              <div>
                <h2>{{ ov.organization ? "Nueva sucursal" : "Abre tu primera sucursal" }}</h2>
                <p v-if="ov.organization">{{ ov.active }} de {{ ov.limit }} sucursales en servicio</p>
                <p v-else>Tu tienda actual pasa a ser la <b>matriz</b>. Cada sucursal lleva su propio inventario, caja, clientes y equipo.</p>
              </div>
            </div>
            <div class="br-new-row">
              <label class="adm-field">
                <span>Nombre</span>
                <input v-model.trim="newName" class="adm-inp" maxlength="60" autocomplete="off" placeholder="Sucursal Centro" :disabled="!ov.canCreate || busy" required />
              </label>
              <button type="submit" class="adm-btn primary" :disabled="!ov.canCreate || busy || newName.length < 2">
                <PosIcon name="plus" :size="18" /> Crear sucursal
              </button>
            </div>
            <p v-if="!ov.canCreate" class="adm-hint">
              Llegaste al límite de tu plan ({{ ov.limit }}). Da de baja una sucursal o <router-link to="/billing">cambia de plan</router-link>.
            </p>
            <p v-else class="adm-hint">
              Copia tu giro, impuestos y colores. La suscripción es una sola: se paga desde la matriz.
            </p>
          </form>

          <!-- Reporte consolidado -->
          <section v-if="ov.organization" class="adm-card br-report">
            <div class="adm-card-head">
              <div>
                <h2>Todas juntas</h2>
                <p>Ventas por sucursal en el periodo</p>
              </div>
              <button type="button" class="adm-btn sm" :disabled="!report || busy" @click="downloadCsv">
                <PosIcon name="download" :size="16" /> CSV
              </button>
            </div>
            <div class="adm-tabs" role="group" aria-label="Periodo">
              <button v-for="p in PRESETS" :key="p.id" type="button" :class="{ on: preset === p.id }" :aria-pressed="preset === p.id" @click="setPreset(p.id)">
                {{ p.label }}
              </button>
            </div>
            <div v-if="report" class="br-table-wrap">
              <table class="br-table">
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th class="num">Ventas</th>
                    <th class="num">Tickets</th>
                    <th class="num hide-mobile">Promedio</th>
                    <th class="num hide-mobile">Devoluciones</th>
                    <th class="num hide-mobile">Por cobrar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in report.branches" :key="b.id" :class="{ off: b.suspended }">
                    <td>{{ b.name }}<small v-if="b.suspended"> (de baja)</small></td>
                    <td class="num">{{ money(b.sales) }}</td>
                    <td class="num">{{ b.tickets }}</td>
                    <td class="num hide-mobile">{{ money(b.average) }}</td>
                    <td class="num hide-mobile">{{ b.refunded }}<small v-if="b.refundedTotal"> · {{ money(b.refundedTotal) }}</small></td>
                    <td class="num hide-mobile">{{ money(b.owed) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th>Total</th>
                    <th class="num">{{ money(report.total.sales) }}</th>
                    <th class="num">{{ report.total.tickets }}</th>
                    <th class="num hide-mobile">{{ money(report.total.average) }}</th>
                    <th class="num hide-mobile">{{ report.total.refunded }}</th>
                    <th class="num hide-mobile">{{ money(report.total.owed) }}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p v-else-if="reportErr" class="adm-err">{{ reportErr }}</p>
            <p v-else class="adm-hint">Cargando…</p>
          </section>
        </template>
      </div>

      <!-- Confirmar baja -->
      <Teleport to="body">
        <div v-if="toSuspend" class="adm-dlg-bg" @click.self="toSuspend = null">
          <div class="adm-dlg" role="dialog" aria-modal="true" aria-label="Dar de baja la sucursal">
            <div class="adm-dlg-head">
              <div>
                <h3>¿Dar de baja «{{ toSuspend.name }}»?</h3>
                <p class="adm-hint">
                  Nadie podrá entrar a esa sucursal ni vender en ella. <b>No se borra nada</b>: sus ventas, inventario y clientes se
                  conservan y puedes reactivarla cuando quieras. Libera un lugar de tu plan.
                </p>
              </div>
            </div>
            <div class="adm-dlg-acts">
              <button type="button" class="adm-btn" @click="toSuspend = null">Volver</button>
              <button type="button" class="adm-btn danger" :disabled="busy" @click="suspend">Sí, dar de baja</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import "../admin.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";
import { applyOrg, enterBranch } from "../orgStore";

const proLimit = 5;
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const flash = ref("");
const ov = ref(null);
const newName = ref("");
const toSuspend = ref(null);
const report = ref(null);
const reportErr = ref("");
const preset = ref("month");

const PRESETS = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "7 días" },
  { id: "month", label: "Este mes" },
  { id: "30", label: "30 días" },
];

const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
const msgOf = (e, fallback) => e?.response?.data?.message || (typeof e?.response?.data === "string" ? e.response.data : "") || fallback;
const initials = (name) => {
  const p = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "?") + (p[1]?.[0] || "")).toUpperCase();
};
const hueStyle = (name) => {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { "--h": h };
};

const headline = computed(() => {
  if (loading.value || !ov.value) return "Cargando…";
  if (!ov.value.organization) return ov.value.isOwner ? "Una sola tienda por ahora" : "";
  return `${ov.value.organization.name} · ${ov.value.active} de ${ov.value.limit} sucursales en servicio`;
});

const day = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
function range() {
  const to = new Date();
  const from = new Date();
  if (preset.value === "week") from.setDate(from.getDate() - 6);
  else if (preset.value === "30") from.setDate(from.getDate() - 29);
  else if (preset.value === "month") from.setDate(1);
  return { from: day(from), to: day(to) };
}

async function load() {
  loading.value = true;
  try {
    ov.value = await apiService.getOrganization();
    applyOrg(ov.value);
    if (ov.value?.organization) await loadReport();
  } catch (e) {
    error.value = msgOf(e, "No se pudieron cargar las sucursales.");
  } finally {
    loading.value = false;
  }
}
async function loadReport() {
  reportErr.value = "";
  try {
    report.value = await apiService.getOrgSummary(range());
  } catch (e) {
    report.value = null;
    reportErr.value = msgOf(e, "No se pudo armar el reporte.");
  }
}
function setPreset(id) {
  preset.value = id;
  loadReport();
}

async function create() {
  busy.value = true;
  error.value = "";
  flash.value = "";
  try {
    const r = await apiService.createBranch(newName.value);
    ov.value = r.overview;
    applyOrg(ov.value);
    flash.value = `Sucursal «${r.branch.name}» creada. Entra a ella para cargar su inventario.`;
    newName.value = "";
    await loadReport();
  } catch (e) {
    error.value = msgOf(e, "No se pudo crear la sucursal.");
  } finally {
    busy.value = false;
  }
}

function askSuspend(b) {
  toSuspend.value = b;
}
async function suspend() {
  busy.value = true;
  try {
    ov.value = await apiService.suspendBranch(toSuspend.value.id);
    applyOrg(ov.value);
    flash.value = `«${toSuspend.value.name}» quedó de baja.`;
    toSuspend.value = null;
    await loadReport();
  } catch (e) {
    toSuspend.value = null;
    error.value = msgOf(e, "No se pudo dar de baja.");
  } finally {
    busy.value = false;
  }
}
async function reactivate(b) {
  busy.value = true;
  error.value = "";
  try {
    ov.value = await apiService.reactivateBranch(b.id);
    applyOrg(ov.value);
    flash.value = `«${b.name}» está activa otra vez.`;
    await loadReport();
  } catch (e) {
    error.value = msgOf(e, "No se pudo reactivar.");
  } finally {
    busy.value = false;
  }
}

/** Abre sesión en la sucursal y recarga todo: nada de la tienda anterior se queda en pantalla. */
async function enter(b) {
  busy.value = true;
  error.value = "";
  try {
    if (!(await enterBranch(b))) busy.value = false;
  } catch (e) {
    error.value = msgOf(e, "No se pudo cambiar de sucursal.");
    busy.value = false;
  }
}

async function downloadCsv() {
  try {
    const blob = await apiService.getOrgSummaryCsv(range());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sucursales_${range().from}_${range().to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    error.value = msgOf(e, "No se pudo descargar el CSV.");
  }
}

onMounted(load);
</script>

<style scoped>
.br > * + * { margin-top: 0.8rem; }
.br-list { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); }
.br-card { display: grid; gap: 0.7rem; align-content: space-between; }
.br-card.current { border-color: var(--timber-primary); }
.br-card.off { opacity: 0.7; }
.br-top { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
.br-name { display: grid; gap: 0.2rem; min-width: 0; }
.br-name strong { overflow-wrap: anywhere; }
.br-name small { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.br-acts { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.br-new-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; }
.br-new-row .adm-field { flex: 1 1 14rem; }
.br-table-wrap { overflow-x: auto; margin-top: 0.7rem; border: 1px solid var(--timber-line); border-radius: 0.9rem; }
.br-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.br-table th, .br-table td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid var(--timber-line); white-space: nowrap; }
.br-table td:first-child, .br-table th:first-child { white-space: normal; overflow-wrap: anywhere; }
.br-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.br-table tfoot th { border-bottom: 0; background: var(--timber-panel-elevated); }
.br-table tr.off td { color: var(--timber-muted); }
.br-table small { color: var(--timber-muted); font-weight: 600; }
</style>
