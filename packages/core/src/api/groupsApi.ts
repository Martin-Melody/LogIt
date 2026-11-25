import { apiBaseUrl, apiClient } from "./client";
import type { DmPerson } from "./dmApi";
import { groupLink as linkFor, parseGroupInvite, type GroupInvite } from "../domain/groupInvite";

// Groups (friends overhaul, design canvas G1–G10, P3; journey F5): a gym, club, team or group of
// friends, with a page and a chat. See services/api GroupEndpoints. The chat is a messages thread
// (dmApi with the group's threadId).

export { parseGroupInvite, type GroupInvite };
export const groupLink = (code: string, server: string = apiBaseUrl()) => linkFor(code, server);

export const GROUP_KINDS = ["Gym", "Club", "Team", "Friends"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];
export type GroupRole = "Member" | "Organiser" | "Moderator";
/** Organisers and moderators keep a group civil; only organisers run it. */
export const canModerate = (role: GroupRole) => role === "Organiser" || role === "Moderator";
/** Every chat message; events, notes and mentions (the default); off. */
export type GroupNotify = "All" | "Important" | "Off";
/** Who can find and join (canvas G11): invite only (the default), findable with approval, findable and open. */
export type GroupAccess = "InviteOnly" | "Request" | "Open";

export interface GroupPerson extends DmPerson {
  id: string;
}

export interface GroupBrief {
  id: string;
  name: string;
  kind: GroupKind;
  place: string | null;
  photoUrl: string | null;
  members: number;
}

export interface Group extends GroupBrief {
  threadId: string;
  inviteCode: string;
  note: { text: string; by: GroupPerson | null; atMs: number } | null;
  me: { role: GroupRole; onBoard: boolean; notify: GroupNotify };
  organisers: GroupPerson[];
  /** A few faces for the member row: people you follow first. */
  preview: GroupPerson[];
  access: GroupAccess;
  /** Requests waiting to join (organisers and moderators). */
  requests: number;
  /** Reported messages waiting (organisers and moderators). */
  reports: number;
  /** You're muted in the chat until then. */
  mutedUntilMs: number | null;
  /** Posts (canvas Q4). */
  posts: PostSettings | null;
}

/** Who can post: anyone signed in (members or not), members, or organisers and moderators. */
export type WhoCanPost = "Anyone" | "Members" | "Staff";
export interface PostSettings { on: boolean; whoCanPost: WhoCanPost; whoCanComment: "Anyone" | "Members"; onWeb: boolean; slug: string }
/** What the Posts list needs: a group you're in, or one you're looking at from outside (me null). */
export type PostsGroup = Pick<Group, "id" | "name" | "posts"> & { me: Pick<Group["me"], "role"> | null };

export interface GroupMember {
  user: GroupPerson;
  role: GroupRole;
  joinedAtMs: number;
  mutedUntilMs: number | null;
}

/** A reported message in a group's chat (canvas D3); never who reported it. */
export interface GroupReport {
  /** "message", "post" or "comment". */
  kind: "message" | "post" | "comment";
  postId: string | null;
  title: string | null;
  messageId: string;
  body: string;
  photoUrl: string | null;
  sender: GroupPerson | null;
  reasons: string[];
  count: number;
  latestAtMs: number;
}

export interface GroupPreview extends GroupBrief {
  organiser: string | null;
  /** Members you follow (signed in only). */
  followed: GroupPerson[];
  member: boolean;
  access: GroupAccess;
  /** You asked to join and wait for an organiser. */
  requested: boolean;
  /** A member invited you from a chat (you can join straight away). */
  invitedBy: string | null;
  /** Null when the group has posts off. */
  posts: PostSettings | null;
}

export interface GroupSearchResult extends GroupBrief {
  access: GroupAccess;
  state: "member" | "requested" | "invited" | "none";
  /** Someone you follow who's a member. */
  followed: string | null;
}

export interface GroupRequest {
  user: GroupPerson;
  atMs: number;
  /** A member who follows them. */
  followedBy: string | null;
}

