<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
  import LinkIcon from "@lucide/svelte/icons/link";
  import ArrowLeftRightIcon from "@lucide/svelte/icons/arrow-left-right";
  import KeyboardIcon from "@lucide/svelte/icons/keyboard";
  import { page } from "$app/state";
  import { apiClient } from "@logit/core/api/client";
  import * as Command from "$lib/components/ui/command";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Kbd } from "$lib/components/ui/kbd";
  import Avatar from "$lib/features/coaching/Avatar.svelte";
  import { coachBadges } from "$lib/features/coaching/badges.svelte";
  import { loadCoachingOverview, type ClientSummary } from "$lib/features/coaching/coachingData";
  import { shortDate, when } from "$lib/features/coaching/format";
  import { adminApi, at, type PersonRow } from "$lib/features/admin/adminApi";
  import { navFor, workspaceOf, type NavItem } from "$lib/nav";
  import { getWebDeps } from "$lib/deps";
  import { toast } from "$lib/components/ui/sonner";
  import AppleIcon from "@lucide/svelte/icons/apple";
  import ScaleIcon from "@lucide/svelte/icons/scale";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
  import PenSquareIcon from "@lucide/svelte/icons/square-pen";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
  import { sessionMatches, sessionTitle } from "@logit/core/domain/sessionHistory";
  import { exerciseIndex, findExercises, type ExerciseHit } from "@logit/core/domain/exerciseIndex";
  import { blockDisplayName, type WorkoutSession } from "@logit/core/domain/workout";
  import { socialApi, type UserSearchResult } from "@logit/core/api/socialApi";
  import { groupsApi, type GroupSearchResult } from "@logit/core/api/groupsApi";
  import { eventsApi, type GroupEvent } from "@logit/core/api/eventsApi";
  import { forumApi, type ForumPost } from "@logit/core/api/forumApi";
  import { clientActions, commands, isTyping, modKey, personActions, type RowAction } from "./commands.svelte";

  // ⌘K (go + find + do), the "?" shortcuts list, and G-then-a-letter page jumps, for the
  // whole dashboard. Mounted once by the root layout for signed-in pages with the sidebar.
  let { coach }: { coach: boolean } = $props();

  const ws = $derived(workspaceOf(page.url.pathname, page.url.searchParams, coach));
  const pages = $derived<NavItem[]>(navFor(ws, apiClient.isSelfHosted()).flatMap((g) => g.items));

  let search = $state("");
  // A client (Coaching) or an account (admin) whose actions fill the palette.
  type Picked = { name: string; avatarUrl: string | null; line: string; actions: RowAction[] };
  let picked = $state<Picked | null>(null);
  let clients = $state<ClientSummary[]>([]);
  let people = $state<PersonRow[]>([]);
  const meId = apiClient.getUser()?.id;

  function loadClients() {
    loadCoachingOverview()
      .then((o) => (clients = [...o.clients].sort((a, b) => (b.lastSessionAtMs ?? 0) - (a.lastSessionAtMs ?? 0))))
      .catch(() => {});
  }
  // Loaded once on the first Coaching page, so typing straight after ⌘K finds them;
  // refreshed each time it opens (the Clients page loads the same thing).
  let loadedOnce = false;
  $effect(() => {
    if (ws === "coaching" && !loadedOnce) {
      loadedOnce = true;
      untrack(loadClients);
    }
  });
  $effect(() => {
    if (!commands.palette) {
      search = "";
      picked = null;
    } else if (ws === "coaching") {
      untrack(loadClients);
    }
  });

  // Admin: everyone on the server matching what's typed (name, username or email).
  let peopleTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!commands.palette || ws !== "admin" || picked) return;
    const q = search.trim();
    clearTimeout(peopleTimer);
    peopleTimer = setTimeout(() => {
      adminApi.people(q).then((r) => { if (search.trim() === q) people = r.users.slice(0, 8); }).catch(() => {});
    }, q ? 200 : 0);
  });

  // Me (canvas boards 10 and 15): your exercises and sessions, and people, groups, events and
  // forum threads on the server, as you type.
  let sessions = $state<WorkoutSession[] | null>(null);
  const exercises = $derived<ExerciseHit[]>(sessions ? exerciseIndex(sessions) : []);
  let social = $state<{ q: string; people: UserSearchResult[]; groups: GroupSearchResult[]; events: GroupEvent[]; forum: ForumPost[] }>({ q: "", people: [], groups: [], events: [], forum: [] });
  $effect(() => {
    if (!commands.palette || ws !== "me" || sessions) return;
    untrack(() => getWebDeps().workoutRepo.listAllSessions()
      .then((all) => (sessions = all.filter((x) => x.endedAtMs != null).sort((a, b) => b.startedAtMs - a.startedAtMs)))
      .catch(() => (sessions = [])));
  });
  let socialTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const q = search.trim();
    if (!commands.palette || ws !== "me" || picked) return;
    clearTimeout(socialTimer);
    if (q.length < 2) return;
    socialTimer = setTimeout(() => {
      void Promise.all([
        socialApi.searchUsers(q).catch(() => []),
        groupsApi.search(q).catch(() => []),
        eventsApi.search({ q }).catch(() => []),
        forumApi.search(q).catch(() => []),
      ]).then(([people, groups, events, forum]) => {
        if (search.trim() === q) social = { q, people: people.slice(0, 4), groups: groups.slice(0, 3), events: events.slice(0, 3), forum: forum.slice(0, 3) };
      });
    }, 200);
  });
  const typed = $derived(search.trim());
  const exerciseHits = $derived(ws === "me" && typed ? findExercises(exercises, typed) : []);
  const sessionHits = $derived(ws === "me" && typed && sessions ? sessions.filter((x) => sessionMatches(x, typed).length > 0).slice(0, 3) : []);
  const shown = $derived(social.q && typed.toLowerCase().startsWith(social.q.toLowerCase()) ? social : { people: [], groups: [], events: [], forum: [] });
  const kg = (n: number) => `${Math.round(n * 10) / 10} kg`;
  const exerciseLine = (e: ExerciseHit) => [e.weight > 0 ? `best ${kg(e.weight)} × ${e.reps}` : null, e.e1rm > 0 ? `e1RM ${kg(e.e1rm)}` : null, when(e.lastMs)].filter(Boolean).join(" · ");
  const sessionLine = (x: WorkoutSession) => new Date(x.startedAtMs).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  function pickUser(u: UserSearchResult) {
    let following = u.isFollowing;
    const actions: RowAction[] = [
      { id: "open", label: "Open profile", href: `/social/${u.username}` },
      { id: "message", label: `Message ${u.displayName || u.username}`, href: `/social/messages?u=${u.username}` },
      following
        ? { id: "unfollow", label: "Unfollow", run: () => void socialApi.unfollow(u.username).then(() => toast.success(`Unfollowed @${u.username}`), () => toast.error("Couldn't unfollow. Try again.")) }
        : { id: "follow", label: u.isRequested ? "Requested" : u.followsYou ? "Follow back" : "Follow", disabled: u.isRequested ? "Waiting for them" : undefined,
            run: () => void socialApi.follow(u.username).then((r) => toast.success(r === "requested" ? `Asked to follow @${u.username}` : `Following @${u.username}`), () => toast.error("Couldn't follow. Try again.")) },
      { id: "copy", label: "Copy profile link", run: () => void navigator.clipboard.writeText(`${location.origin}/social/${u.username}`).then(() => toast.success("Link copied")) },
    ];
    picked = { name: u.displayName || u.username, avatarUrl: u.avatarUrl, line: [`@${u.username}`, `${u.followerCount} follower${u.followerCount === 1 ? "" : "s"}`, ...(following ? ["you follow them"] : []), ...(u.followsYou ? ["follows you"] : [])].join(" · "), actions };
    search = "";
  }

  function go(href: string) {
    commands.palette = false;
    void goto(href);
  }

  function runAction(a: RowAction) {
    if (a.href) return go(a.href);
    commands.palette = false;
    a.run?.();
  }

  function pickClient(c: ClientSummary) {
    picked = { name: c.name, avatarUrl: c.avatarUrl, line: clientLine(c), actions: clientActions(c) };
    search = "";
  }

  function pickPerson(p: PersonRow) {
    picked = { name: p.displayName || p.username, avatarUrl: null, line: personLine(p), actions: personActions(p, meId) };
    search = "";
  }

  function personLine(p: PersonRow): string {
    const seen = p.lastActive ? `last seen ${when(at(p.lastActive))}` : "not seen yet";
    return [`@${p.username}`, `joined ${shortDate(at(p.createdAt))}`, seen, `${p.postCount} post${p.postCount === 1 ? "" : "s"}`, ...(p.isAdmin ? ["Admin"] : [])].join(" · ");
  }

  function clientLine(c: ClientSummary): string {
    const bits = [c.isSample ? "Sample" : `@${c.username}`];
    if (c.sharing.workouts) {
      bits.push(c.lastSessionAtMs ? `trained ${when(c.lastSessionAtMs)}` : "no workouts yet");
      bits.push(`${c.sessions7d} this week`);
    }
    return bits.join(" · ");
  }

  // Backspace in an empty box steps back from a client's actions to everything.
  function onInputKey(e: KeyboardEvent) {
    if (e.key === "Backspace" && search === "" && picked) {
      e.preventDefault();
      picked = null;
    }
  }

  let gAt = 0;
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      commands.shortcuts = false;
      commands.palette = !commands.palette;
      return;
    }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
    // Not on top of an open dialog, menu or sheet.
    if (commands.palette || commands.shortcuts || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
    if (e.key === "?") {
      e.preventDefault();
      commands.shortcuts = true;
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "g") {
      gAt = Date.now();
      return;
    }
    if (Date.now() - gAt < 1500) {
      gAt = 0;
      const to = pages.find((p) => p.key?.toLowerCase() === k);
      if (to) {
        e.preventDefault();
        void goto(to.href);
      }
    }
  }

  const otherWs = $derived(ws === "me" && coach ? { label: "Switch to Coaching", href: "/coaching" } : ws === "coaching" ? { label: "Switch to Me", href: "/" } : null);
