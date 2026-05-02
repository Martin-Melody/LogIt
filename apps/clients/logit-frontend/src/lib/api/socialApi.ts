import { apiClient } from "./client";

export interface ApiProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  isFollowing?: boolean;
}

export type PostType = "Text" | "WorkoutSession" | "PersonalRecord";

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
}

export interface FeedPage {
  posts: ApiPost[];
  nextCursor: string | null;
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

  async deletePost(id: string): Promise<void> {
    return apiClient.fetch(`/posts/${id}`, { method: "DELETE" });
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

  // Profiles
  async getProfile(username: string): Promise<ApiProfile> {
    return apiClient.fetch(`/users/${username}`);
  },
};
