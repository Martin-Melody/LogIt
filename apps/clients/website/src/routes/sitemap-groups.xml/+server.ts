// Groups anyone can find, for search engines (design canvas S4), and the Social pages to start from.
import { SITE_URL } from "$lib/site";
import { publicApi } from "$lib/social/publicApi";

export const prerender = false;

export async function GET({ fetch }) {
  const res = await fetch(`${publicApi()}/public/group-index`).catch(() => null);
  const now = Date.now();
  const rows: { path: string; lastModMs: number }[] = [
    ...["/explore", "/forum", "/groups"].map((path) => ({ path, lastModMs: now })),
    ...(res?.ok ? await res.json() : []),
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.map((r) => `  <url><loc>${esc(SITE_URL + r.path)}</loc><lastmod>${new Date(r.lastModMs).toISOString()}</lastmod></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
}
