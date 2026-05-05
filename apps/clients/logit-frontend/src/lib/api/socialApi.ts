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
}

export const socialApi = {
  // Feed
  async getFeed(limit = 20, before?: string): Promise<FeedPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);
    const posts = await apiClient.fetch<ApiPost[]>(`/posts/feed?${params}`);
    return {
      posts,
      nextCursor: posts.length === limit ? posts[posts.length - 1].createdAt : null,
    };
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
  async getComments(postId: string, before?: string): Promise<ApiComment[]> {
    const params = new URLSearchParams({ limit: "50" });
    if (before) params.set("before", before);
    return apiClient.fetch(`/posts/${postId}/comments?${params}`);
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

  async getUserPosts(username: string, limit = 20, before?: string): Promise<FeedPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);
    const posts = await apiClient.fetch<ApiPost[]>(`/users/${username}/posts?${params}`);
    return {
      posts,
      nextCursor: posts.length === limit ? posts[posts.length - 1].createdAt : null,
    };
  },
};
