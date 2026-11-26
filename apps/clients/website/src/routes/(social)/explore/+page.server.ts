// Explore, signed out (canvas S1): Discover's posts, newest first.
import { error } from "@sveltejs/kit";
import type { FeedPage } from "@logit/core/api/socialApi";
import { publicApi } from "$lib/social/publicApi";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, fetch, setHeaders }) => {
  const cursor = url.searchParams.get("cursor");
  const res = await fetch(`${publicApi()}/public/explore${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
  if (!res.ok) error(502, "Couldn't load Explore. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=120" });
  return { page: (await res.json()) as FeedPage, appPath: "/social?tab=discover" };
};
