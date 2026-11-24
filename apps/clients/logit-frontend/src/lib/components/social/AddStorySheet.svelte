<!-- "Add to your story" (design canvas S3): after a workout with a record, or from the "Your
     story" circle. A story is made from a record or the whole workout (photos come with photo
     storage), to everyone who can see your stories or to Close friends only. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Star } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { storiesApi } from "@logit/core/api/storiesApi";
  import { readCard } from "@logit/core/domain/messageCard";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import StoryCard from "./StoryCard.svelte";
  import { loadStories } from "$lib/features/friends/stories.svelte";

  const { cards, fromWorkout = false, onclose }: {
    cards: { label: string; type: string; json: string }[];
    fromWorkout?: boolean;
    onclose: () => void;
  } = $props();

  let picked = $state(0);
  let posting = $state(false);
  let closeFriends = $state<number | null>(null);
  const card = $derived(cards[picked] ? readCard(cards[picked].type, cards[picked].json) : null);

  onMount(async () => {
    try {
      closeFriends = (await storiesApi.lists()).closeFriends.length;
    } catch {
      closeFriends = null;
    }
  });

  async function post(toCloseFriends: boolean) {
    if (toCloseFriends && closeFriends === 0) {
      onclose();
      toast("Choose your Close friends first, then add it again.");
      void goto("/settings/privacy/story/close-friends");
      return;
    }
    posting = true;
    try {
      await storiesApi.post(cards[picked], toCloseFriends);
      toast.success(toCloseFriends ? "Added to your story for Close friends" : "Added to your story");
      void loadStories();
      onclose();
    } catch {
      toast.error("Couldn't add it. Check your connection and try again.");
    } finally {
      posting = false;
    }
  }
</script>

<BottomSheet label="Add to your story" {onclose}>
  <div class="flex flex-col gap-4 px-4 pb-2">
    <div class="flex flex-col gap-1">
      <h2 class="text-[19px] font-semibold">Add to your story?</h2>
      <p class="text-sm text-muted-foreground">{fromWorkout ? "Made from this workout. " : ""}It's gone after 24 hours.</p>
    </div>
    <div class="dark mx-auto flex aspect-[9/14] w-[56%] max-w-56 items-center rounded-2xl bg-black px-2.5 text-foreground">
      {#if card}<StoryCard {card} compact />{/if}
    </div>
    {#if cards.length > 1}
      <div class="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="What to add">
        {#each cards as c, i (i)}
          <button type="button" role="radio" aria-checked={picked === i} class={chip(picked === i)} onclick={() => (picked = i)}>{c.label}</button>
        {/each}
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-2">
      <button type="button" disabled={posting} onclick={() => post(false)} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">Your story</button>
      <button type="button" disabled={posting} onclick={() => post(true)} class="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-60"><Star class="size-4" />Close friends</button>
    </div>
    <button type="button" class="h-11 text-sm font-medium text-muted-foreground" onclick={onclose}>Not this time</button>
  </div>
</BottomSheet>
