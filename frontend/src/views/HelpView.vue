<template>
  <PublicPage>
    <template #hero>
      <p class="kicker">Ayuda</p>
      <h1>¿En qué te ayudamos?</h1>
      <p class="lede">
        Respuestas rápidas para cobrar sin broncas. ¿Tu cajero es nuevo? Imprímele la guía de una página.
      </p>
    </template>

    <div class="actions">
      <a class="card act" href="/guia-cajero.pdf" download>
        <span class="act-ico"><PosIcon name="receipt" :size="22" /></span>
        <span class="act-copy">
          <strong>Guía de cajero</strong>
          <small>Una página en PDF para pegar junto a la caja</small>
        </span>
        <PosIcon name="chevron" :size="18" />
      </a>
      <div class="card wa-card"><WhatsAppHelp /></div>
    </div>

    <section class="card faqs" aria-labelledby="faq-title">
      <h2 id="faq-title">Preguntas frecuentes</h2>
      <details v-for="f in faqs" :key="f.q" class="faq">
        <summary>
          <span>{{ f.q }}</span>
          <PosIcon name="chevron" :size="18" class="chev" />
        </summary>
        <div class="faq-body">
          <p v-for="(p, i) in f.a" :key="i">{{ p }}</p>
        </div>
      </details>
    </section>
  </PublicPage>
</template>

<script setup>
import PublicPage from "../components/PublicPage.vue";
import PosIcon from "../components/PosIcon.js";
import WhatsAppHelp from "../components/WhatsAppHelp.vue";

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
.card {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  box-shadow: var(--timber-shadow);
}
.actions {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  margin-bottom: 1rem;
}
.act {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  color: inherit;
  text-decoration: none;
  transition: transform 0.15s, border-color 0.15s;
}
.act:hover { transform: translateY(-2px); border-color: var(--timber-primary); }
.act-ico {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.75rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.act-copy { flex: 1; display: grid; gap: 0.1rem; }
.act-copy small { color: var(--timber-muted); }
.wa-card { display: grid; align-items: center; padding: 1rem 1.1rem; }

.faqs { padding: 0.6rem 1.1rem 0.9rem; }
.faqs h2 { margin: 0.8rem 0 0.4rem; font-size: 1.15rem; font-weight: 800; }
.faq { border-bottom: 1px solid var(--timber-line); }
.faq:last-child { border-bottom: 0; }
.faq summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 0;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.faq summary::-webkit-details-marker { display: none; }
.faq summary:hover { color: var(--timber-primary); }
.chev { flex: none; color: var(--timber-muted); transition: transform 0.2s; }
.faq[open] .chev { transform: rotate(90deg); color: var(--timber-primary); }
.faq-body { padding: 0 0 0.9rem; }
.faq-body p { margin: 0 0 0.6rem; line-height: 1.6; color: var(--timber-muted); max-width: 44rem; }
</style>
