// Forum posts on the web, for search engines (design canvas Q6, F4).
import { env } from "$env/dynamic/public";
import { HOSTED_API } from "@logit/core/domain/friendInvite";
import { SITE_URL } from "$lib/site";

export const prerender = false;

export async function GET({ fetch }) {
  const api = (env.PUBLIC_LOGIT_API ?? HOSTED_API).replace(/\/+$/, "");
  const res = await fetch(`${api}/public/forum`).catch(() => null);
  const rows: { path: string; lastModMs: number }[] = res?.ok ? await res.json() : [];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.map((r) => `  <url><loc>${esc(SITE_URL + r.path)}</loc><lastmod>${new Date(r.lastModMs).toISOString()}</lastmod></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "content-type": "application/xml", "cache-control": "public, max-age=3600" } });
}
