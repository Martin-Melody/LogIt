// A public profile, signed out (design canvas W1, W3): rendered on Cloudflare when asked for, so
// search engines read it. Private, sample and unknown accounts are all the same 404 (W6).
import { error } from "@sveltejs/kit";
import type { ApiPost } from "@logit/core/api/socialApi";
import type { ForumPost } from "@logit/core/api/forumApi";
import type { CoachingSection } from "@logit/core/domain/coachProfile";
import { publicApi } from "$lib/social/publicApi";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export type PublicProfile = {
  username: string; displayName: string; bio: string | null; avatarUrl: string | null; posts: number; followers: number; following: number;
  publicProfileJson?: string | null;
  /** A coach's Coaching section (canvas P1); null or missing for everyone else. */
  coaching?: CoachingSection | null;
};

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
  const api = publicApi();
  const res = await fetch(`${api}/public/users/${encodeURIComponent(params.username)}`);
  if (res.status === 404) error(404, "This profile isn't on the web");
  if (!res.ok) error(502, "Couldn't load this profile. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  const page = (await res.json()) as { profile: PublicProfile; posts: ApiPost[]; forum: ForumPost[] };
  return { ...page, api, appPath: `/social/${page.profile.username}` };
};
