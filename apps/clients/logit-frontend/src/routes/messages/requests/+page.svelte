<!-- Message requests (design canvas M3): from people you don't follow. They can't tell you've
     read it until you accept. Delete hides it (a new message brings it back); Block is on their
     profile, as on posts. -->
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
    <h1 class="page-title">Message requests</h1>
  </PageHeader>
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
</div>
