<!-- New post in a group (design canvas Q3): title, text, a kind (the usual ones, the group's own,
     or your own), who can comment, a photo or a workout/record, and a notice when the group shows
     posts on the web. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Camera, Dumbbell, Globe, Plus, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc, uploadPhoto } from "@logit/core/api/photosApi";
  import { DEFAULT_POST_KINDS, groupPostsApi, type GroupPost } from "@logit/core/api/groupPostsApi";
  import type { PostsGroup } from "@logit/core/api/groupsApi";
  import { cardTitle, readCard } from "@logit/core/domain/messageCard";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import { chip } from "$lib/components/ui/choice";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import ShareCardSheet from "./ShareCardSheet.svelte";
  import { pickImageFile } from "$lib/platform/filePick";
  import { resizeImageFile } from "$lib/platform/imageResize";

  const { group, onclose, onposted }: { group: PostsGroup; onclose: () => void; onposted?: (p: GroupPost) => void } = $props();
  let title = $state("");
  let body = $state("");
  let kinds = $state<string[]>(DEFAULT_POST_KINDS);
  let kind = $state("Question");
  let own = $state<string | null>(null);
  let photo = $state<string | null>(null);
  let card = $state<{ type: string; json: string } | null>(null);
  let sharing = $state(false);
  let membersOnly = $state(false);
  let posting = $state(false);
  const anyoneComments = $derived(group.posts?.whoCanComment !== "Members");

  onMount(async () => (kinds = await groupPostsApi.kinds(group.id).catch(() => DEFAULT_POST_KINDS)));

  async function choosePhoto() {
    try {
      photo = await resizeImageFile(await pickImageFile(), 2048, 0.85);
    } catch {
      // cancelled
    }
  }

  async function post() {
    const k = (own ?? kind).trim() || "Other";
    posting = true;
    try {
      const photoId = photo ? (await uploadPhoto(photo)).id : undefined;
      const p = await groupPostsApi.create(group.id, { title: title.trim(), body: body.trim(), kind: k, photoId, cardType: card?.type, cardJson: card?.json, membersOnlyComments: membersOnly });
      onposted?.(p);
      onclose();
      await goto(`/groups/posts/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't post it. Check your connection and try again.");
    } finally {
      posting = false;
    }
  }
</script>

<BottomSheet label="New post in {group.name}" {onclose} tall>
  <form class="flex flex-col gap-4 px-4 pb-2" onsubmit={(e) => { e.preventDefault(); void post(); }}>
    <h2 class="text-[19px] font-semibold">New post in {group.name}</h2>
    <label class="flex flex-col gap-1.5"><span class="text-[13px] font-medium">Title</span><Input bind:value={title} maxlength={200} placeholder="Best gyms in Sligo for powerlifting?" class="h-12 text-[15px]" /></label>
    <label class="flex flex-col gap-1.5"><span class="text-[13px] font-medium">Post (optional)</span><Textarea bind:value={body} rows={4} maxlength={10000} placeholder="Say more" class="min-h-28 text-[15px]" /></label>
    <div class="flex flex-col gap-2">
      <span class="text-[13px] font-medium" id="post-kind">What kind of post?</span>
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="post-kind">
        {#each kinds as k (k)}<button type="button" role="radio" aria-checked={own === null && kind === k} class={chip(own === null && kind === k)} onclick={() => { own = null; kind = k; }}>{k}</button>{/each}
        {#if own === null}<button type="button" class="{chip(false)} flex items-center gap-1" onclick={() => (own = "")}><Plus class="size-3.5" />Your own</button>{/if}
      </div>
      {#if own !== null}
        <span class="flex items-center gap-2"><Input bind:value={own} maxlength={30} placeholder="Meet prep" aria-label="Your own kind" class="h-11 text-[15px]" /><button type="button" aria-label="Use one of the usual kinds" class="flex size-11 shrink-0 items-center justify-center" onclick={() => (own = null)}><X class="size-4" /></button></span>
      {/if}
    </div>
    {#if anyoneComments}
      <div class="flex min-h-14 items-center gap-3 rounded-xl border border-border py-1.5 pl-3.5 pr-1.5">
        <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px] font-medium">Only members can comment</span><span class="text-[13px] text-muted-foreground">Off: anyone on LogIt can comment, shown as not a member</span></span>
        <Switch checked={membersOnly} label="Only members can comment" onchange={(v) => (membersOnly = v)} />
      </div>
    {/if}
    {#if photo}
      <span class="relative w-fit"><img src={photoSrc(photo)} alt="" class="max-h-48 rounded-xl border border-border" /><button type="button" aria-label="Remove the photo" class="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border border-border bg-background" onclick={() => (photo = null)}><X class="size-3.5" /></button></span>
    {/if}
    {#if card && readCard(card.type, card.json)}
      <span class="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-[14px]"><span class="truncate">{cardTitle(readCard(card.type, card.json)!)}</span><button type="button" aria-label="Remove the workout" class="flex size-9 items-center justify-center" onclick={() => (card = null)}><X class="size-4" /></button></span>
    {/if}
    <div class="grid grid-cols-2 gap-2">
      <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-medium" onclick={choosePhoto}><Camera class="size-4" />Photo</button>
      <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-medium" onclick={() => (sharing = true)}><Dumbbell class="size-4" />Workout or record</button>
    </div>
    {#if group.posts?.onWeb}
      <p class="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-[13px] leading-snug text-muted-foreground"><Globe class="mt-0.5 size-4 shrink-0" />Anyone can find this group, so anyone can read this on getlogit.app and find it on Google. Your name and photo show; your workouts never do.</p>
    {/if}
    <button type="submit" disabled={posting || !title.trim()} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">Post</button>
  </form>
</BottomSheet>
{#if sharing}<ShareCardSheet title="Share in your post" onpick={(c) => { card = c; sharing = false; }} onclose={() => (sharing = false)} />{/if}
