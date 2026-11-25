<!-- Watching stories (design canvas S2, S6 for a photo), as on Instagram: a bar per story, tap the right side
     for the next, the left for the previous, hold to pause, swipe down or back to close. Then the
     next person's. Someone else's: reply (a message quoting the story) and Cheer (the story like,
     only they see it), and Report. Yours: who watched and who cheered, and Delete. A photo story
     waits for its photo before its bar starts. -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { Flag, MoreHorizontal, Send, ThumbsUp, Trash2, User, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { storiesApi, storyReplyCard, type StoryViewer as Viewer } from "@logit/core/api/storiesApi";
  import type { TrainingFriend } from "@logit/core/api/trainingApi";
  import { readCard } from "@logit/core/domain/messageCard";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { sheetDrag, backDismiss } from "$lib/components/sheet/sheet";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import BottomSheet from "$lib/features/nutrition/ui/BottomSheet.svelte";
  import PersonAvatar from "./PersonAvatar.svelte";
  import StoryCard from "./StoryCard.svelte";
  import StoryPhoto from "./StoryPhoto.svelte";
  import ReportSheet from "./ReportSheet.svelte";
  import { firstUnseen, markSeen, stories } from "$lib/features/friends/stories.svelte";
  import { queueDm } from "$lib/features/friends/dmOutbox.svelte";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { minutesIn } from "$lib/features/friends/trainingPresence";
  import { fade } from "svelte/transition";

  const { training = [], onclose }: { training?: TrainingFriend[]; onclose: () => void } = $props();

  const DURATION = 6000;
  let ai = $state(stories.watching ?? 0);
  let si = $state(stories.row[stories.watching ?? 0] ? firstUnseen(stories.row[stories.watching ?? 0]) : 0);
  let progress = $state(0);
  let holding = $state(false);
  let typing = $state(false);
  let reply = $state("");
  let menuOpen = $state(false);
  let confirmDelete = $state(false);
  let viewers = $state<Viewer[] | null>(null);
  let viewersOpen = $state(false);
  let reporting = $state(false);
  /** The story whose photo has loaded (a photo story's bar waits for it). */
  let loaded = $state<string | null>(null);

  const author = $derived(stories.row[ai]);
  const story = $derived(author?.stories[si]);
  const card = $derived(story ? readCard(story.cardType, story.cardJson) : null);
  const name = $derived(author ? author.user.displayName || author.user.username : "");
  const trainingNow = $derived(author ? training.find((t) => t.username === author.user.username) : undefined);
  const photo = $derived(story?.photoUrl ? photoSrc(story.photoUrl) : undefined);
  const paused = $derived(holding || typing || menuOpen || confirmDelete || viewersOpen || reporting || reply.length > 0 || (!!photo && loaded !== story?.id));

  $effect(() => {
    openOverlay();
    return () => closeOverlay();
  });

  $effect(() => {
    if (!author || !story) onclose();
    else if (!author.mine) markSeen(ai, story.id);
  });

  $effect(() => {
    if (paused) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(t) {
      if (document.visibilityState === "visible") progress += (t - last) / DURATION;
      last = t;
      if (progress >= 1) next();
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  function show(a: number, s: number) {
    ai = a;
    si = s;
    progress = 0;
    viewers = null;
  }

  function next() {
    if (!author) return onclose();
    if (si < author.stories.length - 1) show(ai, si + 1);
    else if (ai < stories.row.length - 1) show(ai + 1, firstUnseen(stories.row[ai + 1]));
    else onclose();
  }

  function prev() {
    if (si > 0) show(ai, si - 1);
    else if (ai > 0) show(ai - 1, 0);
    else progress = 0;
  }

  // Tap left / right to move, hold to pause; a drag (closing) is neither.
  let downAt = { x: 0, y: 0, t: 0 };
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  function down(e: PointerEvent) {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    holdTimer = setTimeout(() => (holding = true), 200);
  }
  function up(e: PointerEvent) {
    clearTimeout(holdTimer);
    const wasHolding = holding;
    holding = false;
    if (wasHolding || Math.abs(e.clientY - downAt.y) > 12 || Math.abs(e.clientX - downAt.x) > 12) return;
    if (e.clientX < window.innerWidth / 3) prev();
    else next();
  }

  async function cheer() {
    if (!story || story.cheered) return;
    story.cheered = true;
    try {
      await storiesApi.cheer(story.id);
    } catch (e) {
      story.cheered = false;
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't send that. Try again.");
    }
  }

  function sendReply() {
    const text = reply.trim();
    if (!text || !story || !author) return;
    void queueDm({ username: author.user.username }, text, { card: storyReplyCard(story.id) });
    reply = "";
    (document.activeElement as HTMLElement | null)?.blur();
    toast.success(`Sent to ${name}`);
  }

  async function openViewers() {
    if (!story) return;
    viewersOpen = true;
    try {
      viewers = await storiesApi.viewers(story.id);
    } catch {
      viewers = [];
    }
  }

  async function remove() {
    if (!story || !author) return;
    const id = story.id;
    try {
      await storiesApi.remove(id);
    } catch {
      toast.error("Couldn't delete it. Try again.");
      return;
    }
    author.stories = author.stories.filter((s) => s.id !== id);
    if (author.stories.length === 0) {
      stories.row = stories.row.filter((a) => a !== author);
      onclose();
    } else show(ai, Math.min(si, author.stories.length - 1));
    toast.success("Story deleted");
  }

  const cheers = $derived(viewers?.filter((v) => v.cheered).length ?? 0);
</script>

{#if author && story}
  <div
    role="dialog"
    aria-modal="true"
    aria-label="{name}'s story"
    class="dark fixed inset-0 z-50 flex flex-col bg-black pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white"
    use:sheetDrag={{ onDismiss: onclose }}
    use:backDismiss={onclose}
  >
    {#if photo}
      {#key story.id}
        <div class="absolute inset-0" in:fade={{ duration: 150 }}>
          <StoryPhoto src={photo} width={story.photoWidth} height={story.photoHeight} onload={() => (loaded = story.id)} />
          <div class="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/45%)_0%,transparent_18%,transparent_70%,rgb(0_0_0/55%)_100%)]"></div>
        </div>
      {/key}
    {/if}
    <div data-sheet-bar class="relative flex gap-1 px-2 pb-2 pt-2" aria-hidden="true">
      {#each author.stories as s, i (s.id)}
        <span class="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
          <span class="block h-full bg-white" style="width: {i < si ? 100 : i === si ? Math.min(100, progress * 100) : 0}%"></span>
        </span>
      {/each}
    </div>

    <header class="relative flex items-center gap-2.5 px-3">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" onclick={() => { onclose(); void goto(author.mine ? "/profile" : `/social/${author.user.username}`); }}>
        <PersonAvatar name={name} src={author.user.avatarUrl} size={36} training={!!trainingNow} />
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-[15px] font-semibold">{author.mine ? "Your story" : name} <span class="font-normal text-white/60">· {shortAgo(story.createdAtMs, Date.now())}</span>{#if story.closeFriends}<span class="ml-1.5 rounded-full bg-white/15 px-2 py-0.5 align-[1px] text-[11px] font-semibold text-white">Close friends</span>{/if}</span>
          {#if trainingNow}
            <span class="truncate text-[13px] text-white/60">Training now · {trainingNow.what ?? "A workout"} · {minutesIn(trainingNow, Date.now())} min in</span>
          {/if}
        </span>
      </button>
      <button type="button" aria-label="More" class="flex size-11 items-center justify-center" onclick={() => (menuOpen = true)}><MoreHorizontal class="size-5" /></button>
      <button type="button" aria-label="Close" class="flex size-11 items-center justify-center" onclick={onclose}><X class="size-5" /></button>
    </header>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="relative flex flex-1 select-none px-3 {photo ? 'items-end pb-3' : 'items-center'}" onpointerdown={down} onpointerup={up} onpointercancel={() => { clearTimeout(holdTimer); holding = false; }}>
      {#key story.id}
        <div class="w-full text-foreground" in:fade={{ duration: 150 }}>
          {#if photo}
            {#if card}<StoryCard {card} sticker />{/if}
          {:else if card}<StoryCard {card} />{:else}<p class="text-center text-sm text-white/60">This story can't be shown here.</p>{/if}
        </div>
      {/key}
    </div>

    {#if author.mine}
      <div class="relative flex justify-center px-3 pb-3 pt-2">
        <button type="button" class="h-11 rounded-full px-4 text-[14px] font-medium text-white/80" onclick={openViewers}>Who's seen it</button>
      </div>
    {:else if author.canReply}
      <form class="relative flex items-center gap-2 px-3 pb-3 pt-2" onsubmit={(e) => { e.preventDefault(); sendReply(); }}>
        <input
          bind:value={reply}
          onfocus={() => (typing = true)}
          onblur={() => (typing = false)}
          maxlength="2000"
          placeholder="Send {name} a message"
          aria-label="Reply to {name}"
          class="h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-transparent px-4 text-[15px] text-white placeholder:text-white/50 focus:border-white/60 focus:outline-none"
        />
        {#if reply.trim()}
          <button type="submit" aria-label="Send" class="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black"><Send class="size-[18px]" /></button>
        {:else}
          <button type="button" onclick={cheer} aria-pressed={story.cheered}
            class="flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors {story.cheered ? 'bg-white/15 text-white' : 'bg-white text-black'}">
            <ThumbsUp class="size-[18px]" />{story.cheered ? "Cheered" : "Cheer"}
          </button>
        {/if}
      </form>
    {:else}
      <div class="h-6"></div>
    {/if}
  </div>

  <ActionSheet
    open={menuOpen}
    onOpenChange={(v) => (menuOpen = v)}
    title={author.mine ? "Your story" : name}
    items={author.mine
      ? [{ icon: Trash2, label: "Delete this story", destructive: true, onSelect: () => (confirmDelete = true) }]
      : [
          { icon: User, label: "View profile", onSelect: () => { onclose(); void goto(`/social/${author.user.username}`); } },
          { icon: Flag, label: "Report story", destructive: true, onSelect: () => (reporting = true) },
        ]}
  />
  <ConfirmDialog
    open={confirmDelete}
    onOpenChange={(v) => (confirmDelete = v)}
    title="Delete this story?"
    description="It's gone for everyone straight away, and from any reply that quoted it."
    confirmLabel="Delete"
    onConfirm={remove}
  />
  {#if reporting}<ReportSheet open targetType="Story" targetId={story.id} what="story" onclose={() => (reporting = false)} />{/if}
  {#if viewersOpen}
    <BottomSheet label="Who's seen it" onclose={() => (viewersOpen = false)} tall>
      <div class="flex flex-col gap-1 px-4 pb-4">
        <h2 class="text-[17px] font-semibold">{viewers === null ? "Who's seen it" : `Seen by ${viewers.length}`}{cheers ? ` · ${cheers} cheered` : ""}</h2>
        {#if viewers === null}
          <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        {:else if viewers.length === 0}
          <p class="py-6 text-center text-sm text-muted-foreground">Nobody yet.</p>
        {:else}
          {#each viewers as v (v.user.username)}
            <button type="button" class="flex min-h-14 items-center gap-3 rounded-lg px-1 text-left" onclick={() => { viewersOpen = false; onclose(); void goto(`/social/${v.user.username}`); }}>
              <PersonAvatar name={v.user.displayName} src={v.user.avatarUrl} size={40} />
              <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[15px] font-medium">{v.user.displayName}</span><span class="truncate text-[13px] text-muted-foreground">@{v.user.username}</span></span>
              {#if v.cheered}<ThumbsUp class="size-[18px] text-muted-foreground" aria-label="Cheered" />{/if}
            </button>
          {/each}
        {/if}
      </div>
    </BottomSheet>
  {/if}
{/if}
