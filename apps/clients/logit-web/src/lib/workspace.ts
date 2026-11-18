import { apiClient } from "@logit/core/api/client";
import { sandbox } from "$lib/features/guide/sandbox.svelte";

/** The dashboard has two workspaces: "Me" (your own training) and "Coaching" (Studio
 * accounts: your clients). Which one a page belongs to follows from its path. */
const COACHING_PREFIXES = ["/coaching", "/clients", "/roster", "/messages"];

export function isCoachingPath(pathname: string, search?: URLSearchParams): boolean {
  // A chart a coach builds for a client lives under /insights/charts with ?client=.
  if (pathname.startsWith("/insights/charts/") && search?.get("client")) return true;
  return COACHING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Whether this account gets the Coaching workspace: Studio, any account on a self-hosted
 * server (no plans there; the server doesn't lock Studio features either), or an account
 * trying coaching with sample clients (coachTrial). */
export function canCoach(): boolean {
  return apiClient.getUser()?.tier === "Studio" || apiClient.isSelfHosted() || coachTrial();
}

/** Below Studio on getlogit.app, coaching sample clients only: everything works on the
 * samples, and reaching a real person (invite links, payments) asks for Studio. The server
 * enforces the same (RequireCoaching). Needs sandbox.refresh() to have run. */
export function coachTrial(): boolean {
  const tier = apiClient.getUser()?.tier;
  return !!tier && tier !== "Studio" && !apiClient.isSelfHosted() && sandbox.on;
}
