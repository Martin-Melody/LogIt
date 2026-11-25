<!-- "Add to your story" (design canvas S3, S5): after a workout with a record, or from the "Your
     story" circle. A story is a record, the whole workout, or a photo (with the record on top, or
     not), to everyone who can see your stories or to Close friends only. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Camera, Star } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { uploadPhoto } from "@logit/core/api/photosApi";
  import { storiesApi } from "@logit/core/api/storiesApi";
  import { readCard } from "@logit/core/domain/messageCard";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import StoryCard from "./StoryCard.svelte";
  import StoryPhoto from "./StoryPhoto.svelte";
  import { loadStories, pickStoryPhoto } from "$lib/features/friends/stories.svelte";

  const { cards, fromWorkout = false, photo: chosen, onclose }: {
    cards: { label: string; type: string; json: string }[];
    fromWorkout?: boolean;
    /** A photo already chosen (from the "Your story" picker). */
    photo?: string;
    onclose: () => void;
  } = $props();

  let picked = $state(0);
  // svelte-ignore state_referenced_locally
  let photo = $state<string | null>(chosen ?? null);
  // svelte-ignore state_referenced_locally
  let onPhoto = $state(!!chosen || cards.length === 0);
  let sticker = $state(true);
  let posting = $state(false);
  let closeFriends = $state<number | null>(null);
  const card = $derived(cards[picked] ? readCard(cards[picked].type, cards[picked].json) : null);
  const what = $derived(card?.type === "PersonalRecord" ? "record" : "workout");

  async function choosePhoto() {
    const p = await pickStoryPhoto();
    if (!p) return;
    photo = p;
    onPhoto = true;
  }

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
      let photoId: string | undefined;
      if (onPhoto) {
        if (!photo) return;
        try {
          photoId = (await uploadPhoto(photo)).id;
        } catch (e) {
          toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Photos need a connection. Try again when you're online.");
          return;
        }
      }
      const c = onPhoto && !sticker ? null : (cards[picked] ?? null);
      await storiesApi.post(c, toCloseFriends, photoId);
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
    {#if onPhoto}
      <div class="dark relative mx-auto aspect-[9/16] w-[52%] max-w-52 overflow-hidden rounded-2xl bg-black text-foreground">
        {#if photo}
          <StoryPhoto src={photo} />
          {#if sticker && card}<div class="absolute inset-x-2.5 bottom-2.5"><StoryCard {card} compact sticker /></div>{/if}
          <button type="button" aria-label="Choose another photo" onclick={choosePhoto}
            class="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-full bg-black/55 text-white"><Camera class="size-[18px]" /></button>
        {:else}
          <button type="button" onclick={choosePhoto} class="flex size-full flex-col items-center justify-center gap-2 text-[14px] font-medium text-white/80"><Camera class="size-6" />Choose a photo</button>
        {/if}
      </div>
    {:else}
      <div class="dark mx-auto flex aspect-[9/14] w-[56%] max-w-56 items-center rounded-2xl bg-black px-2.5 text-foreground">
        {#if card}<StoryCard {card} compact />{/if}
      </div>
    {/if}
    {#if cards.length > 0}
      <div class="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="What to add">
        {#each cards as c, i (i)}
          <button type="button" role="radio" aria-checked={!onPhoto && picked === i} class={chip(!onPhoto && picked === i)} onclick={() => { picked = i; onPhoto = false; }}>{c.label || (c.type === "PersonalRecord" ? "Record" : "Workout")}</button>
        {/each}
        <button type="button" role="radio" aria-checked={onPhoto} class="{chip(onPhoto)} flex items-center gap-1.5" onclick={() => (photo ? (onPhoto = true) : choosePhoto())}><Camera class="size-4" />Photo</button>
      </div>
    {/if}
    {#if onPhoto && card && photo}
      <div class="flex min-h-11 items-center justify-between gap-3 text-[14px]">
        <span>Show the {what} on the photo</span>
        <Switch checked={sticker} label="Show the {what} on the photo" onchange={(v) => (sticker = v)} />
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-2">
      <button type="button" disabled={posting || (onPhoto && !photo)} onclick={() => post(false)} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">Your story</button>
      <button type="button" disabled={posting || (onPhoto && !photo)} onclick={() => post(true)} class="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-60"><Star class="size-4" />Close friends</button>
    </div>
    <button type="button" class="h-11 text-sm font-medium text-muted-foreground" onclick={onclose}>Not this time</button>
  </div>
</BottomSheet>
