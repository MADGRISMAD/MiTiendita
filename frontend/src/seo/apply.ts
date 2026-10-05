// Etiquetas de la página al navegar dentro de la app (título, descripción, canónica, Open Graph, robots).
// El HTML pre-generado ya trae lo mismo para buscadores; esto lo mantiene al día al cambiar de ruta.
import { SITE, seoFor, jsonLdFor } from "./site.mjs";

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function applySeo(path: string) {
  const page = seoFor(path) as { path: string; title: string; description: string; noindex?: boolean };
  const url = `${SITE.url}${page.path === "/" ? "/" : page.path}`;
  document.title = page.title;
  setMeta("name", "description", page.description);
  setMeta("name", "robots", page.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
  setLink("canonical", url);
  setMeta("property", "og:title", page.title);
  setMeta("property", "og:description", page.description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", page.title);
  setMeta("name", "twitter:description", page.description);

  let ld = document.getElementById("ld-json");
  if (page.noindex) {
    ld?.remove();
    return;
  }
  if (!ld) {
    ld = document.createElement("script");
    ld.id = "ld-json";
    ld.setAttribute("type", "application/ld+json");
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(jsonLdFor(page.path));
}
