import { createId } from "./ids";
import { nowMs } from "./time";

/** One message in a coach↔client thread. `mine` is resolved per-viewer by the server. */
export type CoachMessage = {
  id: string;
  relationshipId: string;
  body: string;
  createdAtMs: number;
  readAtMs?: number | null;
  /** True when the current user sent it. */
  mine: boolean;
  /** False until the server has acknowledged the send (optimistic local messages). */
  synced?: boolean;
};

export function createOutgoingMessage(relationshipId: string, body: string): CoachMessage {
  return {
    id: createId("msg"),
    relationshipId,
    body: body.trim(),
    createdAtMs: nowMs(),
    readAtMs: null,
    mine: true,
    synced: false,
  };
}
