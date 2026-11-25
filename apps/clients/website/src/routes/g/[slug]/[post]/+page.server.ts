// A group post on the web (design canvas Q6): rendered on Cloudflare when asked for, so search
// engines read it. Only posts the API serves publicly (written while the group showed its posts
// on the web); anything else is a 404.
import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import { HOSTED_API } from "@logit/core/domain/friendInvite";
import type { GroupThread } from "@logit/core/api/groupPostsApi";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const api = (env.PUBLIC_LOGIT_API ?? HOSTED_API).replace(/\/+$/, "");
  const res = await fetch(`${api}/public/groups/${encodeURIComponent(params.slug)}/posts/${encodeURIComponent(params.post)}`);
  if (res.status === 404) error(404, "This post isn't on the web, or it was removed.");
  if (!res.ok) error(502, "Couldn't load this post. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  return { thread: (await res.json()) as GroupThread, api };
};
