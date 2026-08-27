<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { page } from "$app/stores";
  import { ArrowLeft, Send } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import type { CoachMessage } from "@logit/core/domain/CoachMessage";
  import { getMessagesRepo } from "$lib/data/repoProvider";
  import { pullAndMergeMessages, markThreadRead } from "$lib/sync/syncService";
  import { sendMessage } from "$lib/usecases/messages/sendMessage";

  const props = $props<{ params: { relationshipId: string } }>();
  const relationshipId = $derived(props.params.relationshipId);
  const name = $derived($page.url.searchParams.get("name") ?? "Conversation");

  const ui = $state({ loading: true, sending: false, error: null as string | null });
  let messages = $state<CoachMessage[]>([]);
  let draft = $state("");
  let listEl = $state<HTMLDivElement | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;

  function fmt(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  }

  async function refresh(pull = true) {
    try {
      if (pull) await pullAndMergeMessages();
      messages = await getMessagesRepo().listThread(relationshipId);
      const last = messages.at(-1)?.createdAtMs ?? 0;
      if (last) await markThreadRead(relationshipId, last);
      await tick();
      listEl?.scrollTo({ top: listEl.scrollHeight });
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load messages";
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || ui.sending) return;
    ui.sending = true;
    draft = "";
    try {
      await sendMessage(relationshipId, body);
      await refresh(false);
    } finally {
      ui.sending = false;
    }
  }

  onMount(async () => {
    await refresh();
    ui.loading = false;
    poll = setInterval(() => void refresh(), 15_000);
  });
  onDestroy(() => clearInterval(poll));
</script>

<div class="flex flex-col h-[100dvh]">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/messages")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <p class="text-sm font-semibold truncate">{name}</p>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive shrink-0">{ui.error}</p>{/if}

  <div bind:this={listEl} class="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
    {#if ui.loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if messages.length === 0}
      <p class="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello 👋</p>
    {:else}
      {#each messages as m (m.id)}
        <div class="flex {m.mine ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[80%] rounded-lg px-3 py-2 text-sm {m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}">
            <p class="whitespace-pre-wrap break-words">{m.body}</p>
            <p class="text-[10px] opacity-60 mt-0.5">{fmt(m.createdAtMs)}{#if m.mine && !m.synced} · sending…{/if}</p>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <form class="flex items-end gap-2 px-3 py-2 border-t border-border shrink-0" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <textarea
      bind:value={draft}
      rows="1"
      placeholder="Message…"
      class="flex-1 resize-none rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
      onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
    ></textarea>
    <Button type="submit" size="icon" class="h-9 w-9 shrink-0" disabled={ui.sending || !draft.trim()}>
      <Send class="h-4 w-4" />
    </Button>
  </form>
</div>
