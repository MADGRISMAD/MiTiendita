<template>
  <AppShell>
    <div class="customers-page">
      <div class="toolbar">
        <div class="toolbar-left">
          <p>Gestiona tus clientes: nombre, teléfono, correo y notas.</p>
          <div class="search-box">
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Buscar por nombre o teléfono…"
              @input="onSearch"
            />
          </div>
        </div>
        <button type="button" class="btn-primary" @click="openCreate">Agregar cliente</button>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="grid">
        <article v-for="c in customers" :key="c.id" class="card">
          <div class="card-head">
            <h3>{{ c.name }}</h3>
          </div>
          <p v-if="c.phone">Tel: {{ c.phone }}</p>
          <p v-if="c.email">Email: {{ c.email }}</p>
          <p v-if="c.notes" class="notes">{{ c.notes }}</p>
          <div class="actions">
            <button type="button" @click="openEdit(c)">Editar</button>
            <button type="button" class="danger" @click="remove(c)">Eliminar</button>
          </div>
        </article>
        <p v-if="!customers.length && !loading" class="empty">No hay clientes registrados.</p>
      </div>

      <!-- Modal crear / editar -->
      <Teleport to="body">
        <div v-if="showForm" class="modal-bg" @click.self="showForm = false">
          <form class="modal" @submit.prevent="save" role="dialog" aria-modal="true" aria-labelledby="customer-form-title">
            <h3 id="customer-form-title">{{ editing ? 'Editar cliente' : 'Nuevo cliente' }}</h3>
            <div class="modal-body">
              <label>Nombre<input v-model="form.name" required /></label>
              <label>Teléfono<input v-model="form.phone" inputmode="tel" /></label>
              <label>Correo<input v-model="form.email" type="email" /></label>
              <label>Notas<textarea v-model="form.notes" rows="2"></textarea></label>
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

const customers = ref([]);
const loading = ref(false);
const saving = ref(false);
const showForm = ref(false);
const editing = ref(null);
const error = ref("");
const searchQuery = ref("");
let searchTimer = null;

const form = reactive({
  name: "",
  phone: "",
  email: "",
  notes: "",
});

function resetForm() {
  form.name = "";
  form.phone = "";
  form.email = "";
  form.notes = "";
  editing.value = null;
}

function openCreate() {
  resetForm();
  showForm.value = true;
}

function openEdit(c) {
  editing.value = c.id;
  form.name = c.name || "";
  form.phone = c.phone || "";
  form.email = c.email || "";
  form.notes = c.notes || "";
  showForm.value = true;
}

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(), 300);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const q = searchQuery.value.trim();
    customers.value = (await apiService.getCustomers(q || undefined)) || [];
  } catch {
    error.value = "No se pudo cargar los clientes.";
    customers.value = [];
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    if (editing.value) {
      const updated = await apiService.updateCustomer(editing.value, { ...form });
      const idx = customers.value.findIndex((c) => c.id === editing.value);
      if (idx >= 0) customers.value[idx] = updated;
    } else {
      const created = await apiService.createCustomer({ ...form });
      customers.value = [created, ...customers.value];
    }
    showForm.value = false;
    resetForm();
  } catch (e) {
    error.value = e.response?.data || "No se pudo guardar el cliente.";
  } finally {
    saving.value = false;
  }
}

async function remove(c) {
  if (!confirm(`¿Eliminar a ${c.name}?`)) return;
  try {
    await apiService.deleteCustomer(c.id);
    customers.value = customers.value.filter((x) => x.id !== c.id);
  } catch {
    error.value = "No se pudo eliminar.";
  }
}

onMounted(load);
</script>

