import { apiClient } from "./client";

export interface PublicWidgetSlot {
  id: string;
  enabled: boolean;
  order: number;
}

export interface PublicBodyStats {
  height: number | null;
  heightUnit: string;
  weight: number | null;
  weightUnit: string;
}

export interface PublicSplitDay {
  name: string;
  exercises: string[];
}

export interface PublicActiveSplit {
  name: string;
  days: PublicSplitDay[];
}

export interface PublicPersonalRecord {
  exerciseName: string;
  weight: number;
  reps: number;
}

/** V1 is one current photo, not a gallery/timeline — no object storage exists yet. See
 * docs/architecture/profile-progress-redesign.md. */
export interface PublicProgressPhoto {
  dataUrl: string;
  updatedAtMs: number;
}

export interface PublicWeightTrendPoint {
  dateIso: string;
  kg: number;
}

export interface PublicWeightTrend {
  points: PublicWeightTrendPoint[];
}

/** Training streak in weeks: a week counts once the lifter trained on `weeklyTarget` days in
 * it, and the week in progress never breaks it. Snapshots from older app versions have only
 * the day counts (consecutive calendar days), so readers fall back to those. */
export interface PublicStreak {
  currentWeeks?: number;
  bestWeeks?: number;
  weeklyTarget?: number;
  /** @deprecated day streaks, from older app versions' snapshots. */
  currentDays?: number;
  /** @deprecated */
  bestDays?: number;
}

/** A small, explicitly bounded v1 badge set — not an open achievement system. Recomputed live
 * from existing data each time, not a persisted earn-log, so there's no earnedAtMs. */
export interface PublicBadge {
  id: string;
  label: string;
}

export interface PublicProfileData {
  widgets: PublicWidgetSlot[];
  bodyStats?: PublicBodyStats;
  activeSplit?: PublicActiveSplit | null;
  personalRecords?: PublicPersonalRecord[];
  progressPhoto?: PublicProgressPhoto | null;
  weightTrend?: PublicWeightTrend;
  streak?: PublicStreak;
  badges?: PublicBadge[];
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  isFollowing: boolean;
}

export interface ApiProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  isSelf: boolean;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  publicProfileJson: string | null;
  /** Older servers don't send these: treat missing as public / visible. */
  isPrivate?: boolean;
  /** The caller's relation to this account; null for yourself. */
  followStatus?: FollowStatus | null;
  /** False: a private account you aren't an accepted follower of. Posts, profile cards and
   * follow lists are withheld (they answer 403 with code "private"). */
  canSeeContent?: boolean;
}

export type FollowStatus = "none" | "requested" | "following";

export type PostType = "Text" | "WorkoutSession" | "PersonalRecord" | "Split" | "Exercise" | "Algorithm" | "Widget" | "Habit";

export interface ApiPost {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  type: PostType;
  body: string | null;
  payloadJson: string | null;
  createdAt: string;
  likeCount: number;
  isLikedByMe: boolean;
  commentCount: number;
  editedAt: string | null;
  repostOf: RepostSource | null;
  /** Posts from private accounts can't be reposted or quoted. */
  authorIsPrivate?: boolean;
}

/** Display-only snapshot of the post a repost points at — not a full ApiPost (no like/comment
 * counts of its own; those belong to the original, not the repost). */
export interface RepostSource {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  type: PostType;
  body: string | null;
  payloadJson: string | null;
  createdAt: string;
  deleted: boolean;
  authorIsPrivate?: boolean;
  /** The original's author is private and you aren't their follower (deleted is true too). */
  unavailable?: boolean;
}

export interface FeedPage {
  posts: ApiPost[];
  nextCursor: string | null;
}

export interface ApiComment {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  isLikedByMe: boolean;
  /** Set on a reply: the top-level comment it sits under. */
  parentCommentId?: string | null;
}

export interface CommentPage {
  comments: ApiComment[];
  nextCursor: string | null;
}

export interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export type ReportTargetType = "Post" | "Comment" | "User";
export type ReportReason =
  | "Spam" | "Harassment" | "HateSpeech" | "Violence"
  | "SexualContent" | "SelfHarm" | "Misinformation" | "Other";

export type NotificationKind =
  | "Like" | "Comment" | "Follow" | "Mention" | "Repost" | "Quote" | "FollowRequest" | "FollowAccepted" | "Reply";

export interface SocialSettings {
  isPrivate: boolean;
  /** null: never asked (accounts from before Discover). Ask once. */
  showInDiscover: boolean | null;
  hideFromSuggestions: boolean;
  hidePeopleSuggestions: boolean;
  pendingRequests: number;
  notInterestedCount: number;
}

