import { apiClient } from "./client";
import type { DmPerson } from "./dmApi";

// Stories (friends overhaul, design canvas S1–S4), copied from Instagram: 24 hours, followers
// only, Close friends and "Hide story from". The server decides who sees what; see services/api
// StoryEndpoints. A story is a card (domain/messageCard), a photo, or a photo with the card on
// top; a reply is a message quoting it.

export interface Story {
  id: string;
  /** Empty for a photo on its own. */
  cardType: string;
  cardJson: string;
  photoUrl: string | null;
  photoWidth: number;
  photoHeight: number;
  createdAtMs: number;
  expiresAtMs: number;
  closeFriends: boolean;
  /** You watched it (always true for your own). */
  seen: boolean;
  cheered: boolean;
}

/** One circle in the stories row. */
export interface StoryAuthor {
  user: DmPerson;
  mine: boolean;
  /** Their "Cheers and replies" lets you cheer and reply. */
  canReply: boolean;
  /** Oldest first. */
  stories: Story[];
}

export interface StoryViewer {
  user: DmPerson;
  cheered: boolean;
  viewedAtMs: number;
}

export type StoryList = "close-friends" | "hidden";

export const storiesApi = {
  row: () => apiClient.fetch<StoryAuthor[]>("/stories"),
  /** A card, a photo uploaded first (photosApi.uploadPhoto), or both. */
  post: (card: { type: string; json: string } | null, closeFriends: boolean, photoId?: string) =>
    apiClient.fetch<Story>("/stories", {
      method: "POST",
      body: JSON.stringify({ cardType: card?.type ?? null, cardJson: card?.json ?? null, closeFriends, photoId: photoId ?? null }),
    }),
  remove: (id: string) => apiClient.fetch<void>(`/stories/${id}`, { method: "DELETE" }),
  seen: (id: string) => apiClient.fetch<void>(`/stories/${id}/seen`, { method: "POST" }),
  cheer: (id: string) => apiClient.fetch<void>(`/stories/${id}/cheer`, { method: "POST" }),
  viewers: (id: string) => apiClient.fetch<StoryViewer[]>(`/stories/${id}/viewers`),
  lists: () => apiClient.fetch<{ closeFriends: DmPerson[]; hidden: DmPerson[] }>("/stories/lists"),
  add: (list: StoryList, username: string) => apiClient.fetch<void>(`/stories/lists/${list}/${encodeURIComponent(username)}`, { method: "PUT" }),
  drop: (list: StoryList, username: string) => apiClient.fetch<void>(`/stories/lists/${list}/${encodeURIComponent(username)}`, { method: "DELETE" }),
};

/** A story reply's card: what the server stored (the story's card and when it ends). */
export function storyReplyCard(storyId: string): { type: "Story"; json: string } {
  return { type: "Story", json: JSON.stringify({ storyId }) };
}
