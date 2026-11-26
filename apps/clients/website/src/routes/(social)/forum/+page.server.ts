// The Forum, signed out (canvas S2): every forum post outside invite-only groups.
import { error } from "@sveltejs/kit";
import type { ForumPost } from "@logit/core/api/forumApi";
import { publicApi } from "$lib/social/publicApi";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, fetch, setHeaders }) => {
  const sort = (["active", "new", "top"] as const).find((s) => s === url.searchParams.get("sort")) ?? "active";
  const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0);
  const res = await fetch(`${publicApi()}/public/forum-list?sort=${sort}&skip=${skip}`);
  if (!res.ok) error(502, "Couldn't load the Forum. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=120" });
  return { posts: (await res.json()) as ForumPost[], sort, skip, appPath: "/social?tab=forum" };
};
