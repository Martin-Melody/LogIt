// How many conversations have something unread, for the Messages button in the top bar: chats
// with people (message requests never count, as on Instagram) plus coach threads.
import { dmApi } from "@logit/core/api/dmApi";
import { authStore } from "$lib/api/authStore.svelte";
import { getMessagesRepo } from "$lib/data/repoProvider";

export const messagesUnread = $state({ count: 0 });

export async function refreshMessagesUnread(): Promise<void> {
  if (!authStore.isAuthenticated) {
    messagesUnread.count = 0;
    return;
  }
  const [chats, coach] = await Promise.all([
    dmApi.unread().then((u) => u.chats).catch(() => null),
    getMessagesRepo().unreadCount().catch(() => 0),
  ]);
  if (chats !== null) messagesUnread.count = chats + (coach > 0 ? 1 : 0);
}
