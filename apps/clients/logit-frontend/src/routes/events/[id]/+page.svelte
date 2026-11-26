<!-- An event (design canvas G2): when, where, details, who's going, Going / Can't make it, Pin to
     Home and Ask in the chat. Its ⋯ (E3): Share for everyone; Edit and Cancel for organisers,
     both pushed to everyone going, and for a repeating event, this one or all after it (V4).
     Opened from search before you're in its group (V2): the group, and Join and go / Ask to join. -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Ban, Calendar, Check, ChevronRight, MapPin, MessageCircle, MoreHorizontal, Pencil, Pin, PinOff, Repeat, Share2 } from "lucide-svelte";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import type { EventScope } from "@logit/core/api/eventsApi";
  import { toast } from "svelte-sonner";
  import { Capacitor } from "@capacitor/core";
  import { ApiError } from "@logit/core/api/client";
  import { eventsApi, goingLine, type GroupEvent } from "@logit/core/api/eventsApi";
  import { groupsApi } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import EventFormSheet from "$lib/components/social/EventFormSheet.svelte";
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { eventWhen } from "$lib/features/groups/eventTime";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  let ev = $state<GroupEvent | null>(null);
  let error = $state<string | null>(null);
  let menuOpen = $state(false);
  let editing = $state(false);
  let cancelling = $state(false);
  let scope = $state<EventScope>("one");
  /** Asking "this one, or all after it?" before editing or cancelling a repeating event. */
  let choosing = $state<"edit" | "cancel" | null>(null);
  let joining = $state(false);
  const when = $derived(ev ? new Date(ev.startsAtMs).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "");

  // The sheet closes (clearing `choosing`) before a choice runs, so each item keeps its action.
  function scopeItems(action: "edit" | "cancel") {
    const go = (which: EventScope) => () => {
      scope = which;
      if (action === "edit") editing = true;
      else cancelling = true;
    };
    return [
      { icon: Calendar, label: `Just ${when}`, onSelect: go("one") },
      { icon: Repeat, label: "This and every one after it", onSelect: go("following") },
    ];
  }

  function start(action: "edit" | "cancel") {
    if (ev?.repeats) choosing = action;
    else {
      scope = "one";
      if (action === "edit") editing = true;
      else cancelling = true;
    }
  }

  async function joinAndGo() {
    if (!ev) return;
    joining = true;
    try {
      const { status } = await groupsApi.joinById(ev.groupId, true, ev.id);
      if (status === "requested") {
        ev = { ...ev, requested: true };
        toast.success("Asked. You'll be going once an organiser lets you in.");
      } else {
        toast.success(`You joined ${ev.groupName} and you're going`);
        await load();
      }
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't join. Try again.");
    } finally {
      joining = false;
    }
  }
  const me = $derived(authStore.user?.username ?? "");
  const past = $derived(!!ev && ev.startsAtMs < Date.now() - 6 * 3_600_000);

  async function load() {
    try {
      ev = await eventsApi.get(id);
      error = null;
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This event doesn't exist any more, or you're not in its group." : "Couldn't load the event.";
    }
  }
  onMount(load);

  async function answer(going: boolean) {
    if (!ev) return;
    const before = ev;
    ev = { ...ev, answer: going, going: ev.going + (going ? (ev.answer === true ? 0 : 1) : ev.answer === true ? -1 : 0) };
    try {
      ev = await eventsApi.answer(before.id, going);
    } catch (e) {
      ev = before;
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't save that. Try again.");
    }
  }

  async function pin() {
    if (!ev) return;
    const pinned = !ev.pinned;
    ev = { ...ev, pinned };
    try {
      await eventsApi.pin(ev.id, pinned);
      toast.success(pinned ? "Pinned to Home" : "Taken off Home");
    } catch {
      ev = { ...ev, pinned: !pinned };
      toast.error("Couldn't do that. Try again.");
    }
  }

  async function chat() {
    if (!ev) return;
    try {
      const g = await groupsApi.get(ev.groupId);
      await goto(`/messages/chat?t=${g.threadId}`);
    } catch {
      toast.error("Couldn't open the chat.");
    }
  }

  async function share() {
    if (!ev) return;
    const text = [`${ev.title} · ${ev.groupName}`, eventWhen(ev), ev.place].filter(Boolean).join("\n");
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: ev.title, text });
      } else if (typeof navigator.share === "function") await navigator.share({ title: ev.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied");
      }
    } catch {
      // Cancelled.
    }
  }

  async function cancel() {
    if (!ev) return;
    try {
      await eventsApi.cancel(ev.id, scope);
      ev = { ...ev, cancelled: true };
      toast.success(scope === "following" ? "This and every later date cancelled. Everyone going has been told." : "Event cancelled. Everyone going has been told.");
    } catch {
      toast.error("Couldn't cancel it. Try again.");
    }
  }

  const menu = $derived([
    ...(ev?.canEdit && !ev.cancelled && !past ? [{ icon: Pencil, label: "Edit event", onSelect: () => start("edit") }] : []),
    { icon: Share2, label: "Share", onSelect: () => void share() },
    ...(ev?.canEdit && !ev.cancelled && !past ? [{ icon: Ban, label: "Cancel event", destructive: true, onSelect: () => start("cancel") }] : []),
  ]);
