// "Invite a friend" links (friends overhaul, design canvas T3), shared by the app and the website.
// The link is getlogit.app/f#logit-fr1:<code>, with the inviter's server after a second ":" when it
// isn't getlogit.app. Like a shared algorithm (getlogit.app/a), the code sits after the #, so it
// never reaches a web server's logs; the page reads it in the browser and opens LogIt.

export const HOSTED_API = "https://api.getlogit.app";
export const INVITE_PAGE = "https://getlogit.app/f";

export interface FriendInvite {
  code: string;
  /** The API of the inviter's server. */
  server: string;
}

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export function inviteLink(code: string, server: string): string {
  const onHosted = server.replace(/\/+$/, "") === HOSTED_API;
  return `${INVITE_PAGE}#logit-fr1:${code}${onHosted ? "" : `:${b64url(server)}`}`;
}

/** Finds an invite in a link or pasted text; null when there isn't one. */
export function parseInvite(text: string): FriendInvite | null {
  const m = text.match(/logit-fr1:([a-z0-9]{6,16})(?::([A-Za-z0-9_-]+))?/);
  if (!m) return null;
  try {
    return { code: m[1]!, server: m[2] ? unb64url(m[2]).replace(/\/+$/, "") : HOSTED_API };
  } catch {
    return null;
  }
}

