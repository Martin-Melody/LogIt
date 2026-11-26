<!-- New forum post (design canvas F3): title, text, #tags (typing suggests tags already in use,
     most used first; one-tap suggestions), optionally a group, a photo or a workout/record, and
     who can read it. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import { Camera, ChevronRight, Dumbbell, Globe, Lock, Plus, Users, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc, uploadPhoto } from "@logit/core/api/photosApi";
  import { forumApi, MAX_TAGS, normalizeTag, SUGGESTED_TAGS, tagsApi, type ForumPost, type TagCount } from "@logit/core/api/forumApi";
  import { groupsApi, type GroupAccess } from "@logit/core/api/groupsApi";
  import { cardTitle, readCard } from "@logit/core/domain/messageCard";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import ActionSheet, { type ActionItem } from "$lib/components/ActionSheet.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import ShareCardSheet from "./ShareCardSheet.svelte";
  import { pickImageFile } from "$lib/platform/filePick";
  import { resizeImageFile } from "$lib/platform/imageResize";

  type PickedGroup = { id: string; name: string; access?: GroupAccess };
  const { group: preset = null, tags: presetTags = [], onclose, onposted }: {
    group?: PickedGroup | null;
    tags?: string[];
    onclose: () => void;
    onposted?: (p: ForumPost) => void;
  } = $props();
  let title = $state("");
  let body = $state("");
  // svelte-ignore state_referenced_locally (a starting value)
  let tags = $state<string[]>([...presetTags]);
  let typed = $state("");
  let found = $state<TagCount[]>([]);
  // svelte-ignore state_referenced_locally (a starting value)
  let group = $state<PickedGroup | null>(preset);
  let groups = $state<PickedGroup[] | null>(null);
  let pickingGroup = $state(false);
  let photo = $state<string | null>(null);
  let card = $state<{ type: string; json: string } | null>(null);
  let sharing = $state(false);
  let posting = $state(false);
  const insideOnly = $derived(group?.access === "InviteOnly");

  onMount(() => {
    void groupsApi.mine().then((g) => {
      groups = g;
      // The preset group's access, for the notice.
      if (group && !group.access) group = g.find((x) => x.id === group!.id) ?? group;
    }).catch(() => (groups = []));
  });

  // Suggestions for what's being typed, a moment after typing stops.
  $effect(() => {
    const q = normalizeTag(typed);
    if (!q) { found = []; return; }
    const t = setTimeout(() => void tagsApi.suggest(q).then((r) => (found = r.filter((x) => !tags.includes(x.tag)))).catch(() => {}), 200);
    return () => clearTimeout(t);
  });

  function add(raw: string) {
    const t = normalizeTag(raw);
    if (t && !tags.includes(t) && tags.length < MAX_TAGS) tags = [...tags, t];
    typed = "";
    found = [];
  }

  function onKey(e: KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " " || e.key === ",") && typed.trim()) {
      e.preventDefault();
      add(typed);
    } else if (e.key === "Backspace" && !typed && tags.length) tags = tags.slice(0, -1);
  }

  async function choosePhoto() {
    try {
      photo = await resizeImageFile(await pickImageFile(), 2048, 0.85);
    } catch {
      // cancelled
    }
  }

  async function post() {
    if (typed.trim()) add(typed);
    posting = true;
    try {
      const photoId = photo ? (await uploadPhoto(photo)).id : undefined;
      const p = await forumApi.create({ title: title.trim(), body: body.trim(), tags, groupId: group?.id ?? null, photoId, cardType: card?.type, cardJson: card?.json });
      onposted?.(p);
      onclose();
      await goto(`/social/forum/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't post it. Check your connection and try again.");
    } finally {
      posting = false;
    }
  }

  const groupItems: ActionItem[] = $derived([
    { icon: X, label: "None", onSelect: () => (group = null) },
    ...(groups ?? []).map((g) => ({ icon: Users, label: g.name, value: g.access === "InviteOnly" ? "Members only" : null, onSelect: () => (group = g) })),
  ]);
</script>

<BottomSheet label="New forum post" {onclose} tall>
  <form class="flex flex-col gap-4 px-4 pb-2" onsubmit={(e) => { e.preventDefault(); void post(); }}>
    <h2 class="text-[19px] font-semibold">New forum post</h2>
    <label class="flex flex-col gap-1.5"><span class="text-[13px] font-medium">Title</span><Input bind:value={title} maxlength={200} placeholder="Best gyms in Sligo for powerlifting?" class="h-12 text-[15px]" /></label>
    <label class="flex flex-col gap-1.5"><span class="text-[13px] font-medium">Post (optional)</span><Textarea bind:value={body} rows={4} maxlength={10000} placeholder="Say more" class="min-h-28 text-[15px]" /></label>

    <div class="relative flex flex-col gap-1.5">
      <label for="post-tags" class="text-[13px] font-medium">Tags</label>
      <div class="flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2.5 py-2 focus-within:border-primary">
        {#each tags as t (t)}
          <span transition:fade={{ duration: 120 }} class="flex h-8 items-center gap-0.5 rounded-full bg-muted pl-2.5 text-[13px] text-sky-700 dark:text-sky-300">#{t}<button type="button" aria-label="Remove #{t}" class="flex size-8 items-center justify-center text-muted-foreground" onclick={() => (tags = tags.filter((x) => x !== t))}><X class="size-3.5" /></button></span>
        {/each}
        {#if tags.length < MAX_TAGS}
          <input id="post-tags" bind:value={typed} onkeydown={onKey} onblur={() => setTimeout(() => (found = []), 150)} autocomplete="off" autocapitalize="none"
            placeholder={tags.length ? "" : "#sligo, #deadlift…"} class="h-8 min-w-24 flex-1 bg-transparent text-[15px] text-sky-700 outline-none placeholder:text-muted-foreground dark:text-sky-300" />
        {/if}
      </div>
      {#if found.length}
        <ul transition:fade={{ duration: 120 }} class="absolute inset-x-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-lg" aria-label="Tags in use">
          {#each found as f (f.tag)}
            <li><button type="button" class="flex h-11 w-full items-center justify-between px-3.5 text-[14px]" onmousedown={(e) => e.preventDefault()} onclick={() => add(f.tag)}>
              <span class="text-sky-700 dark:text-sky-300">#{f.tag}</span><span class="text-[12px] text-muted-foreground">{f.count} {f.count === 1 ? "post" : "posts"}</span>
            </button></li>
          {/each}
        </ul>
      {/if}
      {#if SUGGESTED_TAGS.some((t) => !tags.includes(t))}
        <div class="flex flex-wrap items-center gap-1.5 pt-1">
          <span class="text-[12px] text-muted-foreground">Suggested</span>
          {#each SUGGESTED_TAGS.filter((t) => !tags.includes(t)) as t (t)}
            <button type="button" class="flex h-9 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[13px] text-muted-foreground" onclick={() => add(t)}><Plus class="size-3.5" />#{t}</button>
          {/each}
        </div>
      {/if}
    </div>

    <button type="button" class="flex min-h-14 items-center gap-3 rounded-xl border border-border py-2 pl-3.5 pr-2.5 text-left" onclick={() => (pickingGroup = true)}>
      <span class="flex flex-1 flex-col gap-0.5"><span class="text-[15px] font-medium">Post in a group</span><span class="text-[13px] text-muted-foreground">Optional. It also shows on the group's page.</span></span>
      <span class="max-w-[40%] truncate text-[14px] text-muted-foreground">{group?.name ?? "None"}</span><ChevronRight class="size-4 shrink-0 text-muted-foreground" />
    </button>

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
    <p class="flex items-start gap-2.5 text-[13px] leading-snug text-muted-foreground">
      {#if insideOnly}<Lock class="mt-0.5 size-4 shrink-0" />Only members of {group?.name} can read this. It stays out of the Forum and off the web.
      {:else}<Globe class="mt-0.5 size-4 shrink-0" />Anyone can read this, here and on getlogit.app, and find it by its tags. Your workouts never show.{/if}
    </p>
    <button type="submit" disabled={posting || !title.trim()} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60">Post</button>
  </form>
</BottomSheet>
<ActionSheet open={pickingGroup} onOpenChange={(v) => (pickingGroup = v)} title="Post in a group" subtitle="Your groups" items={groupItems} />
{#if sharing}<ShareCardSheet title="Share in your post" onpick={(c) => { card = c; sharing = false; }} onclose={() => (sharing = false)} />{/if}