const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const groupsApi = {
  mine: () => apiClient.fetch<GroupBrief[]>("/groups"),
  create: (g: { name: string; kind: GroupKind; place?: string | null; photoId?: string | null; access?: GroupAccess }) => apiClient.fetch<Group>("/groups", json("POST", g)),
  get: (id: string) => apiClient.fetch<Group>(`/groups/${id}`),
  edit: (id: string, g: { name?: string; kind?: GroupKind; place?: string; photoId?: string; removePhoto?: boolean; access?: GroupAccess;
    postsOn?: boolean; whoCanPost?: WhoCanPost; whoCanComment?: "Anyone" | "Members"; postsOnWeb?: boolean }) =>
    apiClient.fetch<Group>(`/groups/${id}`, json("PATCH", g)),
  remove: (id: string) => apiClient.fetch<void>(`/groups/${id}`, { method: "DELETE" }),
  pin: (id: string, text: string, notify: boolean) => apiClient.fetch<Group>(`/groups/${id}/note`, json("PUT", { text, notify })),
  unpin: (id: string) => apiClient.fetch<void>(`/groups/${id}/note`, { method: "DELETE" }),
  resetInvite: (id: string) => apiClient.fetch<{ inviteCode: string }>(`/groups/${id}/invite/reset`, { method: "POST" }),
  members: (id: string) => apiClient.fetch<GroupMember[]>(`/groups/${id}/members`),
  setRole: (id: string, username: string, role: GroupRole) =>
    apiClient.fetch<void>(`/groups/${id}/members/${encodeURIComponent(username)}/role`, json("PUT", { role })),
  /** An organiser removing someone, or leaving (your own username). */
  removeMember: (id: string, username: string) => apiClient.fetch<void>(`/groups/${id}/members/${encodeURIComponent(username)}`, { method: "DELETE" }),
  settings: (id: string, s: { onBoard?: boolean; notify?: GroupNotify }) => apiClient.fetch<Group["me"]>(`/groups/${id}/me`, json("PUT", s)),
  /** The join screen; works for the group's own server only (federation comes later). */
  preview: (code: string) => apiClient.fetch<GroupPreview>(`/groups/join/${encodeURIComponent(code)}`),
  join: (code: string, onBoard: boolean) => apiClient.fetch<{ id: string }>(`/groups/join/${encodeURIComponent(code)}`, json("POST", { onBoard })),
  search: (q: string) => apiClient.fetch<GroupSearchResult[]>(`/groups/search?q=${encodeURIComponent(q)}`),
  /** The join screen from search or an invite card. */
  about: (id: string) => apiClient.fetch<GroupPreview>(`/groups/${id}/about`),
  /** Straight in (open, or invited), or a request (ask to join). */
  /** eventId: joining from an event in search, so you're going to it once you're in. */
  joinById: (id: string, onBoard: boolean, eventId?: string) =>
    apiClient.fetch<{ id: string; status: "member" | "requested" }>(`/groups/${id}/join`, json("POST", { onBoard, eventId })),
  cancelRequest: (id: string) => apiClient.fetch<void>(`/groups/${id}/request`, { method: "DELETE" }),
  requests: (id: string) => apiClient.fetch<GroupRequest[]>(`/groups/${id}/requests`),
  approve: (id: string, username: string) => apiClient.fetch<void>(`/groups/${id}/requests/${encodeURIComponent(username)}`, { method: "POST" }),
  /** Mute someone in the chat for `minutes`, or lift it (null). */
  mute: (id: string, username: string, minutes: number | null) =>
    apiClient.fetch<void>(`/groups/${id}/members/${encodeURIComponent(username)}/mute`, json("PUT", { minutes })),
  removeMessage: (id: string, messageId: string) => apiClient.fetch<void>(`/groups/${id}/messages/${messageId}`, { method: "DELETE" }),
  reports: (id: string) => apiClient.fetch<GroupReport[]>(`/groups/${id}/reports`),
  keep: (id: string, messageId: string) => apiClient.fetch<void>(`/groups/${id}/reports/${messageId}/keep`, { method: "POST" }),
  decline: (id: string, username: string) => apiClient.fetch<void>(`/groups/${id}/requests/${encodeURIComponent(username)}`, { method: "DELETE" }),
};

/** The message card that invites someone to a group (sent with dmApi / queueDm). */
export function groupInviteCard(groupId: string): { type: "GroupInvite"; json: string } {
  return { type: "GroupInvite", json: JSON.stringify({ groupId }) };
}
