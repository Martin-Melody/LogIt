<!-- Who's going (design canvas E4), and who can't make it. Members only; people who haven't
     answered aren't listed. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Loader2 } from "lucide-svelte";
  import { eventsApi, type GroupEvent } from "@logit/core/api/eventsApi";
  import type { GroupPerson } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { eventShort } from "$lib/features/groups/eventTime";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  let ev = $state<GroupEvent | null>(null);
  let people = $state<{ going: GroupPerson[]; cantMakeIt: GroupPerson[] } | null>(null);
  let error = $state(false);
  const me = $derived(authStore.user?.username ?? "");

  onMount(async () => {
    try {
      [ev, people] = await Promise.all([eventsApi.get(id), eventsApi.people(id)]);
    } catch {
      error = true;
    }
  });
</script>

<PageHeader>
  <BackButton onclick={() => back(`/events/${id}`)} />
  <span class="flex min-w-0 flex-col">
    <h1 class="page-title truncate">{ev?.title ?? "Going"}</h1>
    {#if ev}<span class="text-[12px] text-muted-foreground">{eventShort(ev.startsAtMs)}</span>{/if}
  </span>
</PageHeader>

<div class="flex flex-col pb-24">
  {#if error}
    <p class="px-4 py-10 text-center text-sm text-muted-foreground">Couldn't load who's going.</p>
  {:else if !people}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else}
    {#each [{ title: "Going", list: people.going }, { title: "Can't make it", list: people.cantMakeIt }] as part (part.title)}
      {#if part.list.length || part.title === "Going"}
        <h2 class="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{part.title} · {part.list.length}</h2>
        {#if part.list.length === 0}<p class="px-4 py-3 text-sm text-muted-foreground">Nobody yet.</p>{/if}
        <ul>
          {#each part.list as p (p.id)}
            <li><a href={p.username === me ? "/profile" : `/social/${p.username}`} class="flex min-h-14 items-center gap-3 border-b border-border px-4 text-inherit no-underline">
              <PersonAvatar name={p.displayName} src={p.avatarUrl} size={40} /><span class="truncate text-[15px] font-medium">{p.username === me ? "You" : p.displayName || p.username}</span>
            </a></li>
          {/each}
        </ul>
      {/if}
    {/each}
  {/if}
</div>
