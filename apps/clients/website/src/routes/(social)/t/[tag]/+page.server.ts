// A tag's page on the web (design canvas F4): getlogit.app/t/sligo, rendered on Cloudflare so
// search engines read it. A tag nobody uses publicly is a 404.
import { error } from "@sveltejs/kit";
import type { ForumPost, TagInfo } from "@logit/core/api/forumApi";
import type { ApiPost } from "@logit/core/api/socialApi";
import { publicApi } from "$lib/social/publicApi";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const api = publicApi();
  const res = await fetch(`${api}/public/tags/${encodeURIComponent(params.tag)}`);
  if (res.status === 404) error(404, "Nothing public has this tag yet.");
  if (!res.ok) error(502, "Couldn't load this tag. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  const page = (await res.json()) as { tag: TagInfo; forum: ForumPost[]; posts: ApiPost[] };
  return { ...page, api, appPath: `/social/tag/${encodeURIComponent(page.tag.tag)}` };
};
