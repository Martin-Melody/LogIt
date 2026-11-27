import { getMessagesRepo } from "$lib/data/repoProvider";
import { pushMessage } from "$lib/sync/syncService";
import { createOutgoingMessage, type CoachMessage, type MessagePhoto, type MessageVoice } from "@logit/core/domain/CoachMessage";

/** Optimistically store an outgoing message locally, then push it (queued if offline). A photo
 * is uploaded before this, so only its address waits in the queue. */
export async function sendMessage(
  relationshipId: string, body: string, photo?: MessagePhoto, voice?: MessageVoice,
  /** A card with the message: a client's lasting swap (SW1) or goal answer (GL1); a coach's
   * program swap (W6) or reply to a check-in (K4). */
  card?: { kind: "lasting-swap" | "goal-answer" | "program-swap" | "checkin-reply"; json: string },
): Promise<CoachMessage | null> {
  const msg = { ...createOutgoingMessage(relationshipId, body, undefined, photo, voice), ...(card ? { kind: card.kind, cardJson: card.json } : {}) };
  if (!msg.body && !msg.photo && !msg.voice) return null;
  await getMessagesRepo().addOutgoing(msg);
  pushMessage(msg);
  return msg;
}
