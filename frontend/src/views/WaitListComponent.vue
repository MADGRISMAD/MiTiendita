<template>
  <AppShell>
    <div class="waitlist-page">
      <div class="toolbar">
        <p>Clientes esperando mesa.</p>
        <button type="button" class="btn-primary" @click="mostrarModalAgregarCliente">Agregar cliente</button>
      </div>

      <div class="grid">
        <article
          v-for="cliente in clientesEnEspera"
          :key="cliente.telefono || cliente.celular"
          class="card"
          @click="mostrarModalOpciones(cliente)"
        >
          <h3>{{ cliente.nombre }}</h3>
          <p>Celular: {{ cliente.telefono }}</p>
        </article>
        <p v-if="!clientesEnEspera.length" class="empty">Lista vacía.</p>
      </div>

      <div v-if="modalAgregarCliente" class="modal-bg" >
        <div class="modal">
          <h3>Agregar cliente</h3>
          <input v-model="nombreNuevoCliente" type="text" placeholder="Nombre" />
          <input v-model="telefonoNuevoCliente" type="text" placeholder="Teléfono" />
          <div class="modal-actions">
            <button type="button" class="btn-primary" @click="agregarCliente">Agregar</button>
            <button type="button" @click="cerrarModalAgregarCliente">Cancelar</button>
          </div>
        </div>
      </div>

      <div v-if="modalOpcionesCliente" class="modal-bg" >
        <div class="modal">
          <h3>{{ clienteSeleccionado?.nombre }}</h3>
          <div class="modal-actions">
            <button type="button" class="btn-primary" @click="mostrarModalAsignarMesa">Asignar mesa</button>
            <button type="button" class="danger" @click="eliminarClienteEnEspera(clienteSeleccionado)">Eliminar</button>
            <button type="button" @click="cerrarModalOpcionesCliente">Cancelar</button>
          </div>
        </div>
      </div>

      <div v-if="modalAsignarMesa" class="modal-bg">
        <div class="modal">
          <h3>Asignar mesa</h3>
          <select v-model="mesaSeleccionada">
            <option v-for="mesa in mesasDisponibles" :key="mesa.id || mesa.numero" :value="mesa.id || mesa.numero">
              {{ mesa.nombre }} ({{ mesa.capacidad }})
            </option>
          </select>
          <div class="modal-actions">
            <button type="button" class="btn-primary" @click="asignarMesaACliente">Asignar</button>
            <button type="button" @click="cerrarModalAsignarMesa">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import AppShell from '../components/AppShell.vue';
import { ref, onMounted } from 'vue';
import { apiService } from '../apiService';

const clientesEnEspera = ref([]);
const modalAgregarCliente = ref(false);
const nombreNuevoCliente = ref('');
const telefonoNuevoCliente = ref('');
const modalOpcionesCliente = ref(false);
const modalAsignarMesa = ref(false);
const clienteSeleccionado = ref(null);
const mesaSeleccionada = ref(null);
const mesasDisponibles = ref([]);

onMounted(async () => {
  clientesEnEspera.value = (await GetWaitlist()) || [];
});

async function GetWaitlist() {
  try {
    return await apiService.getWaitlist();
  } catch (err) {
    console.error(err);
    return [];
  }
}

function mostrarModalAgregarCliente() {
  cerrarModales();
  modalAgregarCliente.value = true;
}

function cerrarModalAgregarCliente() {
  modalAgregarCliente.value = false;
  nombreNuevoCliente.value = '';
  telefonoNuevoCliente.value = '';
}

async function agregarCliente() {
  try {
    const nuevoCliente = {
      nombre: nombreNuevoCliente.value,
      telefono: telefonoNuevoCliente.value.toString(),
    };
    await apiService.addWaitlist(nuevoCliente);
    clientesEnEspera.value.push(nuevoCliente);
    cerrarModalAgregarCliente();
  } catch (err) {
    console.error(err);
  }
}

function mostrarModalOpciones(cliente) {
  cerrarModales();
  clienteSeleccionado.value = cliente;
  modalOpcionesCliente.value = true;
}

function cerrarModalOpcionesCliente() {
  modalOpcionesCliente.value = false;
  clienteSeleccionado.value = null;
}

async function mostrarModalAsignarMesa() {
  try {
    mesasDisponibles.value = (await apiService.getTables()).filter((m) => m.disponible);
    modalAsignarMesa.value = true;
  } catch (err) {
    console.error(err);
  }
}

function cerrarModalAsignarMesa() {
  modalAsignarMesa.value = false;
  mesaSeleccionada.value = null;
}

async function asignarMesaACliente() {
  try {
    if (clienteSeleccionado.value && mesaSeleccionada.value) {
      await apiService.editTable(mesaSeleccionada.value, {
        disponible: false,
        personaTitular: clienteSeleccionado.value.nombre,
      });
      await apiService.deleteWaitlist(clienteSeleccionado.value.telefono);
      clientesEnEspera.value = clientesEnEspera.value.filter(
        (c) => c.telefono !== clienteSeleccionado.value.telefono
      );
      cerrarModalAsignarMesa();
      cerrarModalOpcionesCliente();
    }
  } catch (err) {
    console.error(err);
  }
}

async function eliminarClienteEnEspera(cliente) {
  try {
    await apiService.deleteWaitlist(cliente.telefono);
    clientesEnEspera.value = clientesEnEspera.value.filter((c) => c.telefono !== cliente.telefono);
    cerrarModalOpcionesCliente();
  } catch (err) {
    console.error(err);
  }
}

function cerrarModales() {
  modalAgregarCliente.value = false;
  modalOpcionesCliente.value = false;
  modalAsignarMesa.value = false;
  clienteSeleccionado.value = null;
  mesaSeleccionada.value = null;
}
</script>

<style scoped>
.waitlist-page { animation: t-fade-up .45s ease both; }
.toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.2rem; gap:1rem; flex-wrap:wrap; }
.toolbar p { margin:0; color:var(--timber-muted); }
.btn-primary { background:var(--timber-primary); color:var(--timber-on-primary); border:none; border-radius:.7rem; padding:.65rem 1.05rem; font-weight:600; cursor:pointer; box-shadow:var(--timber-shadow); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(14.5rem,1fr)); gap:1rem; }
.card { background:var(--timber-panel); border:1px solid var(--timber-line); border-radius:1.1rem; padding:1.15rem; cursor:pointer; box-shadow:var(--timber-shadow); transition:transform .18s ease; color:var(--timber-ink); }
.card:hover { transform:translateY(-2px); }
.card h3 { margin:0; font-family:var(--font-display); font-size:1.2rem; font-weight:700; letter-spacing:-0.01em; color:var(--timber-primary); }
.card p { margin:.45rem 0 0; color:var(--timber-muted); }
.empty { color:var(--timber-muted); }
.modal-bg { position:fixed; inset:0; background:rgba(10,16,14,.48); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:50; }
.modal { background:var(--timber-panel); color:var(--timber-ink); border-radius:1.15rem; padding:1.25rem; width:min(22rem,92vw); display:grid; gap:.7rem; border:1px solid var(--timber-line); }
.modal input, .modal select { border:1px solid var(--timber-line); border-radius:.65rem; padding:.6rem; background:var(--timber-panel-elevated); color:var(--timber-ink); }
.modal-actions { display:flex; flex-wrap:wrap; gap:.45rem; }
.modal-actions button { border:1px solid var(--timber-line); background:var(--timber-panel-elevated); color:var(--timber-ink); border-radius:.6rem; padding:.55rem .75rem; cursor:pointer; font-weight:600; }
.danger { color:var(--timber-danger); }
</style>
