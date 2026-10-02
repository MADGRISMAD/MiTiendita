<template>
  <AppShell>
    <div class="staff-page">
      <div class="toolbar">
        <p>Gestiona empleados de la tienda y su disponibilidad en turno.</p>
        <button type="button" class="btn-primary" @click="showForm = true">Agregar empleado</button>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="grid">
        <article v-for="w in waiters" :key="w.cellphone" class="card">
          <div class="card-head">
            <h3>{{ w.name }} {{ w.lastName }}</h3>
            <span class="status" :class="w.status">{{ w.status === 'active' ? 'En turno' : 'Descanso' }}</span>
          </div>
          <p>Tel: {{ w.cellphone }}</p>
          <p>Turno: {{ scheduleLabel(w.workSchedule) }}</p>
          <div class="actions">
            <button type="button" @click="toggleStatus(w)">
              {{ w.status === 'active' ? 'Pasar a descanso' : 'Poner en turno' }}
            </button>
            <button type="button" class="danger" @click="remove(w)">Eliminar</button>
          </div>
        </article>
        <p v-if="!waiters.length && !loading" class="empty">No hay personal registrado.</p>
      </div>

      <Teleport to="body">
        <div v-if="showForm" class="modal-bg">
          <form class="modal" @submit.prevent="create" role="dialog" aria-modal="true" aria-labelledby="staff-form-title">
            <h3 id="staff-form-title">Nuevo empleado</h3>
            <div class="modal-body">
              <label>Nombre<input v-model="form.name" required autocomplete="given-name" /></label>
              <label>Apellido<input v-model="form.lastName" required autocomplete="family-name" /></label>
              <label>Celular (10 dígitos)
                <input v-model="form.cellphone" maxlength="10" pattern="\d{10}" inputmode="numeric" required />
              </label>
              <label>Turno
                <select v-model="form.workSchedule">
                  <option value="morning">Mañana</option>
                  <option value="afternoon">Tarde</option>
                  <option value="evening">Noche</option>
                </select>
              </label>
              <label>Estado
                <select v-model="form.status">
                  <option value="active">En turno</option>
                  <option value="rest">Descanso</option>
                </select>
              </label>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showForm = false">Cancelar</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                {{ saving ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { apiService } from "../apiService";

const waiters = ref([]);
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const error = ref("");

const form = reactive({
  name: "",
  lastName: "",
  cellphone: "",
  workSchedule: "morning",
  status: "active",
});

function scheduleLabel(s) {
  return { morning: "Mañana", afternoon: "Tarde", evening: "Noche" }[s] || s || "—";
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    waiters.value = (await apiService.getWaiters()) || [];
  } catch (e) {
    error.value = "No se pudo cargar el personal.";
    waiters.value = [];
  } finally {
    loading.value = false;
  }
}

async function create() {
  saving.value = true;
  error.value = "";
  try {
    const created = await apiService.createWaiter({ ...form, role: "waiter" });
    waiters.value = [...waiters.value, created];
    showForm.value = false;
    form.name = "";
    form.lastName = "";
    form.cellphone = "";
  } catch (e) {
    error.value = e.response?.data || "No se pudo crear el empleado.";
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(w) {
  const next = w.status === "active" ? "rest" : "active";
  try {
    await apiService.updateWaiter(w.cellphone, { status: next });
    w.status = next;
  } catch {
    error.value = "No se pudo actualizar el estado.";
  }
}

async function remove(w) {
  if (!confirm(`¿Eliminar a ${w.name} ${w.lastName}?`)) return;
  try {
    await apiService.deleteWaiter(w.cellphone);
    waiters.value = waiters.value.filter((x) => x.cellphone !== w.cellphone);
  } catch {
    error.value = "No se pudo eliminar.";
  }
}

onMounted(load);
</script>

<style scoped>
.staff-page { animation: t-fade-up .45s ease both; }
.toolbar { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1.2rem; flex-wrap:wrap; }
.toolbar p { margin:0; color:var(--timber-muted); }
.btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; border-radius:.7rem; padding:.65rem 1.05rem; font-weight:600; cursor:pointer; box-shadow:var(--timber-shadow); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr)); gap:1rem; }
.card { background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1.1rem; padding:1.15rem; box-shadow:var(--timber-shadow); transition:transform .18s ease; color:var(--timber-ink); }
.card:hover { transform:translateY(-2px); }
.card-head { display:flex; justify-content:space-between; gap:.5rem; align-items:start; }
.card h3 { margin:0; font-family:var(--font-display); font-size:1.2rem; font-weight:700; letter-spacing:-0.01em; }
.card p { margin:.4rem 0 0; font-size:.88rem; color:var(--timber-muted); }
.status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.7rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
  white-space: nowrap;
}
.status.active { background:var(--timber-success-soft); color:var(--timber-success); }
.status.rest { background:var(--timber-surface); color:var(--timber-muted); }
.actions { display:flex; gap:.45rem; margin-top:.95rem; flex-wrap:wrap; }
.actions button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:.6rem; padding:.45rem .7rem; cursor:pointer; font-size:.8rem; font-weight:600; }
.actions .danger { color:var(--timber-danger); border-color:color-mix(in srgb, var(--timber-danger) 35%, transparent); }
.empty, .error { color:var(--timber-muted); }
.error { color:var(--timber-danger); margin-bottom:.75rem; }

.modal-bg {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(10, 16, 14, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0.75rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.modal {
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 1.15rem 1.15rem 0.85rem 0.85rem;
  padding: 1.15rem 1.15rem 0.85rem;
  width: min(26rem, 100%);
  max-height: min(90dvh, 40rem);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px solid var(--timber-line);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}
.modal h3 {
  margin: 0;
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.modal-body {
  display: grid;
  gap: 0.7rem;
  overflow: auto;
  min-height: 0;
  padding-right: 0.15rem;
  -webkit-overflow-scrolling: touch;
}
.modal label { display: grid; gap: 0.3rem; font-size: 0.88rem; font-weight: 600; }
.modal input,
.modal select {
  min-height: 3rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.7rem;
  padding: 0.65rem 0.8rem;
  font: inherit;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
}
.modal-actions {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 0.55rem;
  padding-top: 0.25rem;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--timber-line);
  margin-top: 0.15rem;
}
.modal-actions button {
  min-height: 3.15rem;
  border-radius: 0.85rem;
  border: 1px solid var(--timber-line);
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
}
.modal-actions .btn-primary {
  border: none;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  box-shadow: var(--timber-shadow);
}
.modal-actions .btn-primary:disabled { opacity: 0.65; cursor: wait; }

@media (min-width: 720px) {
  .modal-bg {
    align-items: center;
    padding: 1.5rem;
  }
  .modal {
    border-radius: 1.15rem;
    padding: 1.35rem;
    max-height: min(88vh, 36rem);
  }
}
</style>
