<!-- Requests (design canvas M3, R4). Received: messages from people you don't follow; they can't
     tell you've read it until you accept. Delete hides it (a new message brings it back); Block is
     on their profile, as on posts. Sent: coaches you asked (each opens its conversation) and
     groups you asked to join (Cancel here: they have no conversation). -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { back } from "$lib/navigation";
  import { dmApi, type DmThread } from "@logit/core/api/dmApi";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { page } from "$app/state";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import { coachApi, type MyCoachingRequest } from "@logit/core/api/coachApi";
  import { groupsApi } from "@logit/core/api/groupsApi";
  import { sentLine } from "@logit/core/domain/coachRequest";

  let tab = $state<"received" | "sent">(page.url.searchParams.get("tab") === "sent" ? "sent" : "received");
  let coaches = $state<MyCoachingRequest[] | null>(null);
  let groups = $state<Awaited<ReturnType<typeof groupsApi.myRequests>> | null>(null);
  let sentError = $state(false);

  async function loadSent() {
    try {
      // An older server has no list of group requests: show the coaches anyway.
      [coaches, groups] = await Promise.all([coachApi.listMyRequests(), groupsApi.myRequests().catch(() => [])]);
      sentError = false;
    } catch {
      sentError = true;
    }
  }
  onMount(loadSent);

  async function cancelGroup(groupId: string) {
    const before = groups;
    groups = (groups ?? []).filter((g) => g.groupId !== groupId);
    try {
      await groupsApi.cancelRequest(groupId);
    } catch {
      groups = before;
      toast.error("Couldn't cancel. Try again.");
    }
  }
  const sentCount = $derived((coaches?.length ?? 0) + (groups?.length ?? 0));

  let threads = $state<DmThread[] | null>(null);
  let error = $state(false);
  const now = Date.now();

  async function load() {
    try {
      threads = await dmApi.threads("requests");
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  async function act(t: DmThread, accept: boolean) {
    const before = threads;
    threads = (threads ?? []).filter((x) => x.id !== t.id);
    try {
      if (accept) {
        await dmApi.accept(t.id);
        await goto(`/messages/chat?t=${t.id}`);
      } else {
        await dmApi.remove(t.id);
      }
    } catch {
      threads = before;
      toast.error("Couldn't do that. Try again.");
    }
  }
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/messages")} />
    <h1 class="page-title">Requests</h1>
  </PageHeader>
  <div class="px-3 pb-1">
    <Tabs.Root value={tab} onValueChange={(v) => (tab = v as typeof tab)}>
      <Tabs.List aria-label="Requests">
        <Tabs.Trigger value="received">Received{#if threads?.length} <span class="opacity-60">{threads.length}</span>{/if}</Tabs.Trigger>
        <Tabs.Trigger value="sent">Sent{#if sentCount} <span class="opacity-60">{sentCount}</span>{/if}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  {#if tab === "sent"}
    {#if sentError}
      <p class="px-4 py-6 text-sm text-muted-foreground">Couldn't load what you sent. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={loadSent}>Try again</button></p>
    {:else if coaches === null || groups === null}
      <div class="flex items-center gap-3 px-4 py-3"><Skeleton class="size-12 rounded-full" /><Skeleton class="h-4 w-40 rounded" /></div>
    {:else if sentCount === 0}
      <p class="px-4 py-14 text-center text-sm text-muted-foreground">Nothing waiting for an answer.</p>
    {:else}
      {#if coaches.length}
        <p class="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Coaches</p>
        <ul>
          {#each coaches as r (r.relationshipId)}
            {@const name = r.coach.displayName || r.coach.username}
            <li class="border-b border-border">
              <a href="/messages/request/{r.relationshipId}?name={encodeURIComponent(name)}" class="flex min-h-16 items-center gap-3 px-4 py-2.5 text-inherit no-underline">
                <PersonAvatar name={name} src={r.coach.avatarUrl} size={44} />
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="text-[15px] font-semibold">{name}</span>
                  <span class="truncate text-sm text-muted-foreground">{sentLine(r, now)}</span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
      {#if groups.length}
        <p class="px-4 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Groups</p>
        <ul>
          {#each groups as g (g.groupId)}
            <li animate:flip={{ duration: 200 }} out:fade={{ duration: 150 }} class="flex min-h-16 items-center gap-3 border-b border-border px-4 py-2.5">
              <a href="/groups/{g.groupId}" class="flex min-w-0 flex-1 items-center gap-3 text-inherit no-underline">
                <GroupAvatar name={g.name} src={g.photoUrl} size={44} />
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate text-[15px] font-semibold">{g.name}</span>
                  <span class="truncate text-sm text-muted-foreground">Asked to join {shortAgo(Date.parse(g.askedAt), now)} · waiting for an organiser</span>
                </span>
              </a>
              <button type="button" class="h-10 shrink-0 rounded-lg border border-border px-3.5 text-sm font-medium" onclick={() => void cancelGroup(g.groupId)}>Cancel</button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {:else}
  <p class="px-4 pb-2 pt-1 text-[13px] leading-snug text-muted-foreground">From people you don't follow. They won't know you've seen a message until you accept.</p>

  {#if error}
    <p class="px-4 py-6 text-sm text-muted-foreground">Couldn't load requests. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if threads === null}
    <div class="flex items-center gap-3 px-4 py-3"><Skeleton class="size-12 rounded-full" /><Skeleton class="h-4 w-40 rounded" /></div>
  {:else if threads.length === 0}
    <p class="px-4 py-14 text-center text-sm text-muted-foreground">No message requests.</p>
  {:else}
    <ul>
      {#each threads as t (t.id)}
        <li animate:flip={{ duration: 200 }} out:fade={{ duration: 150 }} class="flex flex-col gap-2.5 border-b border-border px-4 py-3">
          <a href="/messages/chat?t={t.id}" class="flex items-start gap-3 text-inherit no-underline">
            <PersonAvatar name={t.other?.displayName ?? null} src={t.other?.avatarUrl} size={44} />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-[15px] font-semibold">{t.other?.displayName ?? "Deleted account"} <span class="font-normal text-muted-foreground">{t.other ? `@${t.other.username} · ` : ""}{shortAgo(t.lastAtMs, now)}</span></span>
              <span class="line-clamp-2 text-sm text-muted-foreground">{t.lastBody}</span>
            </span>
          </a>
          <div class="grid grid-cols-2 gap-2 pl-14">
            <button type="button" class="h-10 rounded-lg border border-border text-sm font-medium" onclick={() => act(t, false)}>Delete</button>
            <button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onclick={() => act(t, true)}>Accept</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  {/if}
</div>
