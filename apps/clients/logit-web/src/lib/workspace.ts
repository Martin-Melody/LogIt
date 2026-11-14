/** The dashboard has two workspaces: "Me" (your own training) and "Coaching" (Studio
 * accounts: your clients). Which one a page belongs to follows from its path. */
const COACHING_PREFIXES = ["/clients", "/roster", "/messages"];

export function isCoachingPath(pathname: string): boolean {
  return COACHING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
