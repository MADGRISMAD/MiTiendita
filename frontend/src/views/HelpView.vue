<template>
  <div class="help">
    <header class="nav">
      <router-link :to="loggedIn ? '/pos' : '/'" class="brand">
        <img src="/logo.svg" alt="" width="32" height="32" />
        <BrandName tone="dark" />
      </router-link>
      <router-link :to="loggedIn ? '/pos' : '/register'" class="cta">
        {{ loggedIn ? "Volver a vender" : "Probar gratis" }}
      </router-link>
    </header>

    <article class="doc">
      <p class="kicker">Ayuda</p>
      <h1>Preguntas frecuentes</h1>
      <p class="lede">
        Lo básico para cobrar sin broncas. ¿Tu cajero es nuevo? Imprímele la guía de una página.
      </p>
      <a class="guide" href="/guia-cajero.pdf" download>Descargar guía de cajero (PDF)</a>

      <WhatsAppHelp class="wa" />

      <details v-for="f in faqs" :key="f.q" class="faq">
        <summary>{{ f.q }}</summary>
        <p v-for="(p, i) in f.a" :key="i">{{ p }}</p>
      </details>
    </article>
  </div>
</template>

<script setup>
import { computed } from "vue";
import BrandName from "../components/BrandName.vue";
import WhatsAppHelp from "../components/WhatsAppHelp.vue";
import { authStore } from "../authStore";

const loggedIn = computed(() => Boolean(authStore.token));

const faqs = [
  {
    q: "¿Cómo imprimo el ticket en mi impresora térmica?",
    a: [
      "Entra a Más → Configuración → Impresora y elige cómo sale el ticket: «Navegador» (abre el diálogo de imprimir, sirve con cualquier impresora), «Térmica USB» o «Térmica Bluetooth» (sale directo, sin diálogo; en Chrome o Edge).",
      "Usa «Imprimir prueba» para comprobarlo. Se guarda en cada dispositivo, así que cada caja elige su impresora. Hay papel de 80 y de 58 mm.",
    ],
  },
  {
    q: "¿Cómo conecto el lector de códigos de barras?",
    a: [
      "Conéctalo por USB o Bluetooth como si fuera un teclado. No necesita instalar nada.",
      "En Vender, escanea el producto y se agrega solo al ticket. Si no tiene código, búscalo por nombre o tócalo en la lista.",
    ],
  },
  {
    q: "¿Cómo cobro con tarjeta, transferencia o a granel?",
    a: [
      "Al tocar «Cobrar» elige Efectivo, Tarjeta, Transferencia, Mixto u Otro. En transferencia puedes anotar el folio.",
      "Los productos por kilo, gramo o litro abren un teclado para escribir el peso o el importe. Con una báscula conectada, el peso se agrega solo.",
    ],
  },
  {
    q: "¿Cómo hago el corte de caja?",
    a: [
      "Entra a Caja y toca «Hacer corte». Cuenta los billetes y monedas (o escribe el total) y el sistema te dice si cuadra.",
      "Al confirmar con «Cerrar turno e imprimir» sale el corte.",
    ],
  },
  {
    q: "¿Cómo cancelo una venta?",
    a: [
      "Antes de cobrar: quita el producto del ticket con «Quitar» (F2) o vacía el ticket con el icono de bote.",
      "Ya cobrada: en Caja abre la venta y toca «Devolver». Se registra la devolución.",
    ],
  },
  {
    q: "Un cliente me pide factura, ¿qué hago?",
    a: [
      "Cada ticket trae un código QR de «Factura tú mismo». Tu cliente lo escanea y captura sus datos fiscales; solo es válido durante el mes de la compra.",
      "Tú ves la solicitud en Caja, pestaña «Facturas». Cuando la emitas, toca «Ya la facturé».",
    ],
  },
  {
    q: "¿Qué pasa si se va el internet?",
    a: [
      "Puedes seguir cobrando. Las ventas se guardan en el equipo y se sincronizan solas cuando regresa la conexión.",
      "No cierres la caja si hay ventas pendientes de sincronizar; el sistema te avisa.",
    ],
  },
  {
    q: "¿Cómo agrego un cajero?",
    a: [
      "Desde «Más» entra a Empleados y toca «Agregar persona» o «Invitar». Tus cajeros solo ven lo necesario para vender y hacer el corte.",
    ],
  },
  {
    q: "Olvidé mi contraseña",
    a: ["En la pantalla de ingreso toca «¿La olvidaste?» y sigue el correo que te llega."],
  },
];
</script>

<style scoped>
.help {
  height: 100%;
  overflow-y: auto;
  background: var(--timber-surface, #eef1f6);
  color: var(--timber-ink, #1a2332);
  font-family: var(--font-sans);
}
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1.1rem;
  background: var(--timber-topbar, #123056);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  text-decoration: none;
  font-weight: 800;
}
.cta {
  color: #1a1208;
  background: #e08a1e;
  text-decoration: none;
  font-weight: 800;
  border-radius: 999px;
  padding: 0.45rem 0.9rem;
  font-size: 0.88rem;
}
.doc {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2rem 1.15rem 3rem;
}
.kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1e5aa8;
}
h1 {
  margin: 0.25rem 0 0;
  font-size: 1.8rem;
}
.lede {
  color: var(--timber-muted, #64748b);
  line-height: 1.5;
}
.guide {
  display: inline-block;
  margin: 0.25rem 0 1.25rem;
  color: #fff;
  background: #1e5aa8;
  text-decoration: none;
  font-weight: 800;
  border-radius: 0.6rem;
  padding: 0.6rem 1rem;
}
.wa {
  margin: 0 0 1.25rem;
}
.faq {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 0.75rem;
  padding: 0 1rem;
  margin-bottom: 0.6rem;
}
.faq summary {
  cursor: pointer;
  font-weight: 700;
  padding: 0.85rem 0;
}
.faq p {
  margin: 0 0 0.75rem;
  line-height: 1.55;
}
</style>
