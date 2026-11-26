import { apiClient } from "./client";
import type { GroupPerson } from "./groupsApi";

// Posts in groups (friends overhaul, design canvas Q1–Q7): Reddit-style threads. See services/api
// GroupPostEndpoints. Comments come flat with their parent; domain/commentTree builds the tree.

export const DEFAULT_POST_KINDS = ["Question", "Form check", "Advice", "Gyms and kit", "Event", "Other"];

export interface GroupPost {
  id: string;
  group: { id: string; name: string; slug: string; kind: string; place: string | null; photoUrl: string | null; members: number; access: string };
  author: GroupPerson | null;
  authorIsMember: boolean;
  /** "Organiser" or "Moderator"; null for a member or someone outside. */
  authorRole: string | null;
  title: string;
  body: string;
  kind: string;
  slug: string;
  photoUrl: string | null;
  photoWidth: number;
  photoHeight: number;
  cardType: string | null;
  cardJson: string | null;
  upvotes: number;
  upvoted: boolean;
  commentCount: number;
  createdAtMs: number;
  lastActivityAtMs: number;
  edited: boolean;
  deleted: boolean;
  removedByModerator: boolean;
  pinned: boolean;
  locked: boolean;
  onWeb: boolean;
  membersOnlyComments: boolean;
  mine: boolean;
  canComment: boolean;
  whyNot: string | null;
  canModerate: boolean;
}

export interface GroupComment {
  id: string;
  parentId: string | null;
  author: GroupPerson | null;
  authorIsMember: boolean;
  authorRole: string | null;
  body: string;
  upvotes: number;
  upvoted: boolean;
  createdAtMs: number;
  edited: boolean;
  deleted: boolean;
  removedByModerator: boolean;
  mine: boolean;
}

export interface GroupThread {
  post: GroupPost;
  /** Top first; each has its parent. */
  comments: GroupComment[];
}

export type PostSort = "active" | "new" | "top";

const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const groupPostsApi = {
  list: (groupId: string, sort: PostSort = "active", skip = 0) => apiClient.fetch<GroupPost[]>(`/groups/${groupId}/posts?sort=${sort}&skip=${skip}`),
  kinds: (groupId: string) => apiClient.fetch<string[]>(`/groups/${groupId}/post-kinds`),
  create: (groupId: string, p: { title: string; body?: string; kind: string; photoId?: string; cardType?: string; cardJson?: string; membersOnlyComments?: boolean }) =>
    apiClient.fetch<GroupPost>(`/groups/${groupId}/posts`, json("POST", p)),
  thread: (id: string) => apiClient.fetch<GroupThread>(`/group-posts/${id}`),
  edit: (id: string, p: { title?: string; body?: string; kind?: string }) => apiClient.fetch<void>(`/group-posts/${id}`, json("PATCH", p)),
  remove: (id: string) => apiClient.fetch<void>(`/group-posts/${id}`, { method: "DELETE" }),
  vote: (id: string, up: boolean) => apiClient.fetch<{ upvotes: number; upvoted: boolean }>(`/group-posts/${id}/vote`, json("PUT", { up })),
  comment: (id: string, body: string, parentId: string | null) => apiClient.fetch<GroupComment>(`/group-posts/${id}/comments`, json("POST", { body, parentId })),
  moderate: (id: string, m: { pinned?: boolean; locked?: boolean; remove?: boolean }) => apiClient.fetch<void>(`/group-posts/${id}/moderation`, json("PUT", m)),
  editComment: (id: string, body: string) => apiClient.fetch<void>(`/group-comments/${id}`, json("PATCH", { body })),
  removeComment: (id: string) => apiClient.fetch<void>(`/group-comments/${id}`, { method: "DELETE" }),
  voteComment: (id: string, up: boolean) => apiClient.fetch<{ upvotes: number; upvoted: boolean }>(`/group-comments/${id}/vote`, json("PUT", { up })),
  search: (q: string) => apiClient.fetch<GroupPost[]>(`/group-posts/search?q=${encodeURIComponent(q)}`),
};

/** A post's public address on getlogit.app (posts in groups anyone can find). */
export const postWebPath = (groupSlug: string, post: { slug: string; id: string }) => `/g/${groupSlug}/${post.slug}-${post.id.replace(/-/g, "").slice(0, 8)}`;
