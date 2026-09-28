<template>
  <div class="legal">
    <header class="nav">
      <router-link to="/" class="brand">
        <img src="/logo.svg" alt="" width="32" height="32" />
        <BrandName tone="dark" />
      </router-link>
      <router-link to="/register" class="cta">Probar gratis</router-link>
    </header>

    <article class="doc">
      <p class="kicker">{{ page === "privacy" ? "Aviso" : "Contrato" }}</p>
      <h1>{{ page === "privacy" ? "Aviso de privacidad" : "Términos del servicio" }}</h1>
      <p class="updated">Última actualización: 25 de septiembre de 2026</p>

      <template v-if="page === 'terms'">
        <p>
          Mi Tiendita es un POS en la nube para tiendas de abarrotes y comercios de barrio.
          Al crear una cuenta aceptas estos términos.
        </p>
        <h2>1. La cuenta</h2>
        <p>
          El registro crea un negocio (tenant) y un usuario administrador.
          Eres responsable de las ventas, el catálogo y las personas que invites.
          La prueba dura 14 días; después necesitas un plan activo para seguir cobrando.
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

      <p class="back">
        <router-link to="/">← Volver al inicio</router-link>
        <span aria-hidden="true"> · </span>
        <router-link :to="page === 'privacy' ? '/terminos' : '/privacidad'">
          {{ page === "privacy" ? "Términos" : "Privacidad" }}
        </router-link>
      </p>
    </article>
  </div>
</template>

<script setup>
import BrandName from "../components/BrandName.vue";

defineProps({
  page: { type: String, default: "terms" },
});
</script>

<style scoped>
.legal {
  min-height: 100%;
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
  font-family: var(--font-display);
  font-size: 1.8rem;
  letter-spacing: -0.03em;
}
.updated { color: #64748b; font-size: 0.85rem; }
h2 { margin: 1.4rem 0 0.4rem; font-size: 1.1rem; }
p, li { line-height: 1.55; color: #334155; }
ul { padding-left: 1.15rem; }
a { color: #1e5aa8; font-weight: 700; }
.back { margin-top: 2rem; }
</style>
