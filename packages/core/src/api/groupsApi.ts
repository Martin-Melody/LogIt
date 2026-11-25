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
}

const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const groupsApi = {
  mine: () => apiClient.fetch<GroupBrief[]>("/groups"),
  create: (g: { name: string; kind: GroupKind; place?: string | null; photoId?: string | null }) => apiClient.fetch<Group>("/groups", json("POST", g)),
  get: (id: string) => apiClient.fetch<Group>(`/groups/${id}`),
  edit: (id: string, g: { name?: string; kind?: GroupKind; place?: string; photoId?: string; removePhoto?: boolean }) =>
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
};
