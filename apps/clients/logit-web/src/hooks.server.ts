import type { Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";

// A self-hosted dashboard is told its own API when the server starts (API_URL in .env, passed in
// as PUBLIC_API_URL), so people don't have to pick "use your own server" at sign-in. A value
// starting with ":" means "this page's host on that port" (the default, ":8080"). Unset (the
// hosted dashboard) leaves the built-in address.
const apiUrl = env.PUBLIC_API_URL?.trim();
// getlogit.app: the admin console calls its API through this path on the dashboard's own domain,
// behind Cloudflare Access (deploy/production/Caddyfile).
const adminApi = env.PUBLIC_ADMIN_API?.trim();
const json = (v: string) => JSON.stringify(v).replace(/</g, "\\u003c");
const script = [
  apiUrl && `window.__LOGIT_API_URL__=${json(apiUrl)}`,
  adminApi && `window.__LOGIT_ADMIN_API__=${json(adminApi)}`,
].filter(Boolean).join(";");

export const handle: Handle = ({ event, resolve }) =>
  script
    ? resolve(event, { transformPageChunk: ({ html }) => html.replace("</head>", `<script>${script}</script></head>`) })
    : resolve(event);
