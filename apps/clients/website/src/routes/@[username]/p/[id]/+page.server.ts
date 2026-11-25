// One post on the web, signed out (design canvas W2): what a shared link opens.
import { error } from "@sveltejs/kit";
import type { ApiComment, ApiPost } from "@logit/core/api/socialApi";
import { publicApi } from "$lib/social/publicApi";
import type { PublicProfile } from "../../+page.server";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const api = publicApi();
  const res = await fetch(`${api}/public/users/${encodeURIComponent(params.username)}/posts/${encodeURIComponent(params.id)}`);
  if (res.status === 404 || res.status === 400) error(404, "This post isn't on the web");
  if (!res.ok) error(502, "Couldn't load this post. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  const page = (await res.json()) as { profile: PublicProfile; post: ApiPost; comments: ApiComment[]; more: ApiPost[] };
  return { ...page, api };
};
