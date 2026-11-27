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
  /** A photo sent with it (form checks, progress): /photos/… and its size. */
  photo?: MessagePhoto;
  /** A voice message (up to a minute). */
  voice?: MessageVoice;
  /** The other person's reaction to it (only the person it was sent to reacts). */
  reaction?: string | null;
  /** A step in a request (an offer, the waiting list…), drawn as a line; `body` says it in words too. */
  kind?: string | null;
  /** What that step's card shows (JSON), e.g. a program swap's exercises. */
  cardJson?: string | null;
};

export type MessageVoice = { id?: string; url: string; ms: number; peaks: string };

export type MessagePhoto = { id?: string; url: string; width: number; height: number };

export function createOutgoingMessage(
  relationshipId: string,
  body: string,
  contextDateIso?: string,
  photo?: MessagePhoto,
  voice?: MessageVoice,
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
    ...(photo ? { photo } : {}),
    ...(voice ? { voice } : {}),
  };
}
