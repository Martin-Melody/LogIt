import { apiClient } from "./client";

// Messages between people (friends overhaul, design canvas M1–M3). The server applies message
// controls, requests, blocks and read receipts; see services/api DirectMessageEndpoints.

export interface DmPerson {
  /** Present on chats (for reporting); not on stories. */
  id?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DmThread {
  id: string;
  /** Null for a deleted account. */
  other: DmPerson | null;
  lastBody: string;
  lastAtMs: number;
  lastMine: boolean;
  unread: boolean;
}

export interface DmMessage {
  id: string;
  clientId: string;
  body: string;
  createdAtMs: number;
  mine: boolean;
  /** A shared workout or record (see domain/messageCard). */
  cardType: string | null;
  cardJson: string | null;
  /** A photo (/photos/…, through photoSrc) and its size; null when hidden or none. */
  photoUrl: string | null;
  photoWidth: number;
  photoHeight: number;
  /** A photo in a request you haven't accepted: shown blurred until you do. */
  photoHidden: boolean;
  /** A voice message (/voice/…, through voiceSrc), its length and waveform; locked in an unaccepted request. */
  voiceUrl: string | null;
  voiceMs: number;
  voicePeaks: string | null;
  voiceHidden: boolean;
  /** The sender changed the text after sending it. */
  edited: boolean;
  /** Unsent: shown as "… unsent a message" where it was; its content is gone. */
  deleted: boolean;
  /** Removed by LogIt after a report. */
  removedByLogIt: boolean;
}

/** What's left of a message once it's unsent, for showing it before the next reload. */
export const unsent = (m: DmMessage): DmMessage => ({ ...m, deleted: true, body: "", cardType: null, cardJson: null, photoUrl: null, photoHidden: false, voiceUrl: null, voiceHidden: false });

/** Your own text can be edited for this long after sending, as on Instagram. */
export const DM_EDIT_WINDOW_MS = 15 * 60_000;

export interface DmChat {
  /** Null before the first message. */
  threadId: string | null;
  other: DmPerson | null;
  /** False = it's in your requests. */
  accepted: boolean;
  /** When they last read it (read receipts on for both, and they've accepted). */
  seenAtMs: number | null;
  canSend: boolean;
  why: string | null;
  messages: DmMessage[];
}

/** Who a message goes to: a username, or a thread (a deleted account has no username). */
export type DmTo = { username: string } | { threadId: string };

const q = (to: DmTo) => ("username" in to ? `username=${encodeURIComponent(to.username)}` : `threadId=${encodeURIComponent(to.threadId)}`);

export const dmApi = {
  threads: (box: "chats" | "requests") => apiClient.fetch<DmThread[]>(`/dm/threads?box=${box}`),
  unread: () => apiClient.fetch<{ chats: number; requests: number }>("/dm/unread"),
  chat: (to: DmTo, beforeMs?: number) => apiClient.fetch<DmChat>(`/dm/chat?${q(to)}${beforeMs ? `&before=${beforeMs}` : ""}`),
  send: (to: DmTo, clientId: string, body: string, extra: { card?: { type: string; json: string }; photoId?: string; voice?: { id: string; peaks: string } } = {}) =>
    apiClient.fetch<DmMessage>("/dm/send", {
      method: "POST",
      body: JSON.stringify({
        ...to, clientId, body,
        ...(extra.card ? { cardType: extra.card.type, cardJson: extra.card.json } : {}),
        ...(extra.photoId ? { photoId: extra.photoId } : {}),
        ...(extra.voice ? { voiceId: extra.voice.id, voicePeaks: extra.voice.peaks } : {}),
      }),
    }),
  read: (threadId: string) => apiClient.fetch<void>(`/dm/threads/${threadId}/read`, { method: "POST" }),
  accept: (threadId: string) => apiClient.fetch<void>(`/dm/threads/${threadId}/accept`, { method: "POST" }),
  remove: (threadId: string) => apiClient.fetch<void>(`/dm/threads/${threadId}`, { method: "DELETE" }),
  /** Your own text, within DM_EDIT_WINDOW_MS. */
  edit: (messageId: string, body: string) => apiClient.fetch<DmMessage>(`/dm/messages/${messageId}`, { method: "PATCH", body: JSON.stringify({ body }) }),
  /** Unsend: gone for everyone. */
  unsend: (messageId: string) => apiClient.fetch<void>(`/dm/messages/${messageId}`, { method: "DELETE" }),
};
