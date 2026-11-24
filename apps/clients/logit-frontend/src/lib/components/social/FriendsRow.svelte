<!-- The row of circles above the feed (design canvas S1), as on Instagram: your story first,
     then people with stories (a bright ring until you've watched them all), and people training
     now (the green dot). Tapping a story opens the viewer; someone only training opens
     TrainingNowSheet. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Plus } from "lucide-svelte";
  import { trainingApi, type TrainingFriend } from "@logit/core/api/trainingApi";
  import { popIn } from "$lib/transitions";
  import { profile } from "$lib/stores/profile.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { loadStories, stories, watch } from "$lib/features/friends/stories.svelte";
  import TrainingNowSheet from "./TrainingNowSheet.svelte";

  let open = $state<TrainingFriend | null>(null);

  async function load() {
    await Promise.all([
      loadStories(),
      trainingApi.friends().then((f) => (stories.training = f)).catch(() => {}),
    ]);
  }
  onMount(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(timer);
  });

  const mine = $derived(stories.row.find((a) => a.mine));
  const others = $derived(stories.row.filter((a) => !a.mine));
  const trainingOnly = $derived(stories.training.filter((t) => !others.some((a) => a.user.username === t.username)));
  const isTraining = (username: string) => stories.training.some((t) => t.username === username);
  const me = $derived($profile);
</script>

{#snippet circle(name: string, src: string | null | undefined, ring: "new" | "seen" | "none", training: boolean)}
  <span class="relative flex size-[68px] items-center justify-center rounded-full {ring === 'new' ? 'ring-2 ring-foreground' : ring === 'seen' ? 'ring-1 ring-border' : ''}">
    <span class="flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-lg font-semibold">
      {#if src}<img {src} alt="" class="size-full object-cover" />{:else}{name.charAt(0).toUpperCase()}{/if}
    </span>
    {#if training}<span class="absolute bottom-0.5 right-0.5 size-4 rounded-full border-[3px] border-background bg-success" aria-hidden="true"></span>{/if}
  </span>
{/snippet}

<section aria-label="Stories and training now" class="flex gap-3 overflow-x-auto border-b border-border px-3 pb-2.5 pt-1.5" data-no-tab-swipe>
  <div class="relative flex w-[72px] shrink-0 flex-col items-center gap-1.5">
    <button type="button" class="flex flex-col items-center gap-1.5" aria-label={mine ? "Your story" : "Add to your story"}
      onclick={() => (mine ? watch(mine.user.username) : (stories.picking = true))}>
      {@render circle(me?.name || authStore.user?.displayName || "You", me?.avatarDataUrl ?? authStore.user?.avatarUrl, mine ? "seen" : "none", false)}
      <span class="max-w-full truncate text-[11px] text-muted-foreground">Your story</span>
    </button>
    <button type="button" aria-label="Add to your story" onclick={() => (stories.picking = true)}
      class="absolute left-[46px] top-[44px] flex size-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-background">
      <Plus class="size-3.5" strokeWidth={3} />
    </button>
  </div>
  {#each others as a (a.user.username)}
    {@const unseen = a.stories.some((s) => !s.seen)}
    <button type="button" in:popIn class="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
      aria-label="{a.user.displayName}'s story{unseen ? ', new' : ''}{isTraining(a.user.username) ? ', training now' : ''}" onclick={() => watch(a.user.username)}>
      {@render circle(a.user.displayName, a.user.avatarUrl, unseen ? "new" : "seen", isTraining(a.user.username))}
      <span class="max-w-full truncate text-[11px] {unseen ? 'font-medium' : 'text-muted-foreground'}">{a.user.displayName}</span>
    </button>
  {/each}
  {#each trainingOnly as f (f.id)}
    <button type="button" in:popIn class="flex w-[72px] shrink-0 flex-col items-center gap-1.5" aria-label="{f.displayName}, training now" onclick={() => (open = f)}>
      {@render circle(f.displayName, f.avatarUrl, "none", true)}
      <span class="max-w-full truncate text-[11px] font-medium">{f.displayName}</span>
    </button>
  {/each}
</section>

{#if open}
  <TrainingNowSheet friend={open} onclose={() => (open = null)} />
{/if}
