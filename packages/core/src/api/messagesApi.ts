import { apiClient } from "./client";

export interface RemoteMessage {
  messageId: string;
  body: string;
  createdAtMs: number;
  readAtMs: number | null;
  mine: boolean;
  contextDateIso?: string | null;
}

export interface SendMessageInput {
  relationshipId: string;
  messageId: string;
  body: string;
  createdAtMs: number;
  /** Optional — tags the message as a comment on the client's diary for this date. */
  contextDateIso?: string;
}

export const messagesApi = {
  async send(input: SendMessageInput): Promise<{ messageId: string; duplicate?: boolean }> {
    return apiClient.fetch("/coach/messages", { method: "POST", body: JSON.stringify(input) });
  },

  async list(relationshipId: string, since = 0): Promise<RemoteMessage[]> {
    const { messages } = await apiClient.fetch<{ messages: RemoteMessage[] }>(
      `/coach/messages?relationshipId=${relationshipId}&since=${since}`,
    );
    return messages;
  },

  /** Every message across all the caller's active threads, incremental — for the sync loop. */
  async listAll(since = 0): Promise<(RemoteMessage & { relationshipId: string })[]> {
    const { messages } = await apiClient.fetch<{ messages: (RemoteMessage & { relationshipId: string })[] }>(
      `/coach/messages/all?since=${since}`,
    );
    return messages;
  },

  async markRead(relationshipId: string, upToMs: number): Promise<void> {
    await apiClient.fetch("/coach/messages/read", {
      method: "POST",
      body: JSON.stringify({ relationshipId, upToMs }),
    });
  },

  async unreadCounts(): Promise<{ relationshipId: string; unread: number }[]> {
    const { counts } = await apiClient.fetch<{ counts: { relationshipId: string; unread: number }[] }>(
      "/coach/messages/unread",
    );
    return counts;
  },
};
