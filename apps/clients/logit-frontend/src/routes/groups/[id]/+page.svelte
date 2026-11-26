<!-- A group's page (design canvas G1): who it is, Chat and Invite, the pinned note, the next
     events (Going / Go), members. The week's board joins it in the next step. The ⋯ has Your settings, Report and
     Leave for everyone, plus Pin a note, Edit, Reset the link and Delete for organisers (G8). -->
<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { CalendarPlus, ChevronRight, Flag, Link2, LogOut, MessageCircle, MoreHorizontal, Pencil, Pin, QrCode, Settings2, Trash2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { dmApi } from "@logit/core/api/dmApi";
  import { groupsApi, type Group } from "@logit/core/api/groupsApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReportSheet from "$lib/components/social/ReportSheet.svelte";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import GroupFormSheet from "$lib/components/social/GroupFormSheet.svelte";
  import GroupInviteSheet from "$lib/components/social/GroupInviteSheet.svelte";
  import PinNoteSheet from "$lib/components/social/PinNoteSheet.svelte";
  import ForumList from "$lib/components/social/ForumList.svelte";
  import EventRow from "$lib/components/social/EventRow.svelte";
  import EventFormSheet from "$lib/components/social/EventFormSheet.svelte";
  import { eventsApi, gatherSeries, type GroupEvent } from "@logit/core/api/eventsApi";
  import { boardsApi, type BoardRow } from "@logit/core/api/boardsApi";
  import BoardTable from "$lib/components/social/BoardTable.svelte";
  import { sendBoardWeek, thisBoardWeek } from "$lib/features/groups/boardSync";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  /** Overview (the page as it was) or Posts (canvas Q1). */
  const tab = $derived(page.url.searchParams.get("tab") === "posts" ? "posts" : "overview");
  const setTab = (t: "overview" | "posts") => void goto(t === "posts" ? `/groups/${id}?tab=posts` : `/groups/${id}`, { replaceState: true, noScroll: true, keepFocus: true });
  let group = $state<Group | null>(null);
  let error = $state<string | null>(null);
  let unread = $state(false);
  let menuOpen = $state(false);
  let sheet = $state<"edit" | "invite" | "pin" | "report" | "event" | null>(null);
  let events = $state<GroupEvent[]>([]);
  /** "This week" (G1): the top three, and you if you're further down. */
  let week = $state<BoardRow[] | null>(null);
  let confirm = $state<"leave" | "delete" | "reset" | null>(null);
  const organiser = $derived(group?.me.role === "Organiser");
  const me = $derived(authStore.user?.username ?? "");

  async function load() {
    try {
      group = await groupsApi.get(id);
      error = null;
      events = await eventsApi.list(id).catch(() => []);
      void sendBoardWeek()
        .then(() => thisBoardWeek())
        .then((w) => boardsApi.group(id, w.week))
        .then((b) => { const top = b.rows.slice(0, 3); const me = b.rows.find((r) => r.me); week = me && !top.includes(me) ? [...top, me] : top; })
        .catch(() => (week = []));
      const threads = await dmApi.threads("chats").catch(() => []);
      unread = threads.some((t) => t.id === group?.threadId && t.unread);
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This group doesn't exist any more, or you're not in it." : "Couldn't load the group.";
    }
  }
  onMount(load);

  const others = $derived(group ? group.members - 1 : 0);
  const memberLine = $derived.by(() => {
    if (!group) return "";
    const names = group.preview.map((p) => p.displayName || p.username);
    if (names.length === 0) return "Just you so far. Invite people to join.";
    const shown = names.slice(0, 3);
    const rest = others - shown.length;
    return rest > 0 ? `${shown.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}` : shown.length === 1 ? `You and ${shown[0]}` : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  });
  const runBy = $derived.by(() => {
    const o = group?.organisers ?? [];
    if (o.length === 0) return "";
    const first = o[0]!.username === me ? "you" : o[0]!.displayName || o[0]!.username;
    return o.length === 1 ? `Run by ${first}` : `Run by ${first} and ${o.length - 1} ${o.length === 2 ? "other" : "others"}`;
  });

  async function act() {
    const c = confirm;
    confirm = null;
    if (!group || !c) return;
    try {
      if (c === "leave") {
        await groupsApi.removeMember(group.id, me);
        toast.success(`You left ${group.name}`);
        await goto("/messages", { replaceState: true });
      } else if (c === "delete") {
        await groupsApi.remove(group.id);
        toast.success(`${group.name} deleted`);
        await goto("/messages", { replaceState: true });
      } else {
        const { inviteCode } = await groupsApi.resetInvite(group.id);
        group = { ...group, inviteCode };
        toast.success("New link made. The old link and QR stop working.");
      }
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  const menu = $derived([
    ...(organiser
      ? [
          { icon: Pin, label: "Pin a note", onSelect: () => (sheet = "pin") },
          { icon: CalendarPlus, label: "New event", onSelect: () => (sheet = "event") },
          { icon: Pencil, label: "Edit group", onSelect: () => (sheet = "edit") },
          { icon: Link2, label: "Reset the invite link", onSelect: () => (confirm = "reset") },
        ]
      : []),
    ...(group && (group.me.role === "Organiser" || group.me.role === "Moderator")
      ? [{ icon: Flag, label: group.reports ? `Reports (${group.reports})` : "Reports", onSelect: () => void goto(`/groups/${id}/reports`) }]
      : []),
    { icon: Settings2, label: "Your settings", onSelect: () => void goto(`/groups/${id}/settings`) },
    ...(organiser ? [] : [{ icon: Flag, label: "Report group", destructive: true, onSelect: () => (sheet = "report") }]),
    { icon: LogOut, label: `Leave ${group?.name ?? "the group"}`, destructive: true, onSelect: () => (confirm = "leave") },
    ...(organiser ? [{ icon: Trash2, label: "Delete the group", destructive: true, onSelect: () => (confirm = "delete") }] : []),
  ]);
</script>

<div class="flex flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => back("/messages")} />
    <span class="flex-1"></span>
    {#if group}<button type="button" aria-label="Group options" class="flex size-11 items-center justify-center text-muted-foreground" onclick={() => (menuOpen = true)}><MoreHorizontal class="size-5" /></button>{/if}
  </PageHeader>

  {#if error}
    <p class="px-6 py-14 text-center text-sm text-muted-foreground">{error}</p>
  {:else if !group}
    <div class="flex flex-col gap-4 px-4 pt-2">
      <div class="flex items-center gap-3.5"><Skeleton class="size-16 rounded-2xl" /><Skeleton class="h-6 w-40 rounded" /></div>
      <Skeleton class="h-11 rounded-lg" />
    </div>
  {:else}
    <div class="flex flex-col gap-3.5 border-b border-border px-4 pb-4">
      <div class="flex items-center gap-3.5">
        <GroupAvatar name={group.name} src={group.photoUrl} size={64} />
        <span class="flex min-w-0 flex-col gap-0.5">
          <h1 class="truncate text-2xl font-bold tracking-tight">{group.name}</h1>
          <span class="text-[13px] text-muted-foreground">{[group.kind, group.place, `${group.members} ${group.members === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}</span>
          {#if runBy}<span class="text-[13px] text-muted-foreground">{runBy}</span>{/if}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <a href="/messages/chat?t={group.threadId}" class="relative flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground no-underline">
          <MessageCircle class="size-[18px]" />Chat
          {#if unread}<span class="size-2.5 rounded-full bg-primary-foreground" aria-label="Unread messages"></span>{/if}
        </a>
        <button type="button" class="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-medium" onclick={() => (sheet = "invite")}><QrCode class="size-[18px]" />Invite</button>
      </div>
    </div>

    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as "overview" | "posts")} class="mx-4 mt-1">
      <Tabs.List variant="line" aria-label="Group">
        {#each [["overview", "Overview"], ["posts", "Posts"]] as [t, label] (t)}<Tabs.Trigger value={t}>{label}</Tabs.Trigger>{/each}
      </Tabs.List>
    </Tabs.Root>
    {#if tab === "posts"}
      <ForumList filter={{ group: group.id }} group={{ id: group.id, name: group.name, access: group.access }} sorts={["active", "new"]} />
    {:else}
    {#if group.reports > 0}
      <a href="/groups/{group.id}/reports" class="mx-3 mt-3.5 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card px-3.5 text-[14px] font-medium text-inherit no-underline">
        {group.reports === 1 ? "1 reported message to look at" : `${group.reports} reported messages to look at`}<ChevronRight class="size-4 text-muted-foreground" />
      </a>
    {/if}
    {#if group.requests > 0}
      <a href="/groups/{group.id}/members" class="mx-3 mt-3.5 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 text-[14px] font-medium text-inherit no-underline">
        {group.requests === 1 ? "1 person asked to join" : `${group.requests} people asked to join`}<ChevronRight class="size-4 text-muted-foreground" />
      </a>
    {/if}
    {#if group.note}
      <section aria-label="Pinned note" class="mx-3 mt-3.5 flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-3">
        <span class="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Pin class="size-3.5" />Pinned{group.note.by ? ` by ${group.note.by.username === me ? "you" : group.note.by.displayName || group.note.by.username}` : ""} · {shortAgo(group.note.atMs, Date.now())}</span>
        <p class="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{group.note.text}</p>
      </section>
    {:else if organiser}
      <button type="button" class="mx-3 mt-3.5 flex min-h-12 items-center gap-2 rounded-2xl border border-dashed border-border px-3.5 text-[14px] text-muted-foreground" onclick={() => (sheet = "pin")}><Pin class="size-4" />Pin a note: opening hours, rules, what's on</button>
    {/if}

    {#if events.length || organiser}
      <section aria-labelledby="events-h" class="mt-5">
        <div class="flex items-center justify-between px-4 pb-1.5">
          <h2 id="events-h" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
          <a href="/groups/{group.id}/events" class="flex h-9 items-center rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground no-underline">All events</a>
        </div>
        {#if events.length}
          <div class="mx-3 rounded-2xl border border-border bg-card">
            {#each gatherSeries(events).slice(0, 3).map((g) => g.event) as e (e.id)}<EventRow event={e} ongo={async (x) => { const saved = await eventsApi.answer(x.id, true).catch(() => null); if (saved) events = events.map((y) => (y.id === x.id ? saved : y)); else toast.error("Couldn't save that. Try again."); }} />{/each}
          </div>
        {:else}
          <button type="button" class="mx-3 flex min-h-12 w-[calc(100%-1.5rem)] items-center gap-2 rounded-2xl border border-dashed border-border px-3.5 text-[14px] text-muted-foreground" onclick={() => (sheet = "event")}><CalendarPlus class="size-4" />Add an event: a session, a meet, a race</button>
        {/if}
      </section>
    {/if}

    {#if week && week.length}
      <section aria-labelledby="week-h" class="mt-5">
        <div class="flex items-center justify-between px-4 pb-1.5">
          <h2 id="week-h" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This week</h2>
          <a href="/groups/{group.id}/board" class="flex h-9 items-center rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground no-underline">See the board</a>
        </div>
        <div class="mx-3 overflow-hidden rounded-2xl border border-border bg-card"><BoardTable rows={week} compact /></div>
      </section>
    {/if}

    <section aria-labelledby="members-h" class="mt-5 px-4">
      <h2 id="members-h" class="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</h2>
      <a href="/groups/{group.id}/members" class="flex min-h-11 items-center gap-2.5 text-inherit no-underline">
        {#if group.preview.length}
          <span class="flex" aria-hidden="true">
            {#each group.preview as p, i (p.id)}<span class="rounded-full border-2 border-background {i ? '-ml-2' : ''}"><PersonAvatar name={p.displayName} src={p.avatarUrl} size={32} /></span>{/each}
          </span>
        {/if}
        <span class="min-w-0 flex-1 text-[14px] text-muted-foreground">{memberLine}</span>
        <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
      </a>
    </section>
    {/if}
  {/if}
</div>

{#if group}
  <ActionSheet open={menuOpen} onOpenChange={(v) => (menuOpen = v)} title={group.name} items={menu} />
  {#if sheet === "edit"}<GroupFormSheet {group} onclose={() => (sheet = null)} onsaved={(g) => (group = g)} />{/if}
  {#if sheet === "invite"}<GroupInviteSheet groupId={group.id} name={group.name} code={group.inviteCode} onclose={() => (sheet = null)} />{/if}
  {#if sheet === "pin"}<PinNoteSheet {group} onclose={() => (sheet = null)} onsaved={(g) => (group = g ?? (group ? { ...group, note: null } : null))} />{/if}
  {#if sheet === "event"}<EventFormSheet groupId={group.id} place={group.place} onclose={() => (sheet = null)} onsaved={() => void eventsApi.list(group!.id).then((l) => (events = l)).catch(() => {})} />{/if}
  {#if sheet === "report"}<ReportSheet open targetType="Group" targetId={group.id} what="group" onclose={() => (sheet = null)} />{/if}
  <ConfirmDialog
    open={!!confirm}
    onOpenChange={(v) => { if (!v) confirm = null; }}
    title={confirm === "leave" ? `Leave ${group.name}?` : confirm === "delete" ? `Delete ${group.name}?` : "Reset the invite link?"}
    description={confirm === "leave"
      ? organiser && group.organisers.length === 1 && group.members > 1
        ? "You're its only organiser, so the longest-standing member becomes one. You'll be off the board and out of the chat."
        : "You'll be off the board and out of the chat. You can join again with the link."
      : confirm === "delete"
        ? "It's gone for everyone, with its chat, photos and voice messages. This can't be undone."
        : "The old link and QR stop working. Anyone who already joined stays in."}
    confirmLabel={confirm === "leave" ? "Leave" : confirm === "delete" ? "Delete" : "Reset"}
    onConfirm={act}
  />
{/if}
