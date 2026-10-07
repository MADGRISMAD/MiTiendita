<template>
  <PublicPage>
    <template #hero>
      <p class="kicker">{{ page === "privacy" ? "Aviso" : "Contrato" }}</p>
      <h1>{{ page === "privacy" ? "Aviso de privacidad" : "Términos del servicio" }}</h1>
      <p class="lede">Última actualización: 25 de septiembre de 2026</p>
    </template>

    <div class="legal">
      <nav v-if="toc.length" class="card toc" aria-label="En esta página">
        <p class="toc-title">En esta página</p>
        <a v-for="t in toc" :key="t.id" :href="'#' + t.id" @click.prevent="go(t.id)">{{ t.text }}</a>
      </nav>

      <article ref="doc" class="card doc">
        <template v-if="page === 'terms'">
          <p>
            Mi Tiendita es un POS en la nube para tiendas de abarrotes y comercios de barrio.
            Al crear una cuenta aceptas estos términos.
          </p>
          <h2>1. La cuenta</h2>
          <p>
            El registro crea un negocio (tenant) y un usuario administrador.
            Eres responsable de las ventas, el catálogo y las personas que invites.
            La prueba dura 3 días; después necesitas un plan activo para seguir cobrando.
          </p>
          <h2>2. Planes y pagos</h2>
          <p>
            Los cobros se hacen con Mercado Pago. Puedes cambiar de plan o cancelar
            el cargo recurrente desde Facturación. Si cancelas, sigues usando el sistema
            hasta el fin del periodo ya pagado. Los límites de usuarios, productos e
            Inventario Mágico / Precio Mágico dependen del plan contratado.
          </p>
          <h2>3. Tus datos</h2>
          <p>
            El catálogo, las ventas y la configuración pertenecen a tu negocio.
            Los usamos solo para operar el servicio (caja, tickets, facturación,
            soporte, Inventario Mágico y Precio Mágico). No vendemos tu lista de clientes.
          </p>
          <h2>4. Uso aceptable</h2>
          <p>
            No uses el sistema para fraude, spam o para evadir impuestos.
            Podemos suspender una cuenta si el pago falla o si hay abuso.
          </p>
          <h2>5. Disponibilidad</h2>
          <p>
            El servicio es por internet. Habrá cortes por mantenimiento o fallas
            de terceros (hosting, Mercado Pago, correo). No sustituye tu obligación
            de llevar libros contables.
          </p>
          <h2>6. Contacto</h2>
          <p>
            Dudas de producto o de estos términos: escribe desde
            <router-link to="/settings">Configuración → Soporte</router-link>
            (si ya tienes cuenta) o crea una cuenta y ábrelo ahí.
          </p>
        </template>

        <template v-else>
          <p>
            Este aviso describe qué datos recaba Mi Tiendita y para qué.
            Al usar el servicio consientes este tratamiento.
          </p>
          <h2>Datos que recabamos</h2>
          <ul>
            <li>Cuenta: nombre, correo, teléfono, usuario y contraseña cifrada.</li>
            <li>Negocio: nombre de la tienda, dirección, logo y preferencias.</li>
            <li>Operación: productos, ventas, turnos de caja y solicitudes de factura.</li>
            <li>Pagos SaaS: plan, estado y referencias de Mercado Pago (no guardamos tu tarjeta).</li>
            <li>Soporte: los mensajes que nos envías.</li>
          </ul>
          <h2>Para qué los usamos</h2>
          <p>
            Operar la caja, enviar correos (alta, invitaciones, recuperación de
            contraseña, tickets de factura y avisos de pago), cobrar la suscripción
            y responder soporte. Inventario Mágico y Precio Mágico envían el texto o la foto que
            tú pegas a un proveedor de IA solo para actualizar tu catálogo y tus precios.
          </p>
          <h2>Con quién se comparten</h2>
          <p>
            Mercado Pago (cobros), el proveedor de correo (Resend o SMTP) y,
            si usas Inventario Mágico o Precio Mágico, el proveedor de IA. No vendemos bases de datos.
          </p>
          <h2>Tus derechos</h2>
          <p>
            Puedes pedir acceso, corrección o baja de tu cuenta escribiendo a
            soporte. Conservamos los datos mientras la tienda esté activa y el
            tiempo mínimo para facturación y obligaciones legales.
          </p>
        </template>
      </article>
    </div>
  </PublicPage>
</template>

<script setup>
import { onMounted, ref } from "vue";
import PublicPage from "../components/PublicPage.vue";

defineProps({
  page: { type: String, default: "terms" },
});

const doc = ref(null);
const toc = ref([]);

// El índice se arma con los títulos del texto, así el contenido legal vive en un solo lugar.
onMounted(() => {
  toc.value = [...doc.value.querySelectorAll("h2")].map((h, i) => {
    h.id = `sec-${i + 1}`;
    return { id: h.id, text: h.textContent.trim() };
  });
});

function go(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<style scoped>
.card {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  box-shadow: var(--timber-shadow);
}
.legal {
  display: grid;
  gap: 1rem;
  align-items: start;
}
.toc { display: none; }
@media (min-width: 52rem) {
  .legal { grid-template-columns: 14rem minmax(0, 1fr); }
  .toc { display: grid; position: sticky; top: 4.75rem; }
}

.toc { padding: 0.9rem 0.8rem; gap: 0.1rem; }
.toc-title {
  margin: 0 0.5rem 0.4rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.toc a {
  color: var(--timber-ink);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0.4rem 0.5rem;
  border-radius: 0.5rem;
}
.toc a:hover { background: var(--timber-primary-soft); color: var(--timber-primary); }

.doc { padding: 1.5rem 1.4rem 1.8rem; }
.doc h2 {
  margin: 1.8rem 0 0.4rem;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  scroll-margin-top: 4.75rem;
}
.doc h2:first-of-type { margin-top: 1.4rem; }
.doc p, .doc li { line-height: 1.65; color: var(--timber-muted); }
.doc p { margin: 0 0 0.7rem; max-width: 44rem; }
.doc ul { padding-left: 1.15rem; margin: 0 0 0.7rem; }
.doc li { margin-bottom: 0.25rem; }
.doc a { color: var(--timber-primary); font-weight: 700; }
</style>
