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
export type GroupRole = "Member" | "Organiser";
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
  /** Requests waiting to join (organisers only). */
  requests: number;
}

export interface GroupMember {
  user: GroupPerson;
  role: GroupRole;
  joinedAtMs: number;
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
  edit: (id: string, g: { name?: string; kind?: GroupKind; place?: string; photoId?: string; removePhoto?: boolean; access?: GroupAccess }) =>
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
  joinById: (id: string, onBoard: boolean) => apiClient.fetch<{ id: string; status: "member" | "requested" }>(`/groups/${id}/join`, json("POST", { onBoard })),
  cancelRequest: (id: string) => apiClient.fetch<void>(`/groups/${id}/request`, { method: "DELETE" }),
  requests: (id: string) => apiClient.fetch<GroupRequest[]>(`/groups/${id}/requests`),
  approve: (id: string, username: string) => apiClient.fetch<void>(`/groups/${id}/requests/${encodeURIComponent(username)}`, { method: "POST" }),
  decline: (id: string, username: string) => apiClient.fetch<void>(`/groups/${id}/requests/${encodeURIComponent(username)}`, { method: "DELETE" }),
};

/** The message card that invites someone to a group (sent with dmApi / queueDm). */
export function groupInviteCard(groupId: string): { type: "GroupInvite"; json: string } {
  return { type: "GroupInvite", json: JSON.stringify({ groupId }) };
}
