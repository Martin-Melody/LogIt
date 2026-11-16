/** The dashboard has two workspaces: "Me" (your own training) and "Coaching" (Studio
 * accounts: your clients). Which one a page belongs to follows from its path. */
const COACHING_PREFIXES = ["/coaching", "/clients", "/roster", "/messages"];

export function isCoachingPath(pathname: string, search?: URLSearchParams): boolean {
  // A chart a coach builds for a client lives under /insights/charts with ?client=.
  if (pathname.startsWith("/insights/charts/") && search?.get("client")) return true;
  return COACHING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
