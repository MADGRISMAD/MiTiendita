// Categoría de insumos: la busca (o la crea) para dar de alta materia prima.
import { apiService } from "./apiService";

export const SUPPLY_MENU_NAME = "Insumos";

export function isSupplyMenu(menu) {
  return menu?.kind === "supplies";
}

/**
 * Id de la categoría de insumos de la tienda. Si no hay, crea «Insumos».
 * @param {Array} menus categorías ya cargadas (se le agrega la nueva)
 */
export async function supplyMenuId(menus) {
  const found = menus.find(isSupplyMenu);
  if (found) return String(found.id);
  const created = await apiService.createMenu({ name: SUPPLY_MENU_NAME, description: "", kind: "supplies" });
  menus.push({ ...created, kind: "supplies" });
  return String(created.id);
}
