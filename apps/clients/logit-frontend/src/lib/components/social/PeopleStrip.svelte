<script lang="ts">
  import { goto } from "$app/navigation";
  import { X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { discoverApi, socialApi, type FollowStatus, type SuggestedPerson } from "@logit/core/api/socialApi";

  // "People you might know": a row of cards. X on a card is "not interested"; Hide closes the
  // whole row for this account (Social settings brings it back).
  let people = $state<SuggestedPerson[] | null>(null);
  let hidden = $state(false);
  let status = $state<Record<string, FollowStatus>>({});

  $effect(() => {
    void discoverApi.people(10).then((r) => { people = r.people; hidden = r.hidden; }).catch(() => { people = []; });
  });

  async function follow(p: SuggestedPerson) {
    const id = p.user.id;
    const before = status[id] ?? p.user.followStatus ?? "none";
    try {
      if (before === "none") status[id] = await socialApi.follow(p.user.username);
      else {
        await socialApi.unfollow(p.user.username);
        status[id] = "none";
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) status[id] = "following";
      else toast.error("Couldn't do that");
    }
  }

  async function dismiss(p: SuggestedPerson) {
    const before = people;
    people = (people ?? []).filter((x) => x.user.id !== p.user.id);
    try {
      await discoverApi.notInterested(p.user.username);
    } catch {
      people = before;
      toast.error("Couldn't do that");
    }
  }

  async function hideAll() {
    try {
      await socialApi.updateSettings({ hidePeopleSuggestions: true });
      hidden = true;
      toast.success("Hidden. Turn it back on in Social settings.");
    } catch {
      toast.error("Couldn't hide it");
    }
  }

  function label(p: SuggestedPerson) {
    const s = status[p.user.id] ?? p.user.followStatus ?? "none";
    return s === "following" ? "Following" : s === "requested" ? "Requested" : p.user.isPrivate ? "Request" : p.user.followsYou ? "Follow back" : "Follow";
  }
</script>

{#if !hidden && people && people.length > 0}
  <section class="flex flex-col gap-2.5 px-4 pt-2 pb-3" aria-label="People you might know">
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">People you might know</span>
      <button type="button" class="-mr-1 flex h-9 items-center gap-1.5 px-2 text-[13px] text-muted-foreground" onclick={hideAll} aria-label="Hide People you might know">
        Hide <X class="h-3.5 w-3.5" />
      </button>
    </div>
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {#each people as p (p.user.id)}
        {@const s = status[p.user.id] ?? "none"}
        <div class="relative flex w-[118px] shrink-0 flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-3 text-center">
          <button type="button" class="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
            aria-label="Not interested in {p.user.displayName}" onclick={() => dismiss(p)}>
            <X class="h-3.5 w-3.5" />
          </button>
          <button type="button" class="flex flex-col items-center gap-1" onclick={() => goto(`/social/${p.user.username}`)}>
            <span class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
              {#if p.user.avatarUrl}<img src={p.user.avatarUrl} alt="" class="h-full w-full object-cover" />{:else}{p.user.displayName.charAt(0).toUpperCase()}{/if}
            </span>
            <span class="w-full truncate text-[13px] font-semibold">{p.user.displayName}</span>
          </button>
          <span class="line-clamp-2 min-h-[2lh] text-[11px] leading-tight text-muted-foreground">{p.reason}</span>
          <button type="button" class="mt-0.5 h-8 w-full rounded-md text-xs font-semibold {s === 'none' ? 'bg-primary text-primary-foreground' : 'border border-border'}"
            onclick={() => follow(p)}>{label(p)}</button>
        </div>
      {/each}
    </div>
  </section>
{/if}