<style scoped>
.customers-page { animation: t-fade-up .45s ease both; }
.toolbar { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1.2rem; flex-wrap:wrap; }
.toolbar-left { display:flex; flex-direction:column; gap:.55rem; flex:1; min-width:0; }
.toolbar p { margin:0; color:var(--timber-muted); }
.search-box input {
  width:100%; max-width:22rem; min-height:2.75rem;
  border:1px solid var(--timber-line); border-radius:.7rem;
  padding:.55rem .85rem; font:inherit;
  background:var(--timber-panel-elevated); color:var(--timber-ink);
}
.btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; border-radius:.7rem; padding:.65rem 1.05rem; font-weight:600; cursor:pointer; box-shadow:var(--timber-shadow); white-space:nowrap; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(16.5rem,1fr)); gap:1rem; }
.card { background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1.1rem; padding:1.15rem; box-shadow:var(--timber-shadow); transition:transform .18s ease; color:var(--timber-ink); }
.card:hover { transform:translateY(-2px); }
.card-head { display:flex; justify-content:space-between; gap:.5rem; align-items:start; }
.card h3 { margin:0; font-family:var(--font-display); font-size:1.2rem; font-weight:700; letter-spacing:-0.01em; }
.card p { margin:.4rem 0 0; font-size:.88rem; color:var(--timber-muted); }
.card .notes { font-style:italic; }
.actions { display:flex; gap:.45rem; margin-top:.95rem; flex-wrap:wrap; }
.actions button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:.6rem; padding:.45rem .7rem; cursor:pointer; font-size:.8rem; font-weight:600; }
.actions .danger { color:var(--timber-danger); border-color:color-mix(in srgb, var(--timber-danger) 35%, transparent); }
.empty, .error { color:var(--timber-muted); }
.error { color:var(--timber-danger); margin-bottom:.75rem; }

.modal-bg {
  position:fixed; inset:0; z-index:200;
  background:rgba(10,16,14,0.55); backdrop-filter:blur(6px);
  display:flex; align-items:flex-end; justify-content:center;
  padding:0.75rem; padding-bottom:calc(0.75rem + env(safe-area-inset-bottom,0px)); box-sizing:border-box;
}
.modal {
  background:var(--timber-panel); color:var(--timber-ink);
  border-radius:1.15rem 1.15rem .85rem .85rem;
  padding:1.15rem 1.15rem .85rem; width:min(26rem,100%);
  max-height:min(90dvh,40rem); display:flex; flex-direction:column; gap:.75rem;
  border:1px solid var(--timber-line); box-shadow:0 -8px 32px rgba(0,0,0,.22); overflow:hidden;
}
.modal h3 { margin:0; flex-shrink:0; font-family:var(--font-display); font-size:1.3rem; font-weight:700; letter-spacing:-.01em; }
.modal-body { display:grid; gap:.7rem; overflow:auto; min-height:0; padding-right:.15rem; -webkit-overflow-scrolling:touch; }
.modal label { display:grid; gap:.3rem; font-size:.88rem; font-weight:600; }
.modal input, .modal select, .modal textarea {
  min-height:3rem; border:1px solid var(--timber-line); border-radius:.7rem;
  padding:.65rem .8rem; font:inherit; background:var(--timber-panel-elevated); color:var(--timber-ink);
}
.modal textarea { resize:vertical; }
.modal-actions {
  flex-shrink:0; display:grid; grid-template-columns:1fr 1.2fr; gap:.55rem;
  padding-top:.25rem; padding-bottom:env(safe-area-inset-bottom,0px);
  border-top:1px solid var(--timber-line); margin-top:.15rem;
}
.modal-actions button {
  min-height:3.15rem; border-radius:.85rem; border:1px solid var(--timber-line);
  background:var(--timber-surface); color:var(--timber-ink); font-weight:700; font-size:1rem; cursor:pointer;
}
.modal-actions .btn-primary { border:none; background:var(--timber-primary); color:var(--timber-on-primary); box-shadow:var(--timber-shadow); }
.modal-actions .btn-primary:disabled { opacity:.65; cursor:wait; }

@media (min-width:720px) {
  .modal-bg { align-items:center; padding:1.5rem; }
  .modal { border-radius:1.15rem; padding:1.35rem; max-height:min(88vh,36rem); }
}
</style>
