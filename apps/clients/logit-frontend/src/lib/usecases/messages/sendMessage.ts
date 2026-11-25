import { getMessagesRepo } from "$lib/data/repoProvider";
import { pushMessage } from "$lib/sync/syncService";
import { createOutgoingMessage, type CoachMessage, type MessagePhoto, type MessageVoice } from "@logit/core/domain/CoachMessage";

/** Optimistically store an outgoing message locally, then push it (queued if offline). A photo
 * is uploaded before this, so only its address waits in the queue. */
export async function sendMessage(relationshipId: string, body: string, photo?: MessagePhoto, voice?: MessageVoice): Promise<CoachMessage | null> {
  const msg = createOutgoingMessage(relationshipId, body, undefined, photo, voice);
  if (!msg.body && !msg.photo && !msg.voice) return null;
  await getMessagesRepo().addOutgoing(msg);
  pushMessage(msg);
  return msg;
}
