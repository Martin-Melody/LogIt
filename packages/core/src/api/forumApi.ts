import { apiClient } from "./client";
import type { GroupPerson } from "./groupsApi";
import type { FeedPage } from "./socialApi";

// The Forum (design canvas row 19): Reddit-style threads from anyone, with #tags and optionally a
// group they're labelled with. See services/api GroupPostEndpoints and Hashtags. Comments come
// flat with their parent; domain/commentTree builds the tree.

/** Offered under the tag field before anything's typed (canvas F3). */
export const SUGGESTED_TAGS = ["question", "formcheck", "advice"];
export const MAX_TAGS = 10;

export interface ForumGroup { id: string; name: string; kind: string; place: string | null; photoUrl: string | null; members: number; access: string }

export interface ForumPost {
  id: string;
  /** The group it's labelled with, if any. */
  group: ForumGroup | null;
  author: GroupPerson | null;
  /** In the group it's labelled with. */
  authorIsMember: boolean;
  /** "Organiser" or "Moderator" there; null otherwise. */
  authorRole: string | null;
  title: string;
  body: string;
  /** Lower case, without the #. */
  tags: string[];
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
  /** Anyone can read it, here and on the web (false: an invite-only group's). */
  onWeb: boolean;
  /** Its address on getlogit.app, e.g. "/forum/best-gyms-in-sligo-1a2b3c4d". */
  webPath: string;
  mine: boolean;
  canComment: boolean;
  whyNot: string | null;
  canModerate: boolean;
}

export interface ForumComment {
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

export interface ForumThread {
  post: ForumPost;
  /** Top first; each has its parent. */
  comments: ForumComment[];
}

export type PostSort = "active" | "new" | "top";
export interface TagCount { tag: string; count: number }
export interface TagInfo { tag: string; forumPosts: number; posts: number }

const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const query = (q: Record<string, string | number | undefined | null>) =>
  Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const forumApi = {
  /** The Forum, or one group's posts, one tag's or one person's. */
  list: (q: { sort?: PostSort; skip?: number; group?: string; tag?: string; user?: string } = {}) => apiClient.fetch<ForumPost[]>(`/forum?${query(q)}`),
  create: (p: { title: string; body?: string; tags: string[]; groupId?: string | null; photoId?: string; cardType?: string; cardJson?: string }) =>
    apiClient.fetch<ForumPost>("/forum", json("POST", p)),
  thread: (id: string) => apiClient.fetch<ForumThread>(`/forum/${id}`),
  edit: (id: string, p: { title?: string; body?: string; tags?: string[] }) => apiClient.fetch<void>(`/forum/${id}`, json("PATCH", p)),
  remove: (id: string) => apiClient.fetch<void>(`/forum/${id}`, { method: "DELETE" }),
  vote: (id: string, up: boolean) => apiClient.fetch<{ upvotes: number; upvoted: boolean }>(`/forum/${id}/vote`, json("PUT", { up })),
  comment: (id: string, body: string, parentId: string | null) => apiClient.fetch<ForumComment>(`/forum/${id}/comments`, json("POST", { body, parentId })),
  moderate: (id: string, m: { pinned?: boolean; locked?: boolean; remove?: boolean; removeTag?: string }) => apiClient.fetch<void>(`/forum/${id}/moderation`, json("PUT", m)),
  editComment: (id: string, body: string) => apiClient.fetch<void>(`/forum-comments/${id}`, json("PATCH", { body })),
  removeComment: (id: string) => apiClient.fetch<void>(`/forum-comments/${id}`, { method: "DELETE" }),
  voteComment: (id: string, up: boolean) => apiClient.fetch<{ upvotes: number; upvoted: boolean }>(`/forum-comments/${id}/vote`, json("PUT", { up })),
  /** A post by its web address ("best-gyms-in-sligo-1a2b3c4d"), for links from getlogit.app. */
  byWebSlug: (slug: string) => apiClient.fetch<ForumThread>(`/public/forum/${encodeURIComponent(slug)}`),
  /** By title, text, tag or group; "#sligo" is that tag. */
  search: (q: string) => apiClient.fetch<ForumPost[]>(`/forum/search?q=${encodeURIComponent(q)}`),
};

export const tagsApi = {
  /** Tags in use starting with `q`, most used first. */
  suggest: (q: string) => apiClient.fetch<TagCount[]>(`/tags?q=${encodeURIComponent(q)}`),
  trending: () => apiClient.fetch<TagCount[]>("/tags/trending"),
  about: (tag: string) => apiClient.fetch<TagInfo>(`/tags/${encodeURIComponent(tag)}`),
  /** Regular posts with the tag that you can see. */
  posts: (tag: string, cursor?: string | null) => apiClient.fetch<FeedPage>(`/tags/${encodeURIComponent(tag)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
};

/** "#Sligo " → "sligo"; null when it isn't a tag (same rule as the server). */
export function normalizeTag(raw: string): string | null {
  const t = raw.trim().replace(/^#+/, "").toLowerCase();
  return /^[\p{L}\p{N}_]{1,40}$/u.test(t) ? t : null;
}
