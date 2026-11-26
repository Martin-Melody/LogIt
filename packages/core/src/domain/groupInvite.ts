// A group's join link (design canvas G10): getlogit.app/g#logit-gr1:<code>, with the group's server
// after a second ":" when it isn't getlogit.app. Like a friend's invite, the code sits after the #,
// so it never reaches a web server's logs.
import { HOSTED_API, type FriendInvite } from "./friendInvite";

export const GROUP_PAGE = "https://getlogit.app/g";
export type GroupInvite = FriendInvite;

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export function groupLink(code: string, server: string): string {
  const onHosted = server.replace(/\/+$/, "") === HOSTED_API;
  return `${GROUP_PAGE}#logit-gr1:${code}${onHosted ? "" : `:${b64url(server)}`}`;
}

/** Finds a group link in a link or pasted text; null when there isn't one. */
export function parseGroupInvite(text: string): GroupInvite | null {
  const m = text.match(/logit-gr1:([a-z0-9]{6,16})(?::([A-Za-z0-9_-]+))?/);
  if (!m) return null;
  try {
    return { code: m[1]!, server: m[2] ? unb64url(m[2]).replace(/\/+$/, "") : HOSTED_API };
  } catch {
    return null;
  }
}