</script>

<div class="flex min-h-full flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back(ev ? `/groups/${ev.groupId}` : "/messages")} />
    <span class="flex-1"></span>
    {#if ev}<button type="button" aria-label="Event options" class="flex size-11 items-center justify-center text-muted-foreground" onclick={() => (menuOpen = true)}><MoreHorizontal class="size-5" /></button>{/if}
  </PageHeader>

  {#if error}
    <p class="px-6 py-14 text-center text-sm text-muted-foreground">{error}</p>
  {:else if !ev}
    <div class="flex flex-col gap-3 px-4"><Skeleton class="h-4 w-32 rounded" /><Skeleton class="h-7 w-48 rounded" /></div>
  {:else}
    <div class="flex flex-col gap-1.5 px-4">
      <a href={ev.member ? `/groups/${ev.groupId}` : `/groups/join?id=${ev.groupId}`} class="w-fit text-[13px] text-muted-foreground no-underline">{[ev.groupName, ev.kind, ev.sport].filter(Boolean).join(" · ")}</a>
      {#if ev.repeats}<span class="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Repeat class="size-3.5" />{ev.repeats}</span>{/if}
      <h1 class="text-2xl font-bold tracking-tight {ev.cancelled ? 'text-muted-foreground line-through' : ''}">{ev.title}</h1>
    </div>
    {#if ev.cancelled}
      <p class="mx-3 mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-[14px] text-destructive">Cancelled. Everyone going was told.</p>
    {/if}

    <ul class="mx-3 mt-4 rounded-2xl border border-border bg-card">
      <li class="flex min-h-13 items-center gap-3 border-b border-border px-3.5 py-1.5 last:border-b-0"><Calendar class="size-[18px] shrink-0 text-muted-foreground" /><span class="text-[15px] tabular-nums">{eventWhen(ev)}</span></li>
      {#if ev.place}<li class="flex min-h-13 items-center gap-3 px-3.5 py-1.5"><MapPin class="size-[18px] shrink-0 text-muted-foreground" /><span class="text-[15px]">{ev.place}</span></li>{/if}
    </ul>

    {#if ev.details}<p class="mx-4 mt-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{ev.details}</p>{/if}

    <section aria-labelledby="go-h" class="mx-4 mt-5 flex flex-col gap-2">
      <h2 id="go-h" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ev.going} going</h2>
      {#if ev.member}
        <a href="/events/{ev.id}/people" class="flex min-h-11 items-center gap-2.5 text-inherit no-underline">
          {#if ev.goingPeople.length}<span class="flex" aria-hidden="true">{#each ev.goingPeople as p, i (p.id)}<span class="rounded-full border-2 border-background {i ? '-ml-2' : ''}"><PersonAvatar name={p.displayName} src={p.avatarUrl} size={32} /></span>{/each}</span>{/if}
          <span class="min-w-0 flex-1 text-[14px] text-muted-foreground">{goingLine(ev, me)}</span>
          <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
        </a>
      {/if}
    </section>

    <div class="flex-1"></div>
    {#if !ev.member && !ev.cancelled && !past}
      <div class="mt-6 flex flex-col gap-2.5 px-4">
        <a href="/groups/join?id={ev.groupId}" class="flex items-center gap-3 rounded-2xl border border-border px-3 py-2.5 text-inherit no-underline">
          <GroupAvatar name={ev.groupName} size={44} />
          <span class="flex min-w-0 flex-1 flex-col"><span class="truncate text-[15px] font-semibold">{ev.groupName}</span>
            <span class="truncate text-[12px] text-muted-foreground">{[ev.groupPlace, `${ev.groupMembers} ${ev.groupMembers === 1 ? "member" : "members"}`, ev.groupAccess === "Open" ? "anyone can join" : "asks to join"].filter(Boolean).join(" · ")}</span></span>
        </a>
        {#if ev.requested}
          <button type="button" disabled class="h-12 rounded-lg border border-border text-[15px] font-semibold text-muted-foreground">Requested</button>
          <p class="text-[12px] leading-snug text-muted-foreground">You'll be going once an organiser lets you in.</p>
        {:else}
          <button type="button" disabled={joining} class="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60" onclick={joinAndGo}>{ev.groupAccess === "Open" ? `Join ${ev.groupName} and go` : "Ask to join"}</button>
          <p class="text-[12px] leading-snug text-muted-foreground">Events are for members, so going means joining the group. You can turn "Show me on the board" off in its settings.</p>
        {/if}
      </div>
    {:else if !ev.cancelled && !past}
      <div class="mt-6 flex flex-col gap-2.5 px-4">
        <div class={segmentTrack} role="radiogroup" aria-label="Are you going?">
          <button type="button" role="radio" aria-checked={ev.answer === true} class="{segment(ev.answer === true)} flex items-center justify-center gap-1.5" onclick={() => answer(true)}>
            {#if ev.answer === true}<Check class="size-4 text-success" />{/if}Going
          </button>
          <button type="button" role="radio" aria-checked={ev.answer === false} class={segment(ev.answer === false)} onclick={() => answer(false)}>Can't make it</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={ev.pinned} class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-medium" onclick={pin}>
            {#if ev.pinned}<PinOff class="size-[18px]" />Unpin from Home{:else}<Pin class="size-[18px]" />Pin to Home{/if}
          </button>
          <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[14px] font-medium" onclick={chat}><MessageCircle class="size-[18px]" />Ask in the chat</button>
        </div>
        {#if ev.answer === true}<p class="text-[12px] leading-snug text-muted-foreground">You'll get a reminder the evening before.</p>{/if}
      </div>
    {/if}
  {/if}
</div>

{#if ev}
  <ActionSheet open={menuOpen} onOpenChange={(v) => (menuOpen = v)} title={ev.title} items={menu} />
  {#if editing}<EventFormSheet groupId={ev.groupId} event={ev} {scope} onclose={() => (editing = false)} onsaved={(e) => (ev = e)} />{/if}
  <ConfirmDialog open={cancelling} onOpenChange={(v) => (cancelling = v)} title={scope === "following" ? "Cancel this and every later date?" : `Cancel ${ev.title}?`}
    description="Everyone going gets a push, and it shows as cancelled until its day." confirmLabel="Cancel event" onConfirm={cancel} />
  <ActionSheet
    open={!!choosing}
    onOpenChange={(v) => { if (!v) choosing = null; }}
    title={choosing === "cancel" ? "Cancel which sessions?" : "Change which sessions?"}
    items={choosing ? scopeItems(choosing) : []}
  />
{/if}
