// A forum post on the web (design canvas Q6, F1–F6): rendered on Cloudflare when asked for, so
// search engines read it. Only posts the API serves publicly (not an invite-only group's);
// anything else is a 404.
import { error } from "@sveltejs/kit";
import type { ForumThread } from "@logit/core/api/forumApi";
import { publicApi } from "$lib/social/publicApi";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const api = publicApi();
  const res = await fetch(`${api}/public/forum/${encodeURIComponent(params.post)}`);
  if (res.status === 404) error(404, "This post isn't on the web, or it was removed.");
  if (!res.ok) error(502, "Couldn't load this post. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  const thread = (await res.json()) as ForumThread;
  return { thread, api, appPath: `/social/forum/${thread.post.id}` };
};
