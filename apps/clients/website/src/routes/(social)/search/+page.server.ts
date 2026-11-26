// Search, signed out (canvas S3): tags, public accounts, groups anyone can find, forum posts and
// Discover's posts. "#sligo" goes straight to the tag's page.
import { error, redirect } from "@sveltejs/kit";
import type { ForumPost, TagCount } from "@logit/core/api/forumApi";
import type { ApiPost } from "@logit/core/api/socialApi";
import { publicApi } from "$lib/social/publicApi";
import type { PageServerLoad } from "./$types";

export type PublicPerson = { username: string; displayName: string; avatarUrl: string | null; bio: string | null };
export type PublicGroup = { id: string; name: string; kind: string; place: string | null; photoUrl: string | null; members: number; access: string; webPath: string };
type Found = { tags: TagCount[]; people: PublicPerson[]; groups: PublicGroup[]; forum: ForumPost[]; posts: ApiPost[] };

export const load: PageServerLoad = async ({ url, fetch }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const tag = /^#[\p{L}\p{N}_]{1,40}$/u.test(q) ? q.slice(1).toLowerCase() : null;
  if (tag) redirect(303, `/t/${encodeURIComponent(tag)}`);
  const tab = (["forum", "posts", "people", "groups"] as const).find((t) => t === url.searchParams.get("tab")) ?? "top";
  if (q.length < 2) return { q, tab, found: null as Found | null, appPath: "/social" };
  const res = await fetch(`${publicApi()}/public/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) error(502, "Couldn't search. Try again in a moment.");
  return { q, tab, found: (await res.json()) as Found, appPath: "/social" };
};
