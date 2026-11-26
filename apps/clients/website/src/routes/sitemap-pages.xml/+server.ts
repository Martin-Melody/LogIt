// The site's own pages (home, pricing, docs…) for search engines. Built from the route files,
// so a new page is listed without touching this.
import { SITE_URL } from "$lib/site";

export const prerender = true;

// Invite and share links, and search, are noindex: they only mean something to whoever was sent them.
const NOT_LISTED = new Set(["/a", "/f", "/g", "/search"]);

const paths = Object.keys(import.meta.glob("/src/routes/**/+page.{svelte,svx}"))
  .map((f) => f.replace("/src/routes", "").replace(/\/\([^)]+\)/g, "").replace(/\/\+page\.\w+$/, "") || "/")
  .filter((p) => !p.includes("[") && !NOT_LISTED.has(p))
  .sort();

export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE_URL}${p === "/" ? "" : p}</loc></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml" } });
}
