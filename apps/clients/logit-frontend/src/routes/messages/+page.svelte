<!-- Messages (design canvas M1): chats with people and coach threads in one list, newest first,
     Instagram's inbox. Message requests are a row at the top with their count; they never badge
     Social. Bold = unread; a green dot = training now. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ChevronRight, MessageSquare } from "lucide-svelte";
  import { replayTour } from "$lib/tour/index";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { back } from "$lib/navigation";
  import { coachApi } from "@logit/core/api/coachApi";
  import { dmApi } from "@logit/core/api/dmApi";
  import { trainingApi } from "@logit/core/api/trainingApi";
  import { getMessagesRepo } from "$lib/data/repoProvider";
  import { pullAndMergeMessages } from "$lib/sync/syncService";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { outbox } from "$lib/features/friends/dmOutbox.svelte";

  type Row = {
    key: string;
    href: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    preview: string;
    atMs: number;
    unread: boolean;
    coach: boolean;
  };

  let rows = $state<Row[] | null>(null);
  let requests = $state(0);
  let training = $state<Set<string>>(new Set());
  let error = $state(false);
  let now = $state(Date.now());

  async function coachRows(): Promise<Row[]> {
    await pullAndMergeMessages().catch(() => {});
    const [coaches, clients] = await Promise.all([coachApi.listCoaches().catch(() => []), coachApi.listClients().catch(() => [])]);
    const repo = getMessagesRepo();
    const threads = [
      ...coaches.filter((c) => c.status !== "paused").map((c) => ({ id: c.relationshipId, person: c.coach })),
      ...clients.map((c) => ({ id: c.relationshipId, person: c.client })),
    ];
    return Promise.all(
      threads.map(async ({ id, person }) => {
        const last = (await repo.listThread(id)).at(-1);
        const name = person.displayName || person.username;
        return {
          key: `coach:${id}`,
          href: `/messages/${id}?name=${encodeURIComponent(name)}`,
          name,
          username: person.username,
          avatarUrl: person.avatarUrl ?? null,
          preview: last ? `${last.mine ? "You: " : ""}${last.body}` : "No messages yet",
          atMs: last?.createdAtMs ?? 0,
          unread: (await repo.unreadCount(id)) > 0,
          coach: true,
        };
      }),
    );
  }

  async function load() {
    try {
      const [chats, unread, coach, friends] = await Promise.all([
        dmApi.threads("chats"),
        dmApi.unread(),
        coachRows(),
        trainingApi.friends().catch(() => []),
      ]);
      requests = unread.requests;
      training = new Set(friends.map((f) => f.username));
      now = Date.now();
      rows = [
        ...chats.map((t) => ({
          key: t.id,
          href: `/messages/chat?t=${t.id}`,
          name: t.other ? t.other.displayName || t.other.username : "Deleted account",
          username: t.other?.username ?? null,
          avatarUrl: t.other?.avatarUrl ?? null,
          preview: `${t.lastMine ? "You: " : ""}${t.lastBody}`,
          atMs: t.lastAtMs,
          unread: t.unread,
          coach: false,
        })),
        ...coach,
      ].sort((a, b) => b.atMs - a.atMs);
      error = false;
    } catch {
      error = true;
      rows ??= [];
    }
  }

  onMount(() => {
    void load();
    const poll = setInterval(() => void load(), 30_000);
    setTimeout(() => replayTour("phone.messages"), 600);
    return () => clearInterval(poll);
  });

  const waiting = $derived(outbox.items.filter((p) => !p.error).length);
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/social")} />
    <h1 class="page-title">Messages</h1>
  </PageHeader>

  {#if requests > 0}
    <a href="/messages/requests" class="flex min-h-13 items-center justify-between gap-3 border-b border-border px-4 text-[15px] font-medium text-inherit no-underline hover:bg-muted/40">
      Message requests
      <span class="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">{requests}<ChevronRight class="size-4" /></span>
    </a>
  {/if}
  {#if waiting > 0}
    <p class="px-4 py-2 text-[13px] text-muted-foreground">{waiting === 1 ? "1 message is" : `${waiting} messages are`} waiting to send. They go when you're back online.</p>
  {/if}

  {#if error && rows?.length === 0}
    <p class="px-4 py-6 text-sm text-muted-foreground">Couldn't load your messages. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if rows === null}
    <div class="flex flex-col">
      {#each [0, 1, 2] as i (i)}<div class="flex items-center gap-3 px-4 py-3"><span class="size-12 animate-pulse rounded-full bg-muted"></span><span class="h-4 w-40 animate-pulse rounded bg-muted"></span></div>{/each}
    </div>
  {:else if rows.length === 0}
    <div class="flex flex-col items-center gap-2 px-6 py-14 text-center text-muted-foreground">
      <MessageSquare class="size-6" />
      <p class="text-sm">No messages yet. Open someone's profile and tap Message.</p>
    </div>
  {:else}
    <ul data-guide="phone-messages-list">
      {#each rows as r (r.key)}
        <li>
          <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40" onclick={() => void goto(r.href)}>
            <PersonAvatar name={r.name} src={r.avatarUrl} size={52} training={!!r.username && training.has(r.username)} />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex items-center gap-2 text-[15px] {r.unread ? 'font-semibold' : 'font-medium'}">
                <span class="truncate">{r.name}</span>
                {#if r.coach}<span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coach</span>{/if}
              </span>
              <span class="flex min-w-0 gap-1 text-sm {r.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}">
                <span class="truncate">{r.preview}</span>{#if r.atMs}<span class="shrink-0 font-normal text-muted-foreground">· {shortAgo(r.atMs, now)}</span>{/if}
              </span>
            </span>
            {#if r.unread}<span class="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread"></span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
