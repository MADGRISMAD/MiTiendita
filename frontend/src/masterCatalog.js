// Catálogo maestro de abarrotes: qué giros pueden usarlo.
// Sin imports: la prueba del backend lo carga como módulo (backend/test/master-catalog.test.js)
// y comprueba que coincida con backend/services/master-catalog.service.js.
// Las carnicerías no tienen giro propio: se registran como «abarrotes» o «other» (Comercio).
export const MASTER_CATALOG_GIROS = ["abarrotes", "convenience", "other"];

/** Una tienda sin giro guardado cuenta como abarrotes (es el valor por defecto de la app). */
export function masterCatalogAvailable(businessType) {
  return MASTER_CATALOG_GIROS.includes(businessType || "abarrotes");
}