export interface FollowRequestItem {
  user: ApiProfile;
  createdAt: string;
  /** Someone you follow who follows them, and how many more do. */
  followedBy: string | null;
  followedByOthers: number;
}

export interface DiscoverPost {
  post: ApiPost;
  /** Why it's here: "Popular this week", "Niamh follows Rory". */
  reason: string;
  recipe: string;
}

export interface DiscoverPage {
  items: DiscoverPost[];
  nextCursor: string | null;
  arm: string;
}

export interface SuggestedPerson {
  user: ApiProfile;
  reason: string;
  recipe: string;
}

export interface SuggestedPeople {
  people: SuggestedPerson[];
  /** The caller closed "People you might know". */
  hidden: boolean;
}

/** "Someone you follow follows them" in a few words: "Conor follows", "Conor and 2 others follow". */
export function followedByText(name: string | null, others: number): string | null {
  if (!name) return null;
  if (others <= 0) return `${name} follows`;
  return `${name} and ${others} other${others === 1 ? "" : "s"} follow`;
}

/** True when an error from a profile/posts/followers call means "private account": show the lock. */
export function isPrivateError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { status?: number }).status === 403
    && (e as { code?: string }).code === "private";
}

export interface ApiNotification {
  id: string;
  type: NotificationKind;
  createdAt: string;
  readAt: string | null;
  actor: { id: string; username: string; displayName: string; avatarUrl: string | null };
  postId: string | null;
  commentId: string | null;
  postBody: string | null;
}

export interface NotificationPage {
  notifications: ApiNotification[];
  nextCursor: string | null;
}

