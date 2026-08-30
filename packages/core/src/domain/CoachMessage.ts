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
  /** When set, this message is a comment on the client's diary for that date (YYYY-MM-DD).
   * The client surfaces it inline on /nutrition for that day; it still lives in the thread. */
  contextDateIso?: string;
};

export function createOutgoingMessage(
  relationshipId: string,
  body: string,
  contextDateIso?: string,
): CoachMessage {
  return {
    id: createId("msg"),
    relationshipId,
    body: body.trim(),
    createdAtMs: nowMs(),
    readAtMs: null,
    mine: true,
    synced: false,
    contextDateIso,
  };
}
