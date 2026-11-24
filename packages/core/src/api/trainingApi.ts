import { apiClient } from "./client";

// Training now and cheers (friends overhaul, design canvas T1–T2). Training now works like
// Instagram's activity status: the people you follow see a green dot while your workout runs.

export interface TrainingFriend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** The day's name, e.g. "Push A". */
  what: string | null;
  /** ISO time the workout started. */
  since: string;
}

export const trainingApi = {
  /** While a workout runs; refreshed every few minutes, it goes stale 20 minutes after the last. */
  start: (what: string | null) => apiClient.fetch<void>("/training/now", { method: "PUT", body: JSON.stringify({ what }) }),
  stop: () => apiClient.fetch<void>("/training/now", { method: "DELETE" }),
  /** Who you can see training now. */
  friends: () => apiClient.fetch<TrainingFriend[]>("/training/now"),
  cheer: (username: string) => apiClient.fetch<void>(`/training/${encodeURIComponent(username)}/cheer`, { method: "POST" }),
};
