// The sitemap index robots.txt points to: the site's own pages, then the social pages the API lists.
import { SITE_URL } from "$lib/site";

export const prerender = true;

const SITEMAPS = ["pages", "posts", "profiles", "groups"];

export function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAPS.map((s) => `  <sitemap><loc>${SITE_URL}/sitemap-${s}.xml</loc></sitemap>`).join("\n")}
</sitemapindex>`;
  return new Response(body, { headers: { "content-type": "application/xml" } });
}
