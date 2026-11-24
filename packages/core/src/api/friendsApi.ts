import { apiBaseUrl, apiClient } from "./client";
// "Invite a friend" (friends overhaul, design canvas T3). Link format: ../domain/friendInvite.
import { HOSTED_API, INVITE_PAGE, inviteLink as linkFor, parseInvite, type FriendInvite } from "../domain/friendInvite";

export { HOSTED_API, INVITE_PAGE, parseInvite, type FriendInvite };

/** Your invite link, on this app's server. */
export const inviteLink = (code: string, server: string = apiBaseUrl()) => linkFor(code, server);


export interface InvitePreview {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export const friendsApi = {
  /** Your invite (the same one every time, until you make a new one). */
  myInvite: () => apiClient.fetch<{ code: string }>("/friends/invite"),
  /** Replaces your invite; the old link stops working. */
  newInvite: () => apiClient.fetch<{ code: string }>("/friends/invite/new", { method: "POST" }),
  /** Who sent it: name and photo only, no sign-in needed. */
  async preview(invite: FriendInvite): Promise<InvitePreview> {
    const res = await fetch(`${invite.server}/friends/invites/${encodeURIComponent(invite.code)}`);
    if (!res.ok) throw new Error(res.status === 404 ? "This invite link doesn't work any more." : "Couldn't open the invite.");
    return res.json();
  },
  /** Follow each other. Only on the inviter's server. */
  accept: (code: string) => apiClient.fetch<{ username: string }>(`/friends/invites/${encodeURIComponent(code)}/accept`, { method: "POST" }),
};
