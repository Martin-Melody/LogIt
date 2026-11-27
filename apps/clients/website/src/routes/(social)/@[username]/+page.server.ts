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

/** A coach's invite link, opened as ?l=CODE (canvas L1): which way the button goes. */
export type ProfileLink = { code: string; state: string; pays: { amountCents: number; currency: string; interval: "month" | "once"; weeks: number | null } | null };

export const load: PageServerLoad = async ({ params, fetch, setHeaders, url }) => {
  const api = publicApi();
  const code = url.searchParams.get("l");
  const [res, linkRes] = await Promise.all([
    fetch(`${api}/public/users/${encodeURIComponent(params.username)}`),
    code && /^[A-Za-z0-9-]{4,16}$/.test(code) ? fetch(`${api}/coach/links/code/${encodeURIComponent(code)}`).catch(() => null) : Promise.resolve(null),
  ]);
  if (res.status === 404) error(404, "This profile isn't on the web");
  if (!res.ok) error(502, "Couldn't load this profile. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  const page = (await res.json()) as { profile: PublicProfile; posts: ApiPost[]; forum: ForumPost[] };
  let link: ProfileLink | null = null;
  if (linkRes?.ok) {
    const info = (await linkRes.json()) as { state: string; coach: { username: string }; package: ProfileLink["pays"] };
    // Only this coach's own link counts; a link of someone else's is ignored.
    if (info.coach.username === page.profile.username) link = { code: code!, state: info.state, pays: info.package ?? null };
  }
  return { ...page, api, link, appPath: `/social/${page.profile.username}` };
};
