<!-- Settings › Privacy › Story › Close friends / Hide story from (design canvas S4), as on
     Instagram: tick people from your followers. Nobody is told they were added or removed. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Check, Loader2, Search } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import SettingsPage from "$lib/features/settings/SettingsPage.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import { Input } from "$lib/components/ui/input";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi } from "@logit/core/api/socialApi";
  import { storiesApi, type StoryList } from "@logit/core/api/storiesApi";
  import type { DmPerson } from "@logit/core/api/dmApi";

  const list = $derived((page.params.list === "hidden" ? "hidden" : "close-friends") as StoryList);
  const copy = $derived(list === "hidden"
    ? { title: "Hide story from", note: "They won't see your stories or your story ring. They aren't told." }
    : { title: "Close friends", note: "Only the people you tick see the stories you add for Close friends. Nobody is told when you add or remove them." });

  let people = $state<DmPerson[] | null>(null);
  let on = $state(new Set<string>());
  let query = $state("");
  let error = $state(false);

  async function load() {
    try {
      const me = authStore.user?.username;
      const [lists, followers] = await Promise.all([storiesApi.lists(), me ? socialApi.getFollowers(me) : Promise.resolve([])]);
      const chosen = list === "hidden" ? lists.hidden : lists.closeFriends;
      on = new Set(chosen.map((p) => p.username));
      // Ticked people first (even if they've stopped following), then followers by name.
      const rest = followers
        .filter((f) => !on.has(f.username))
        .map((f) => ({ username: f.username, displayName: f.displayName, avatarUrl: f.avatarUrl ?? null }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      people = [...chosen, ...rest];
      error = false;
    } catch {
      error = true;
    }
  }
  onMount(load);

  async function toggle(p: DmPerson) {
    const adding = !on.has(p.username);
    const next = new Set(on);
    if (adding) next.add(p.username);
    else next.delete(p.username);
    on = next;
    try {
      await (adding ? storiesApi.add(list, p.username) : storiesApi.drop(list, p.username));
    } catch {
      const back = new Set(on);
      if (adding) back.delete(p.username);
      else back.add(p.username);
      on = back;
      toast.error("Couldn't save that. Try again.");
    }
  }

  const shown = $derived(
    (people ?? []).filter((p) => !query.trim() || `${p.displayName} ${p.username}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
</script>

<SettingsPage title={copy.title}>
  <p class="px-1 text-[13px] leading-snug text-muted-foreground">{copy.note}</p>
  {#if error}
    <p class="px-1 text-sm text-muted-foreground">Couldn't load your followers. <button type="button" class="font-medium text-foreground underline underline-offset-4" onclick={load}>Try again</button></p>
  {:else if people === null}
    <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
  {:else if people.length === 0}
    <p class="px-1 py-8 text-center text-sm text-muted-foreground">Once people follow you, you can pick them here.</p>
  {:else}
    <div class="relative">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input bind:value={query} placeholder="Search your followers" aria-label="Search your followers" class="h-11 pl-9" />
    </div>
    <p class="px-1 text-[13px] text-muted-foreground">{on.size} {on.size === 1 ? "person" : "people"}</p>
    <div class="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {#each shown as p (p.username)}
        {@const ticked = on.has(p.username)}
        <button type="button" aria-pressed={ticked} onclick={() => toggle(p)} class="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0">
          <PersonAvatar name={p.displayName} src={p.avatarUrl} size={40} />
          <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[15px] font-medium">{p.displayName}</span><span class="truncate text-[13px] text-muted-foreground">@{p.username}</span></span>
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors {ticked ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/50'}">
            {#if ticked}<Check class="size-3.5" strokeWidth={3} />{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</SettingsPage>
