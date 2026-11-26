// Groups, signed out: groups anyone can find, biggest first, or by name or place.
import { error } from "@sveltejs/kit";
import { publicApi } from "$lib/social/publicApi";
import type { PublicGroup } from "../search/+page.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, fetch, setHeaders }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const res = await fetch(`${publicApi()}/public/groups${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  if (!res.ok) error(502, "Couldn't load groups. Try again in a moment.");
  setHeaders({ "cache-control": "public, max-age=300" });
  return { q, groups: (await res.json()) as PublicGroup[], appPath: "/social" };
};
