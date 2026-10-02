<template>
  <div class="ticket">
    <header class="ticket-head">
      <div>
        <p class="eyebrow">Venta actual</p>
        <h2>{{ itemCount }} art.</h2>
      </div>
      <button type="button" class="clear" :disabled="!store.platillosSeleccionados.length" @click="clearCart">
        Vaciar
      </button>
    </header>

    <ul class="lines">
      <li v-for="(producto, index) in store.platillosSeleccionados" :key="index">
        <div class="line-top">
          <p class="name">{{ producto.name }}</p>
          <button type="button" class="x" @click="eliminarProducto(index)" aria-label="Quitar">×</button>
        </div>
        <div class="line-bot">
          <div class="qty">
            <button type="button" @click="disminuirCantidad(index)">−</button>
            <span>{{ producto.quantity }}</span>
            <button type="button" @click="incrementarCantidad(index)">+</button>
          </div>
          <p class="unit">{{ formatearMoneda(producto.price) }}</p>
          <p class="line-total">{{ formatearMoneda(producto.price * producto.quantity) }}</p>
        </div>
      </li>
    </ul>

    <p v-if="!store.platillosSeleccionados.length" class="empty">
      Escanea un código de barras
    </p>

    <footer class="ticket-foot">
      <div class="totals">
        <div><span>Subtotal</span><span>{{ formatearMoneda(subtotal) }}</span></div>
        <div><span>IVA 8%</span><span>{{ formatearMoneda(tax) }}</span></div>
      </div>
      <div class="grand">
        <span>Total</span>
        <strong>{{ formatearMoneda(total) }}</strong>
      </div>
      <button
        type="button"
        class="cobrar"
        :disabled="!store.platillosSeleccionados.length || sending"
        @click="finalizeOrder"
      >
        {{ sending ? 'Procesando…' : 'COBRAR' }}
      </button>
      <p v-if="msg" class="msg">{{ msg }}</p>
    </footer>
  </div>
</template>

<script>
import { store } from "../store";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { apiService } from "../apiService";

export default {
  setup() {
    const router = useRouter();
    const taxRate = 0.08;
    const sending = ref(false);
    const msg = ref("");

    const itemCount = computed(() =>
      store.platillosSeleccionados.reduce((s, p) => s + Number(p.quantity || 0), 0)
    );
    const subtotal = computed(() =>
      store.platillosSeleccionados.reduce((sum, p) => sum + p.price * p.quantity, 0)
    );
    const tax = computed(() => subtotal.value * taxRate);
    const total = computed(() => subtotal.value + tax.value);

    const incrementarCantidad = (index) => {
      store.platillosSeleccionados[index].quantity += 1;
    };
    const disminuirCantidad = (index) => {
      if (store.platillosSeleccionados[index].quantity > 1) {
        store.platillosSeleccionados[index].quantity -= 1;
      } else {
        store.platillosSeleccionados.splice(index, 1);
      }
    };
    const eliminarProducto = (index) => {
      store.platillosSeleccionados.splice(index, 1);
    };
    const clearCart = () => {
      store.platillosSeleccionados.splice(0, store.platillosSeleccionados.length);
    };

    const finalizeOrder = async () => {
      sending.value = true;
      msg.value = "";
      try {
        const response = await apiService.createOrder({
          tableId: null,
          tableName: "Mostrador",
          modality: "retail",
          status: "pending",
          items: store.platillosSeleccionados.map((p) => ({
            foodId: p.id,
            name: p.name,
            price: p.price,
            quantity: p.quantity,
          })),
        });
        store.platillosSeleccionados.splice(0, store.platillosSeleccionados.length);
        msg.value = `Ticket ${response.id?.slice(-6) || ""} listo`;
        setTimeout(() => router.push("/orders"), 400);
      } catch (error) {
        msg.value = error.response?.data || "Error al registrar la venta.";
      } finally {
        sending.value = false;
      }
    };

    const formatearMoneda = (cantidad) =>
      Number(cantidad || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

    return {
      store,
      itemCount,
      subtotal,
      tax,
      total,
      sending,
      msg,
      incrementarCantidad,
      disminuirCantidad,
      eliminarProducto,
      clearCart,
      finalizeOrder,
      formatearMoneda,
    };
  },
};
</script>

<style scoped>
.ticket {
  background: var(--timber-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.ticket-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0.85rem;
  border-bottom: 1px solid var(--timber-line);
  flex-shrink: 0;
}
.eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.ticket-head h2 {
  margin: 0.1rem 0 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}
.clear {
  border: 1px solid var(--timber-line);
  background: transparent;
  color: var(--timber-muted);
  border-radius: 0.55rem;
  padding: 0.4rem 0.7rem;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}
.clear:disabled { opacity: 0.4; }

.lines {
  list-style: none;
  margin: 0;
  padding: 0.35rem 0;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.lines li {
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid var(--timber-line);
}
.line-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: flex-start;
}
.name {
  margin: 0;
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.25;
}
.x {
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 0.4rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
  font-size: 1.1rem;
  cursor: pointer;
  flex-shrink: 0;
}
.line-bot {
  margin-top: 0.4rem;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem;
  align-items: center;
}
.qty {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  background: var(--timber-surface);
  border-radius: 0.55rem;
  padding: 0.15rem;
}
.qty button {
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 0.4rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 800;
  cursor: pointer;
}
.qty span {
  min-width: 1.5rem;
  text-align: center;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.unit {
  margin: 0;
  font-size: 0.8rem;
  color: var(--timber-muted);
  text-align: right;
}
.line-total {
  margin: 0;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.empty {
  margin: auto;
  padding: 1.5rem 1rem;
  color: var(--timber-muted);
  text-align: center;
  font-size: 0.95rem;
}

.ticket-foot {
  flex-shrink: 0;
  padding: 0.75rem 0.85rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel);
  display: grid;
  gap: 0.55rem;
}
.totals { display: grid; gap: 0.25rem; }
.totals > div {
  display: flex;
  justify-content: space-between;
  font-size: 0.88rem;
  color: var(--timber-muted);
}
.grand {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.35rem 0 0.15rem;
}
.grand span {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--timber-muted);
}
.grand strong {
  font-family: var(--font-display);
  font-size: 1.85rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--timber-ink);
}
.cobrar {
  min-height: 3.6rem;
  border: none;
  border-radius: 0.9rem;
  background: var(--timber-accent);
  color: #1a1208;
  font-weight: 800;
  font-size: 1.2rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(224, 138, 30, 0.28);
}
.cobrar:disabled { opacity: 0.5; cursor: wait; }
.msg {
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--timber-success);
  font-weight: 600;
}
</style>
