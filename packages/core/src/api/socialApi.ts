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

export interface PublicProfileData {
  widgets: PublicWidgetSlot[];
  bodyStats?: PublicBodyStats;
  activeSplit?: PublicActiveSplit | null;
  personalRecords?: PublicPersonalRecord[];
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
}

export type PostType = "Text" | "WorkoutSession" | "PersonalRecord" | "Split" | "Exercise" | "Algorithm" | "Widget";

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

export type NotificationKind = "Like" | "Comment" | "Follow";

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

  // Follow
  async follow(username: string): Promise<void> {
    return apiClient.fetch(`/users/${username}/follow`, { method: "POST" });
  },

  async unfollow(username: string): Promise<void> {
    return apiClient.fetch(`/users/${username}/follow`, { method: "DELETE" });
  },

  async getFollowers(username: string): Promise<ApiProfile[]> {
    return apiClient.fetch(`/users/${username}/followers`);
  },

  async getFollowing(username: string): Promise<ApiProfile[]> {
    return apiClient.fetch(`/users/${username}/following`);
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

  async addComment(postId: string, body: string): Promise<ApiComment> {
    return apiClient.fetch(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
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
