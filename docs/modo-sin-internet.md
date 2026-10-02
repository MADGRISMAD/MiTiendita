# Cobrar sin internet: cómo funciona y cómo probarlo

Mi Tiendita sigue cobrando aunque se caiga el internet. Las ventas se guardan en el
dispositivo y se suben solas cuando vuelve la conexión, sin duplicarse.

## Qué pasa por dentro

| Pieza | Dónde | Qué hace |
|---|---|---|
| App instalable y sin red | `frontend/vite.config.js` (vite-plugin-pwa) | El service worker guarda la app; después de la primera carga, `/pos` abre sin red. |
| Catálogo y caja guardados | `frontend/src/offlineDb.js` (IndexedDB `mitiendita-offline`) | Productos, categorías y la caja abierta se guardan en cada carga con red y se usan cuando no hay. La configuración de la tienda se guarda en `localStorage`. |
| Cola de ventas | `offlineDb.js` (almacén `sales`) | Sin red, la venta se guarda con un `clientSaleId` creado en el dispositivo y el ticket sale con el sello «Sin sincronizar». |
| Subida | `frontend/src/offlineSync.js` | Sube la cola en orden al volver la red, al regresar a la pestaña y cada 30 s mientras haya pendientes. Una sola pestaña sube a la vez. |
| Sin duplicados | `POST /orders/sale` | El servidor reconoce el `clientSaleId`: si la venta ya existe, la devuelve en vez de crear otra. |
| Fallas pasajeras | `offlineSync.js` | Si el servidor responde 5xx, 408 o 429, la venta sigue pendiente y se reintenta con espera creciente (15 s, 30 s… hasta 5 min). |
| Ventas rechazadas | Caja → «Ventas de este dispositivo sin subir» | Si el servidor rechaza la venta (4xx), queda con su motivo para revisarla y reintentarla. Nunca se borra del dispositivo. |
| Aviso | Barra superior en todas las pantallas | «Sin internet», cuántas ventas faltan por subir, cuántas tienen error, «Subir ahora» y la hora de la última subida. |

## Prueba en PC (Chrome)

La prueba usa la versión compilada, porque el service worker no funciona con `npm run dev`.

1. Compila y sirve la app: `cd frontend && npm run build && npx vite preview`.
2. Abre `http://localhost:4173`, inicia sesión y abre la caja con su fondo.
3. Entra a **Vender** con internet y espera a que cargue el catálogo. En DevTools →
   Application → Service Workers debe verse uno activo.
4. DevTools → Network → **Offline**.
5. Recarga la página (abrir en frío). Debe abrir Vender con los productos y la barra
   «Sin internet · puedes cobrar con el catálogo guardado».
6. Cobra **3 ventas** (efectivo, tarjeta y una con cambio).
   - Cada ticket sale con el sello **«Sin sincronizar»** y el aviso de que el QR para
     facturar llega en la reimpresión.
   - La barra dice «Sin internet · la caja sigue. 3 ventas por subir».
   - Las existencias en pantalla bajan con cada venta.
7. Ve a **Caja**: aparece «Ventas de este dispositivo sin subir» con las 3 y el aviso de que
   el turno y el corte necesitan conexión. (Con internet, «Hacer corte» no deja cerrar
   mientras haya ventas por subir en ese dispositivo.)
8. Network → **No throttling** (vuelve la red). En pocos segundos la barra desaparece y
   las 3 ventas aparecen en la lista de Caja como cobradas, en su orden.
9. Haz el **corte**: las 3 ventas entran en el turno y en el ticket del corte.
10. Revisa en Resumen que se cuenten una sola vez.

### Probar una falla del servidor

- **Servidor caído un momento:** apaga el backend antes del paso 8. La barra dice
  «3 ventas de este dispositivo por subir» con el botón **Subir ahora**; las ventas siguen
  pendientes. Prende el backend y pulsa «Subir ahora» (o espera a que se reintente sola).
- **Venta rechazada:** si el servidor responde con error (por ejemplo, un producto que ya
  no es válido), la barra muestra «1 venta de este dispositivo no se pudo subir · Revisar».
  En Caja aparece con el motivo; corrige el problema y pulsa **Reintentar**.

## Prueba en celular (Android o iPhone)

1. Abre la tienda en el navegador con internet e inicia sesión.
2. Instálala: Android → menú → «Instalar app»; iPhone (Safari) → Compartir →
   «Agregar a inicio».
3. Abre la app instalada, entra a Vender y espera el catálogo.
4. Activa el **modo avión**, cierra la app por completo y vuelve a abrirla.
5. Cobra una venta e imprime o comparte el ticket.
6. Quita el modo avión y confirma en Caja que la venta subió.

## Qué revisar si algo no cuadra

- **El corte no deja cerrar:** hay ventas por subir en ese dispositivo. Conéctalo a internet
  o usa «Subir ahora».
- **Una venta tiene error:** se queda en Caja hasta que se reintente con éxito. Si el motivo
  no se entiende, escribe a soporte desde Configuración → Soporte con el folio del ticket.
- **Se cerró la sesión:** las ventas siguen guardadas en el dispositivo y se suben al volver
  a iniciar sesión con la misma tienda.
- **La venta sin red entra al turno abierto cuando se sube**, no al del momento de la venta.
  Por eso hay que subirlas antes del corte.
- **Inventario:** en el dispositivo las existencias bajan al vender sin red; en el servidor
  se descuentan cuando la venta se sube (si «Llevar inventario» está activo).