</script>

<svelte:window onkeydown={onKey} />

{#snippet keys(letter: string)}
  <Command.Shortcut class="flex gap-1 tracking-normal"><Kbd>G</Kbd><Kbd>{letter}</Kbd></Command.Shortcut>
{/snippet}

<Command.Dialog bind:open={commands.palette} title="Search or jump to" description="Find a page{ws === 'coaching' ? ', a client' : ''} or something to do"
  class="top-[12vh] sm:max-w-[640px]" shouldFilter={true}>
  {#if picked}
    {@const c = picked}
    <div class="flex items-center gap-2 px-3 pt-3 text-[13px]">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-1 font-medium"><Avatar name={c.name} url={c.avatarUrl} size={20} />{c.name}</span>
      <span class="truncate text-xs text-muted-foreground">{c.line}</span>
    </div>
  {/if}
  <Command.Input bind:value={search} onkeydown={onInputKey}
    placeholder={picked ? "What do you want to do?" : ws === "coaching" ? "Search clients and pages, or type what to do" : ws === "admin" ? "Find a person (name, username or email) or a page" : "Search exercises, sessions, people, groups and pages"} />
  <Command.List class="max-h-[min(60vh,520px)]">
    <Command.Empty>Nothing matches “{search}”.</Command.Empty>
    {#if picked}
      <Command.Group heading="Actions">
        {#each picked.actions as a (a.id)}
          <Command.Item value={a.label} disabled={!!a.disabled} onSelect={() => runAction(a)} class="min-h-10 {a.danger ? 'text-destructive data-selected:text-destructive' : ''}">
            <span class="flex-1">{a.label}</span>
            {#if a.disabled}<Command.Shortcut class="tracking-normal">{a.disabled}</Command.Shortcut>{:else if a.id === "open"}<Command.Shortcut><Kbd>↵</Kbd></Command.Shortcut>{/if}
          </Command.Item>
        {/each}
      </Command.Group>
    {:else}
      {#if ws === "coaching" && clients.length}
        <Command.Group heading="Clients">
          {#each clients as c (c.relationshipId)}
            <Command.Item value="client {c.name} {c.username}" onSelect={() => pickClient(c)} class="min-h-11">
              <Avatar name={c.name} url={c.avatarUrl} size={26} />
              <span class="font-medium">{c.name}</span>
              <span class="truncate text-xs text-muted-foreground">{clientLine(c)}</span>
              <Command.Shortcut class="tracking-normal">Actions ›</Command.Shortcut>
            </Command.Item>
          {/each}
        </Command.Group>
      {/if}
      {#if ws === "admin" && people.length}
        <Command.Group heading="People">
          {#each people as p (p.id)}
            <!-- The server already matched these, so the value carries the search too. -->
            <Command.Item value="person {p.displayName} {p.username} {p.email} {search}" onSelect={() => pickPerson(p)} class="min-h-11">
              <Avatar name={p.displayName || p.username} size={26} />
              <span class="font-medium">{p.displayName || p.username}</span>
              <span class="truncate text-xs text-muted-foreground">@{p.username}{p.isAdmin ? " · Admin" : ""}</span>
              <Command.Shortcut class="tracking-normal">Actions ›</Command.Shortcut>
            </Command.Item>
          {/each}
        </Command.Group>
      {/if}
      {#if ws === "coaching"}
        <Command.Group heading="Do">
          <Command.Item value="New program" onSelect={() => go("/coaching/programs?new=1")}><PlusIcon class="text-muted-foreground" />New program</Command.Item>
          <Command.Item value="Review check-ins" onSelect={() => go("/coaching/checkins")}>
            <ClipboardCheckIcon class="text-muted-foreground" />
            <span class="flex-1">Review check-ins</span>
            <Command.Shortcut class="tracking-normal">{coachBadges.checkins ? `${coachBadges.checkins} waiting` : "None waiting"}</Command.Shortcut>
          </Command.Item>
          <Command.Item value="Invite a client invite link" onSelect={() => go("/coaching/links")}><LinkIcon class="text-muted-foreground" />Invite a client</Command.Item>
        </Command.Group>
      {/if}
      {#if ws === "me" && typed}
        {#if exerciseHits.length}
          <Command.Group heading="Exercises">
            {#each exerciseHits as e (e.id)}
              <Command.Item value="exercise {e.name} {search}" onSelect={() => go(`/exercises/${e.id}`)} class="min-h-11">
                <span class="font-medium">{e.name}</span>
                <span class="truncate text-xs text-muted-foreground">{exerciseLine(e)}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
        {#if sessionHits.length}
          <Command.Group heading="Sessions with it">
            {#each sessionHits as x (x.id)}
              {@const hit = sessionMatches(x, typed)[0]}
              <Command.Item value="session {x.id} {search}" onSelect={() => go(`/sessions?id=${x.id}`)}>
                <span>{sessionTitle(x)}</span>
                <span class="truncate text-xs text-muted-foreground">{sessionLine(x)}{hit ? ` · ${blockDisplayName(hit)}` : ""}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
        {#if shown.people.length}
          <Command.Group heading="People">
            {#each shown.people as u (u.id)}
              <Command.Item value="person {u.username} {search}" onSelect={() => pickUser(u)} class="min-h-11">
                <Avatar name={u.displayName || u.username} url={u.avatarUrl} size={26} />
                <span class="font-medium">{u.displayName || u.username}</span>
                <span class="truncate text-xs text-muted-foreground">@{u.username}{u.isFollowing && u.followsYou ? " · you follow each other" : u.isFollowing ? " · you follow them" : u.followsYou ? " · follows you" : ""}</span>
                <Command.Shortcut class="tracking-normal">Actions ›</Command.Shortcut>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
        {#if shown.groups.length}
          <Command.Group heading="Groups">
            {#each shown.groups as g (g.id)}
              <Command.Item value="group {g.id} {search}" onSelect={() => go(`/groups/${g.id}`)}>
                <span class="font-medium">{g.name}</span>
                <span class="truncate text-xs text-muted-foreground">{g.members} member{g.members === 1 ? "" : "s"}{g.state === "member" ? " · you're in it" : ""}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
        {#if shown.events.length}
          <Command.Group heading="Events">
            {#each shown.events as ev (ev.id)}
              <Command.Item value="event {ev.id} {search}" onSelect={() => go(`/groups/${ev.groupId}`)}>
                <span class="font-medium">{ev.title}</span>
                <span class="truncate text-xs text-muted-foreground">{new Date(ev.startsAtMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {ev.groupName}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
        {#if shown.forum.length}
          <Command.Group heading="Forum">
            {#each shown.forum as f (f.id)}
              <Command.Item value="forum {f.id} {search}" onSelect={() => go(`/social/forum/${f.id}`)}>
                <span class="truncate font-medium">{f.title}</span>
                {#if f.author}<span class="shrink-0 text-xs text-muted-foreground">by @{f.author.username}</span>{/if}
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      {/if}
      {#if ws === "me" && !typed}
        <Command.Group heading="Do">
          <Command.Item value="Log food for today" onSelect={() => go("/nutrition")}><AppleIcon class="text-muted-foreground" />Log food for today</Command.Item>
          <Command.Item value="Log my weight" onSelect={() => go("/nutrition/weight")}><ScaleIcon class="text-muted-foreground" />Log my weight</Command.Item>
          <Command.Item value="Add a habit" onSelect={() => go("/habits")}><CircleCheckIcon class="text-muted-foreground" />Add a habit</Command.Item>
          <Command.Item value="Plan next week" onSelect={() => go("/plan")}><CalendarDaysIcon class="text-muted-foreground" />Plan next week</Command.Item>
          <Command.Item value="New post" onSelect={() => go("/social")}><PenSquareIcon class="text-muted-foreground" />New post</Command.Item>
          <Command.Item value="New message" onSelect={() => go("/social/messages")}><MessageCircleIcon class="text-muted-foreground" />New message</Command.Item>
        </Command.Group>
        {#if sessions?.length}
          <Command.Group heading="Recent sessions">
            {#each sessions.slice(0, 3) as x (x.id)}
              <Command.Item value="recent {x.id}" onSelect={() => go(`/sessions?id=${x.id}`)}>
                <span>{sessionTitle(x)}</span>
                <span class="text-xs text-muted-foreground">{sessionLine(x)}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      {/if}
      <Command.Group heading="Go to">
        {#each pages as p (p.href)}
          <Command.Item value="go {p.label}" onSelect={() => go(p.href)}>
            <p.icon class="text-muted-foreground" />
            <span class="flex-1">{p.label}</span>
            {#if p.key}{@render keys(p.key)}{/if}
          </Command.Item>
        {/each}
        {#if otherWs}
          <Command.Item value={otherWs.label} onSelect={() => go(otherWs.href)}><ArrowLeftRightIcon class="text-muted-foreground" />{otherWs.label}</Command.Item>
        {/if}
        <Command.Item value="Keyboard shortcuts help" onSelect={() => { commands.palette = false; commands.shortcuts = true; }}>
          <KeyboardIcon class="text-muted-foreground" />
          <span class="flex-1">Keyboard shortcuts</span>
          <Command.Shortcut><Kbd>?</Kbd></Command.Shortcut>
        </Command.Item>
      </Command.Group>
    {/if}
  </Command.List>
  <div class="flex gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
    <span class="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
    <span class="flex items-center gap-1.5"><Kbd>↵</Kbd> {picked ? "run" : "open"}</span>
    {#if picked}<span class="flex items-center gap-1.5"><Kbd>⌫</Kbd> back</span>{/if}
    <span class="ml-auto flex items-center gap-1.5"><Kbd>Esc</Kbd> close</span>
  </div>
</Command.Dialog>

<Dialog.Root bind:open={commands.shortcuts}>
  <Dialog.Content class="sm:max-w-[600px]">
    <Dialog.Header><Dialog.Title>Keyboard shortcuts</Dialog.Title></Dialog.Header>
    <div class="grid gap-5 text-[13px] sm:grid-cols-2">
      <dl class="flex flex-col gap-2">
        <dt class="text-[11px] tracking-wider text-muted-foreground uppercase">Anywhere</dt>
        <div class="flex justify-between"><dd>Search or jump to</dd><span class="flex gap-1"><Kbd>{modKey}</Kbd><Kbd>K</Kbd></span></div>
        <div class="flex justify-between"><dd>This list</dd><Kbd>?</Kbd></div>
        <dt class="mt-2 text-[11px] tracking-wider text-muted-foreground uppercase">On a row with ⋯</dt>
        <div class="flex justify-between"><dd>Its menu</dd><span class="text-muted-foreground">Right-click</span></div>
      </dl>
      <dl class="flex flex-col gap-2">
        <dt class="text-[11px] tracking-wider text-muted-foreground uppercase">Go to</dt>
        {#each pages.filter((p) => p.key) as p (p.href)}
          <div class="flex justify-between"><dd>{p.label}</dd><span class="flex gap-1"><Kbd>G</Kbd><Kbd>{p.key}</Kbd></span></div>
        {/each}
      </dl>
    </div>
    <p class="text-xs text-muted-foreground">Keys don't work while you're typing in a box.</p>
  </Dialog.Content>
</Dialog.Root>
