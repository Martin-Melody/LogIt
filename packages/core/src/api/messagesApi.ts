import { apiClient, type ApiFetcher } from "./client";
import type { RequestEvent } from "../domain/coachRequest";

export interface RemoteMessage {
  messageId: string;
  body: string;
  createdAtMs: number;
  readAtMs: number | null;
  mine: boolean;
  contextDateIso?: string | null;
  photoUrl?: string | null;
  photoWidth?: number;
  photoHeight?: number;
  voiceUrl?: string | null;
  voiceMs?: number;
  voicePeaks?: string | null;
  /** The other person's reaction (only the person it was sent to reacts). */
  reaction?: string | null;
  /** A step in a request (an offer, the waiting list…); `body` says it in words too. */
  kind?: RequestEvent | "lasting-swap" | "program-swap" | "goal-suggestion" | "goal-answer" | "checkin-reply" | null;
  /** What that step's card shows, as JSON (an OfferCard for "offer" and "offer-changed"). */
  cardJson?: string | null;
}

export interface SendMessageInput {
  relationshipId: string;
  messageId: string;
  body: string;
  createdAtMs: number;
  /** Optional — tags the message as a comment on the client's diary for this date. */
  contextDateIso?: string;
  photoId?: string;
  voiceId?: string;
  voicePeaks?: string;
  /** Program swaps (canvas SW1, Q8): "lasting-swap" from a client, "program-swap" from a coach. */
  kind?: "lasting-swap" | "program-swap" | "goal-suggestion" | "goal-answer" | "checkin-reply";
  cardJson?: string;
}

/** The same calls as `messagesApi`, made with another identity (a sandbox sample client's token). */
export function messagesApiFor(api: ApiFetcher) {
  return {
    async send(input: SendMessageInput): Promise<{ messageId: string; duplicate?: boolean }> {
      return api.fetch("/coach/messages", { method: "POST", body: JSON.stringify(input) });
    },

    async list(relationshipId: string, since = 0): Promise<RemoteMessage[]> {
      const { messages } = await api.fetch<{ messages: RemoteMessage[] }>(
        `/coach/messages?relationshipId=${relationshipId}&since=${since}`,
      );
      return messages;
    },

    /** Every message across all the caller's active threads, incremental — for the sync loop. */
    async listAll(since = 0): Promise<(RemoteMessage & { relationshipId: string })[]> {
      const { messages } = await api.fetch<{ messages: (RemoteMessage & { relationshipId: string })[] }>(
        `/coach/messages/all?since=${since}`,
      );
      return messages;
    },

    /** React to the other person's message, change it, or take it back with null. */
    async react(relationshipId: string, messageId: string, emoji: string | null): Promise<void> {
      await api.fetch("/coach/messages/reaction", { method: "PUT", body: JSON.stringify({ relationshipId, messageId, emoji }) });
    },

    async markRead(relationshipId: string, upToMs: number): Promise<void> {
      await api.fetch("/coach/messages/read", {
        method: "POST",
        body: JSON.stringify({ relationshipId, upToMs }),
      });
    },

    async unreadCounts(): Promise<{ relationshipId: string; unread: number }[]> {
      const { counts } = await api.fetch<{ counts: { relationshipId: string; unread: number }[] }>(
        "/coach/messages/unread",
      );
      return counts;
    },
  };
}

export const messagesApi = messagesApiFor(apiClient);
