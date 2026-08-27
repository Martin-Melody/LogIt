import { getMessagesRepo } from "$lib/data/repoProvider";
import { pushMessage } from "$lib/sync/syncService";
import { createOutgoingMessage, type CoachMessage } from "@logit/core/domain/CoachMessage";

/** Optimistically store an outgoing message locally, then push it (queued if offline). */
export async function sendMessage(relationshipId: string, body: string): Promise<CoachMessage | null> {
  const msg = createOutgoingMessage(relationshipId, body);
  if (!msg.body) return null;
  await getMessagesRepo().addOutgoing(msg);
  pushMessage(msg);
  return msg;
}
