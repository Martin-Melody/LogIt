import type { CoachMessage } from "@logit/core/domain/CoachMessage";

/** Local store of coach↔client messages (mirror of the server thread + optimistic sends). */
export interface MessagesRepo {
  listThread(relationshipId: string): Promise<CoachMessage[]>;
  /** Insert an optimistic outgoing message (mine, unsynced). */
  addOutgoing(message: CoachMessage): Promise<void>;
  markSynced(id: string): Promise<void>;
  /** Upsert a message pulled from the server (keyed by its stable id). */
  upsertFromRemote(message: CoachMessage): Promise<void>;
  /** Unsynced outgoing messages, oldest first — for a full re-push. */
  pendingOutgoing(): Promise<CoachMessage[]>;
  /** Locally mark the other party's messages in a thread as read up to a timestamp. */
  markThreadRead(relationshipId: string, upToMs: number): Promise<void>;
  unreadCount(relationshipId?: string): Promise<number>;
}
