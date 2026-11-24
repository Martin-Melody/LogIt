<script lang="ts">
  import { canCoach } from "$lib/workspace";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { apiClient } from "@logit/core/api/client";
  import { coachApi } from "@logit/core/api/coachApi";
  import { messagesApi } from "@logit/core/api/messagesApi";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import MessageThread from "$lib/features/coaching/MessageThread.svelte";
  import { when } from "$lib/features/coaching/format";

  // Coaching › Messages: one conversation per client. Your own coach's conversation is in
  // My coach, so the two don't mix.

  type Thread = {
    relationshipId: string;
    clientId: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    unread: number;
    last: { body: string; mine: boolean; at: number } | null;
  };

  let threads = $state<Thread[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let search = $state("");

  const activeId = $derived(page.url.searchParams.get("c") ?? threads[0]?.relationshipId ?? null);
  const active = $derived(threads.find((t) => t.relationshipId === activeId) ?? null);
  const draft = $derived(page.url.searchParams.get("draft") ?? "");
  const shown = $derived(
    threads.filter((t) => !search.trim() || `${t.name} ${t.username}`.toLowerCase().includes(search.trim().toLowerCase())),
  );

  async function load() {
    try {
      const [clients, counts, all] = await Promise.all([
        coachApi.listClients(),
        messagesApi.unreadCounts().catch(() => []),
        messagesApi.listAll(0).catch(() => []),
      ]);
      threads = clients
        .map((c) => {
          const last = all.filter((m) => m.relationshipId === c.relationshipId).sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
          return {
            relationshipId: c.relationshipId,
            clientId: c.client.id,
            name: c.client.displayName || c.client.username,
            username: c.client.username,
            avatarUrl: c.client.avatarUrl,
            unread: counts.find((x) => x.relationshipId === c.relationshipId)?.unread ?? 0,
            last: last ? { body: last.body || (last.photoUrl ? "Sent a photo" : ""), mine: last.mine, at: last.createdAtMs } : null,
          };
        })
        .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load conversations";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!canCoach()) void goto("/my-coach", { replaceState: true });
    else void load();
  });

  function open(id: string) {
    const u = new URL(page.url);
    u.searchParams.set("c", id);
    u.searchParams.delete("draft");
    void goto(u, { replaceState: true, noScroll: true, keepFocus: true });
  }

  function sentInOpen(body: string, at: number) {
    threads = threads
      .map((t) => (t.relationshipId === activeId ? { ...t, last: { body, mine: true, at } } : t))
      .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0));
  }

  function markOpenRead() {
    threads = threads.map((t) => (t.relationshipId === activeId ? { ...t, unread: 0 } : t));
  }
</script>

<div class="flex flex-col gap-4">
  <h1 class="text-[26px] font-bold tracking-tight">Messages</h1>

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-80 flex-[1_1_280px]" /><Skeleton class="h-[480px] flex-[999_1_560px]" /></div>
  {:else if threads.length === 0}
    <p class="text-[13px] text-muted-foreground">No clients yet, so no conversations. <a href="/clients" class="text-primary hover:underline">Invite someone</a>.</p>
  {:else}
    <div class="flex flex-wrap items-stretch gap-4">
      <section aria-label="Conversations" data-guide="messages-list" class="flex flex-[1_1_280px] flex-col gap-0.5 rounded-[10px] border border-border bg-card p-2">
        <label for="find-client" class="sr-only">Find a client</label>
        <input id="find-client" bind:value={search} placeholder="Find a client"
          class="mx-0.5 mb-1.5 mt-0.5 h-[34px] rounded-lg border border-input bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
        {#each shown as t (t.relationshipId)}
          <button type="button" onclick={() => open(t.relationshipId)} aria-current={t.relationshipId === activeId ? "true" : undefined}
            class="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left {t.relationshipId === activeId ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
            <Avatar name={t.name} url={t.avatarUrl} />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex justify-between gap-2"><span class="text-[13px] font-semibold">{t.name}</span>{#if t.last}<span class="text-[11px] text-muted-foreground">{when(t.last.at)}</span>{/if}</span>
              <span class="truncate text-xs text-muted-foreground">{t.last ? `${t.last.mine ? "You: " : ""}${t.last.body}` : "No messages yet"}</span>
            </span>
            {#if t.unread}<span class="size-2 shrink-0 rounded-full bg-primary" aria-label="{t.unread} unread"></span>{/if}
          </button>
        {/each}
      </section>

      {#if active}
        <section aria-label="Conversation with {active.name}" data-guide="messages-thread" class="flex min-w-0 flex-[999_1_560px] flex-col rounded-[10px] border border-border bg-card">
          <div class="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
            <span class="flex items-center gap-2.5"><Avatar name={active.name} url={active.avatarUrl} /><span class="text-sm font-semibold">{active.name}</span></span>
            <a href="/clients/{active.clientId}" class="text-xs text-muted-foreground hover:text-foreground">Open client ›</a>
          </div>
          <div class="flex flex-1 flex-col px-[18px] pb-4 pt-2">
            {#key active.relationshipId}
              <MessageThread relationshipId={active.relationshipId} otherName={active.name} initialDraft={draft} onRead={markOpenRead} onSent={sentInOpen} />
            {/key}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
