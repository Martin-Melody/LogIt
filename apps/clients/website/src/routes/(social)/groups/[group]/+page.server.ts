// A group anyone can find (canvas S4): getlogit.app/groups/<name>-<id>. Invite-only groups have
// no page; that's the same 404 as a group that doesn't exist.
import { error } from "@sveltejs/kit";
import type { ForumPost } from "@logit/core/api/forumApi";
import { publicApi } from "$lib/social/publicApi";
import type { PublicGroup } from "../../search/+page.server";
import type { PageServerLoad } from "./$types";

type GroupPage = { group: PublicGroup; organiser: string | null; events: { id: string; title: string; kind: string; startsAtMs: number; place: string | null; going: number }[]; posts: ForumPost[] };

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const res = await fetch(`${publicApi()}/public/groups/${encodeURIComponent(params.group)}`);
  if (res.status === 404) error(404, "This group isn't on the web.");
  if (!res.ok) error(502, "Couldn't load this group. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  const page = (await res.json()) as GroupPage;
  return { ...page, appPath: `/groups/${page.group.id}` };
};
