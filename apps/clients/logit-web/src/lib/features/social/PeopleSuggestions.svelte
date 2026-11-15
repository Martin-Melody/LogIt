<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { toast } from "$lib/components/ui/sonner";
  import { discoverApi, socialApi, type FollowStatus, type SuggestedPerson } from "@logit/core/api/socialApi";
  import Avatar from "./Avatar.svelte";
  import FollowButton from "./FollowButton.svelte";

  // "People you might know": cards (Discover) or a short list (side column). ✕ on a person
  // is "not interested"; Hide closes the whole thing for this account (Social settings
  // brings it back).
  let { variant = "list", title = "People to follow", limit = 4, onhidden }: {
    variant?: "list" | "grid";
    title?: string;
    limit?: number;
    onhidden?: () => void;
  } = $props();

  let people = $state<SuggestedPerson[] | null>(null);
  let hidden = $state(false);
  const status = $state<Record<string, FollowStatus>>({});

  $effect(() => {
    void discoverApi.people(limit).then((r) => { people = r.people; hidden = r.hidden; }).catch(() => { people = []; });
  });

  async function dismiss(username: string) {
    const before = people;
    people = (people ?? []).filter((p) => p.user.username !== username);
    try {
      await discoverApi.notInterested(username);
    } catch {
      people = before;
      toast.error("Couldn't do that");
    }
  }

  async function hideAll() {
    try {
      await socialApi.updateSettings({ hidePeopleSuggestions: true });
      hidden = true;
      onhidden?.();
      toast.success("Hidden. Turn it back on under Privacy on the Discover tab.");
    } catch {
      toast.error("Couldn't hide it");
    }
  }
</script>

{#if !hidden && people && people.length > 0}
  <section class="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-[18px] py-4" aria-label={title}>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">{title}</h2>
      <button type="button" onclick={hideAll} aria-label="Hide {title}"
        class="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"><XIcon class="size-3" />Hide</button>
    </div>
    {#if variant === "grid"}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
        {#each people as person (person.user.id)}
          <div class="relative flex flex-col items-center gap-1.5 rounded-[10px] bg-muted/60 px-3 py-3.5 text-center">
            <button type="button" onclick={() => dismiss(person.user.username)} aria-label="Not interested in {person.user.displayName}"
              class="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><XIcon class="size-3" /></button>
            <a href="/social/{person.user.username}" class="flex flex-col items-center gap-1.5">
              <Avatar name={person.user.displayName} url={person.user.avatarUrl} size={44} />
              <span class="text-[13px] font-semibold">{person.user.displayName}</span>
            </a>
            <span class="text-[11px] text-muted-foreground">{person.reason}</span>
            <FollowButton username={person.user.username} bind:status={status[person.user.id]} isPrivate={!!person.user.isPrivate} primary class="w-full" />
          </div>
        {/each}
      </div>
    {:else}
      {#each people as person (person.user.id)}
        <div class="flex items-center gap-2.5">
          <a href="/social/{person.user.username}"><Avatar name={person.user.displayName} url={person.user.avatarUrl} /></a>
          <a href="/social/{person.user.username}" class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium">{person.user.displayName}</span>
            <span class="block truncate text-xs text-muted-foreground">{person.reason}</span>
          </a>
          <FollowButton username={person.user.username} bind:status={status[person.user.id]} isPrivate={!!person.user.isPrivate} />
          <button type="button" onclick={() => dismiss(person.user.username)} aria-label="Not interested in {person.user.displayName}"
            class="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><XIcon class="size-3" /></button>
        </div>
      {/each}
    {/if}
  </section>
{/if}
