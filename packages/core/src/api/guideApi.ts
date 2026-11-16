import { apiClient } from "./client";
import { mergeProgress, parseProgress, type GuideProgress } from "../guide/progress";

/** Walkthrough progress on the account (GET/PUT /users/me/guide). */
export const guideApi = {
  async get(): Promise<GuideProgress> {
    return parseProgress(await apiClient.fetch<unknown>("/users/me/guide"));
  },
  /** Merges with what the server has first, so another device's ticks survive. Returns the merged progress. */
  async save(local: GuideProgress): Promise<GuideProgress> {
    let merged = local;
    try {
      merged = mergeProgress(await guideApi.get(), local);
    } catch {
      // Offline or an old server: write ours.
    }
    await apiClient.fetch("/users/me/guide", { method: "PUT", body: JSON.stringify(merged) });
    return merged;
  },
};
