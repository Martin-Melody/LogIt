<!-- Groups, signed out: gyms, clubs and teams anyone can find, by name or place. -->
<script lang="ts">
  import SearchIcon from "@lucide/svelte/icons/search";
  import { SITE_URL } from "$lib/site";
  import GroupCard from "$lib/social/GroupCard.svelte";

  const { data } = $props();
</script>

<svelte:head>
  <title>Groups · LogIt</title>
  <meta name="description" content="Gyms, clubs and teams on LogIt: their sessions, meets and posts." />
  <link rel="canonical" href="{SITE_URL}/groups" />
</svelte:head>

<div class="border-b border-border px-4 py-4 sm:px-5">
  <h1 class="text-xl font-bold text-heading">Groups</h1>
  <p class="text-sm text-muted-foreground">Gyms, clubs and teams anyone can find</p>
</div>
<form method="GET" role="search" class="border-b border-border px-4 py-3 sm:px-5">
  <label class="flex h-11 items-center gap-2.5 rounded-full bg-muted px-4 focus-within:ring-2 focus-within:ring-ring">
    <SearchIcon class="size-[18px] text-muted-foreground" />
    <input name="q" value={data.q} placeholder="Name or place, like Sligo" aria-label="Search groups" autocomplete="off" class="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
  </label>
</form>
{#if data.groups.length === 0}
  <p class="px-6 py-16 text-center text-sm text-muted-foreground">{data.q ? `No groups found for "${data.q}".` : "No groups yet."}</p>
{:else}
  <div class="flex flex-col py-1">{#each data.groups as g (g.id)}<GroupCard group={g} api={data.api} />{/each}</div>
{/if}
