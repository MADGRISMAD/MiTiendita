// Sugiere la categoría (menú) de un producto nuevo según su nombre y el proveedor de la nota.
// Las categorías son las del catálogo de cada tienda; aquí solo se busca la que mejor suene.
const norm = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// [lo que dice el producto o el proveedor, lo que debe decir el nombre de la categoría]
const RULES = [
  [/pepsi|gatorade|electrolit|7 ?up|mirinda|manzanita sol|sidral mundet|squirt|lipton|epura/, /pepsi.*bebidas|bebidas.*pepsi/],
  [/coca|sprite|fanta|fresca|ciel|powerade|del valle|topo chico|dasani|vitaminwater|jarritos?/, /coca/],
  [/sabritas|doritos|cheetos|ruffles|fritos|tostitos|churrumais|rancheritos|crujitos/, /sabritas/],
  [/barcel|takis|runners|chip'?s|hot nuts|bolsa de papas/, /barcel/],
  [/marinela|tia rosa|gansito|pinguinos|submarinos|barritas|mantecadas|roles?\b/, /marinela|tia rosa|pastelillos/],
  [/gamesa|emperador|arcoiris|mamut|saladitas|marias|chokis|florentinas/, /gamesa|galletas/],
  [/bimbo|oroweat|thomas|tuny|rolly|pan blanco|pan integral|bollos?/, /bimbo|pan blanco/],
  [/nestle|nescafe|maggi|carnation|nido|abuelita|mondelez|oreo|trident|chiclets|ritz|philadelphia|kinder/, /nestl|mondel/],
  [/la costena|herdez|del fuerte|clemente jacques|chiles?|frijol|atun|mayonesa|mccormick/, /coste|herdez/],
  [/\blala\b|sigma|\bfud\b|nochebuena|yoplait|leche|queso|yogur|crema|salchicha|jamon|huevo/, /sigma|lala|dairy/],
  [/corona|modelo|victoria|pacifico|heineken|tecate|indio|cerveza|chela|dos equis|\bxx\b|michelob|negra modelo/, /cervecer|modelo|heineken/],
  [/colgate|palmolive|\bp ?& ?g\b|kimberly|kleenex|panal|jabon|detergente|ariel|suavitel|downy|pinol|fabuloso|papel higienico|regio|zote|axe\b|pantene|head ?& ?shoulders|cloralex|vel rosita/, /colgate|palmolive|kimberly|corona|limpieza|higiene/],
  [/fruta|verdura|jitomate|tomate|cebolla|carne|pollo|res\b|cerdo|aguacate|limon|papa\b|platano|manzana/, /fresc|fruter|verdur|carnicer/],
  [/croquetas|dog chow|whiskas|purina|alimento para (perro|gato)|carbon|parrilla|mascota/, /conveniencia|parrilla|mascota/],
  [/dulce|paleta|chocolate|gomita|chicle|caramelo|mazapan|vero|ricolino|duvalin|pulparindo|de la rosa|bubulubu|panditas/, /dulce/],
];

/** Devuelve el id del menú que mejor le queda, o "" si no encuentra ninguno. */
export function suggestMenuId(productName, supplierName, menus) {
  const list = Array.isArray(menus) ? menus : [];
  if (!list.length) return "";
  const named = list.map((m) => ({ id: m.id, name: norm(m.name) }));
  for (const text of [norm(productName), norm(supplierName)]) {
    if (!text.trim()) continue;
    for (const [word, menu] of RULES) {
      if (!word.test(text)) continue;
      const hit = named.find((m) => menu.test(m.name));
      if (hit) return hit.id;
    }
  }
  return "";
}
