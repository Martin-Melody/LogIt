import { apiClient } from "./client";

// Messages between people (friends overhaul, design canvas M1–M3). The server applies message
// controls, requests, blocks and read receipts; see services/api DirectMessageEndpoints.

export interface DmPerson {
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
}

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
  send: (to: DmTo, clientId: string, body: string, card?: { type: string; json: string }) =>
    apiClient.fetch<DmMessage>("/dm/send", {
      method: "POST",
      body: JSON.stringify({ ...to, clientId, body, ...(card ? { cardType: card.type, cardJson: card.json } : {}) }),
    }),
  read: (threadId: string) => apiClient.fetch<void>(`/dm/threads/${threadId}/read`, { method: "POST" }),
  accept: (threadId: string) => apiClient.fetch<void>(`/dm/threads/${threadId}/accept`, { method: "POST" }),
  remove: (threadId: string) => apiClient.fetch<void>(`/dm/threads/${threadId}`, { method: "DELETE" }),
};