/** Opaque cursor pagination: pass the previous page's `nextCursor` to get the next. */
function pageParams(limit: number, cursor?: string): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export const socialApi = {
  // Feed
  async getFeed(limit = 20, cursor?: string): Promise<FeedPage> {
    return apiClient.fetch<FeedPage>(`/posts/feed?${pageParams(limit, cursor)}`);
  },

  async getPost(id: string): Promise<ApiPost> {
    return apiClient.fetch(`/posts/${id}`);
  },

  // Posts
  async createPost(type: PostType, body?: string, payloadJson?: string): Promise<ApiPost> {
    return apiClient.fetch("/posts", {
      method: "POST",
      body: JSON.stringify({ type, body, payloadJson }),
    });
  },

  async editPost(id: string, body: string): Promise<ApiPost> {
    return apiClient.fetch(`/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  },

  async deletePost(id: string): Promise<void> {
    return apiClient.fetch(`/posts/${id}`, { method: "DELETE" });
  },

  async likePost(id: string): Promise<void> {
    return apiClient.fetch(`/posts/${id}/like`, { method: "POST" });
  },

  async unlikePost(id: string): Promise<void> {
    return apiClient.fetch(`/posts/${id}/like`, { method: "DELETE" });
  },

  /** Plain repost (no `body`) or quote repost (with your caption about the original). */
  async repost(id: string, body?: string): Promise<ApiPost> {
    return apiClient.fetch(`/posts/${id}/repost`, {
      method: "POST",
      body: JSON.stringify({ body: body?.trim() || null }),
    });
  },

  // Follow
  /** Follows a public account straight away; asks a private one ("requested"). Older servers
   * answer with no body, which means "following". */
  async follow(username: string): Promise<"following" | "requested"> {
    const res = await apiClient.fetch<{ status?: string } | undefined>(`/users/${username}/follow`, { method: "POST" });
    return res?.status === "requested" ? "requested" : "following";
  },

  /** Unfollows, or withdraws a request that hasn't been answered. */

  async unfollow(username: string): Promise<void> {
    return apiClient.fetch(`/users/${username}/follow`, { method: "DELETE" });
  },

  async getFollowers(username: string): Promise<ApiProfile[]> {
    return apiClient.fetch(`/users/${username}/followers`);
  },

  async getFollowing(username: string): Promise<ApiProfile[]> {
    return apiClient.fetch(`/users/${username}/following`);
  },

  /** Stops someone following you, without blocking them. */
  async removeFollower(username: string): Promise<void> {
    return apiClient.fetch(`/users/me/followers/${username}`, { method: "DELETE" });
  },

  async getFollowRequests(): Promise<FollowRequestItem[]> {
    return apiClient.fetch(`/users/me/follow-requests`);
  },

  async acceptFollowRequest(username: string): Promise<void> {
    return apiClient.fetch(`/users/me/follow-requests/${username}/accept`, { method: "POST" });
  },

  async declineFollowRequest(username: string): Promise<void> {
    return apiClient.fetch(`/users/me/follow-requests/${username}`, { method: "DELETE" });
  },

  async getSettings(): Promise<SocialSettings> {
    return apiClient.fetch(`/users/me/social-settings`);
  },

  /** Only the fields given change. */
  async updateSettings(change: Partial<Omit<SocialSettings, "pendingRequests" | "notInterestedCount">>): Promise<SocialSettings> {
    return apiClient.fetch(`/users/me/social-settings`, { method: "PUT", body: JSON.stringify(change) });
  },

  /** Your name, bio, photo and profile cards. Only the fields given change; "" clears the photo. */
  async updateMe(change: { displayName?: string; bio?: string; avatarUrl?: string; publicProfileJson?: string }): Promise<ApiProfile> {
    return apiClient.fetch("/users/me", { method: "PATCH", body: JSON.stringify(change) });
  },

  async updatePublicProfile(data: PublicProfileData): Promise<void> {
    await apiClient.fetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ publicProfileJson: JSON.stringify(data) }),
    });
  },

  // Profiles
  async getProfile(username: string): Promise<ApiProfile> {
    return apiClient.fetch(`/users/${username}`);
  },

  async searchUsers(q: string): Promise<UserSearchResult[]> {
    return apiClient.fetch(`/users/search?q=${encodeURIComponent(q)}`);
  },

  // Comments
  async getComments(postId: string, cursor?: string): Promise<CommentPage> {
    return apiClient.fetch(`/posts/${postId}/comments?${pageParams(50, cursor)}`);
  },

  /** `replyTo` is the comment being answered (a reply to a reply is fine: the server files it
   * under the same top-level comment). */
  async addComment(postId: string, body: string, replyTo?: string): Promise<ApiComment> {
    return apiClient.fetch(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify(replyTo ? { body, parentCommentId: replyTo } : { body }),
    });
  },

  async editComment(postId: string, commentId: string, body: string): Promise<ApiComment> {
    return apiClient.fetch(`/posts/${postId}/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  },

  async deleteComment(postId: string, commentId: string): Promise<void> {
    return apiClient.fetch(`/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
  },

  async likeComment(postId: string, commentId: string): Promise<void> {
    return apiClient.fetch(`/posts/${postId}/comments/${commentId}/like`, { method: "POST" });
  },

  async unlikeComment(postId: string, commentId: string): Promise<void> {
    return apiClient.fetch(`/posts/${postId}/comments/${commentId}/like`, { method: "DELETE" });
  },

  async getUserPosts(username: string, limit = 20, cursor?: string): Promise<FeedPage> {
    return apiClient.fetch<FeedPage>(`/users/${username}/posts?${pageParams(limit, cursor)}`);
  },

  // Moderation
  async blockUser(username: string): Promise<void> {
    return apiClient.fetch(`/users/${username}/block`, { method: "POST" });
  },

  async unblockUser(username: string): Promise<void> {
    return apiClient.fetch(`/users/${username}/block`, { method: "DELETE" });
  },

  async getBlockedUsers(): Promise<BlockedUser[]> {
    return apiClient.fetch(`/users/me/blocks`);
  },

  async reportContent(
    targetType: ReportTargetType,
    targetId: string,
    reason: ReportReason,
    note?: string,
  ): Promise<void> {
    return apiClient.fetch(`/reports`, {
      method: "POST",
      body: JSON.stringify({ targetType, targetId, reason, note }),
    });
  },
};

export const notificationsApi = {
  async list(cursor?: string): Promise<NotificationPage> {
    return apiClient.fetch(`/notifications?${pageParams(30, cursor)}`);
  },

  async unreadCount(): Promise<number> {
    const res = await apiClient.fetch<{ count: number }>(`/notifications/unread-count`);
    return res.count;
  },

  /** Mark specific notifications read, or all unread when `ids` is omitted. */
  async markRead(ids?: string[]): Promise<void> {
    await apiClient.fetch(`/notifications/read`, {
      method: "POST",
      body: JSON.stringify({ ids: ids ?? null }),
    });
  },
};

/** Discover: posts and people from outside who you follow, picked on the server (see the
 * server's Features/Discover). */
export const discoverApi = {
  async posts(limit = 20, cursor?: string): Promise<DiscoverPage> {
    return apiClient.fetch(`/discover/posts?${pageParams(limit, cursor)}`);
  },

  async people(limit = 8): Promise<SuggestedPeople> {
    return apiClient.fetch(`/discover/people?limit=${limit}`);
  },

  /** "Not interested": Discover stops showing this person. */
  async notInterested(username: string): Promise<void> {
    return apiClient.fetch(`/discover/not-interested/${username}`, { method: "POST" });
  },

  async undoNotInterested(username: string): Promise<void> {
    return apiClient.fetch(`/discover/not-interested/${username}`, { method: "DELETE" });
  },

  async listNotInterested(): Promise<{ user: ApiProfile; createdAt: string }[]> {
    return apiClient.fetch(`/discover/not-interested`);
  },
};
