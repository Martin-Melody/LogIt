// The frame's right column for every public Social page (canvas row 20): Trending and People to
// follow. Rendered on Cloudflare when asked for, like the pages in it.
import { publicApi } from "$lib/social/publicApi";
import type { LayoutServerLoad } from "./$types";

export const prerender = false;

type Rail = { trending: { tag: string; count: number }[]; people: { username: string; displayName: string; avatarUrl: string | null; bio: string | null }[] };

export const load: LayoutServerLoad = async ({ fetch }) => {
  const api = publicApi();
  const res = await fetch(`${api}/public/rail`).catch(() => null);
  const rail: Rail = res?.ok ? await res.json() : { trending: [], people: [] };
  return { rail, api };
};
