<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Alert from "$lib/components/ui/alert";
  import { coachApi } from "@logit/core/api/coachApi";
  import { messagesApi, type RemoteMessage } from "@logit/core/api/messagesApi";

  type Thread = { relationshipId: string; name: string; unread: number };

  let loading = $state(true);
  let error = $state<string | null>(null);
  let threads = $state<Thread[]>([]);
  let activeId = $state<string | null>(null);
  let messages = $state<RemoteMessage[]>([]);
  let draft = $state("");
  let sending = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;

  const activeThread = $derived(threads.find((t) => t.relationshipId === activeId) ?? null);

  function fmt(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  }

  async function loadThreads() {
    try {
      const [coaches, clients, counts] = await Promise.all([
        coachApi.listCoaches().catch(() => []),
        coachApi.listClients().catch(() => []),
        messagesApi.unreadCounts().catch(() => []),
      ]);
      const unreadOf = (id: string) => counts.find((c) => c.relationshipId === id)?.unread ?? 0;
      threads = [
        ...coaches.map((c) => ({ relationshipId: c.relationshipId, name: c.coach.displayName || c.coach.username, unread: unreadOf(c.relationshipId) })),
        ...clients.map((c) => ({ relationshipId: c.relationshipId, name: c.client.displayName || c.client.username, unread: unreadOf(c.relationshipId) })),
      ];
      if (!activeId && threads.length) void open(threads[0].relationshipId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load conversations";
    } finally {
      loading = false;
    }
  }

  async function open(relationshipId: string) {
    activeId = relationshipId;
    await refreshThread();
  }

  async function refreshThread() {
    if (!activeId) return;
    try {
      messages = await messagesApi.list(activeId, 0);
      const last = messages.at(-1)?.createdAtMs ?? 0;
      if (last) {
        await messagesApi.markRead(activeId, last).catch(() => {});
        threads = threads.map((t) => (t.relationshipId === activeId ? { ...t, unread: 0 } : t));
      }
      await tick();
      listEl?.scrollTo({ top: listEl.scrollHeight });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load messages";
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    sending = true;
    draft = "";
    try {
      await messagesApi.send({
        relationshipId: activeId,
        messageId: crypto.randomUUID(),
        body,
        createdAtMs: Date.now(),
      });
      await refreshThread();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to send";
    } finally {
      sending = false;
    }
  }

  $effect(() => {
    void loadThreads();
    poll = setInterval(() => { void refreshThread(); }, 12_000);
  });
  onDestroy(() => clearInterval(poll));
</script>

<div class="flex flex-col gap-3">
  <h1 class="text-lg font-semibold">Messages</h1>
  {#if error}
    <Alert.Root variant="destructive">
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if loading}
    <Skeleton class="w-full" style="height: 70vh" />
  {:else if threads.length === 0}
    <p class="text-sm text-muted-foreground">No conversations yet.</p>
  {:else}
    <div class="grid grid-cols-[220px_1fr] gap-4 border border-border rounded-lg overflow-hidden" style="height: 70vh">
      <ul class="border-r border-border overflow-y-auto">
        {#each threads as t (t.relationshipId)}
          <li>
            <button type="button"
              class="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/40 {activeId === t.relationshipId ? 'bg-muted/60' : ''}"
              onclick={() => open(t.relationshipId)}>
              <span class="flex-1 truncate">{t.name}</span>
              {#if t.unread > 0}<Badge class="text-xs px-1.5 py-0">{t.unread}</Badge>{/if}
            </button>
          </li>
        {/each}
      </ul>

      <div class="flex flex-col min-w-0">
        {#if activeThread}
          <div class="px-3 py-2 border-b border-border text-sm font-medium shrink-0">{activeThread.name}</div>
          <div bind:this={listEl} class="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {#if messages.length === 0}
              <p class="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
            {:else}
              {#each messages as m (m.messageId)}
                <div class="flex {m.mine ? 'justify-end' : 'justify-start'}">
                  <div class="max-w-[75%] rounded-lg px-3 py-2 text-sm {m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}">
                    <p class="whitespace-pre-wrap break-words">{m.body}</p>
                    <p class="text-[10px] opacity-60 mt-0.5">{fmt(m.createdAtMs)}</p>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
          <form class="flex items-end gap-2 px-3 py-2 border-t border-border shrink-0"
            onsubmit={(e) => { e.preventDefault(); void send(); }}>
            <Textarea bind:value={draft} rows={1} placeholder="Message…"
              class="flex-1 resize-none max-h-32 min-h-0"
              onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            <Button type="submit" size="sm" disabled={sending || !draft.trim()}>Send</Button>
          </form>
        {/if}
      </div>
    </div>
  {/if}
</div>
