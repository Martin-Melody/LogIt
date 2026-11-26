<!-- Social's search: People, Groups (design canvas G12) and Events (V1). Groups lists findable groups
     by name or place (invite-only ones never show); tapping one opens its join screen, or its page
     if you're in. Events: upcoming events in findable groups by place or name, sport, kind and when. -->
<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { toast } from "svelte-sonner";
  import { fade } from "svelte/transition";
  import { sheetUp } from "$lib/transitions";
  import { backDismiss, sheetDrag } from "$lib/components/sheet/sheet";
  import { goto } from "$app/navigation";
  import { X, Search, UserPlus, UserCheck, Link2 } from "lucide-svelte";
  import { openInvite } from "$lib/features/friends/invite.svelte";
  import { socialApi, type UserSearchResult } from "@logit/core/api/socialApi";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { groupsApi, type GroupSearchResult } from "@logit/core/api/groupsApi";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import { ChevronDown, Circle, CircleCheck } from "lucide-svelte";
  import { EVENT_KINDS, EVENT_SPORTS, eventsApi, type EventKind, type EventSport, type GroupEvent } from "@logit/core/api/eventsApi";
  import { dayBadge, eventShort } from "$lib/features/groups/eventTime";
  import { forumApi, normalizeTag, type ForumPost } from "@logit/core/api/forumApi";
  import { Hash } from "lucide-svelte";
  import PostRow from "$lib/components/social/PostRow.svelte";

  const { open, onclose } = $props<{
    open: boolean;
    onclose: () => void;
  }>();

  let query = $state("");
  let tab = $state<"people" | "groups" | "events" | "posts">("people");
  let posts = $state<ForumPost[]>([]);
  // "#sligo" (or a single word) offers that tag's page (canvas F4).
  const tagHit = $derived(normalizeTag(query));
  let postsLoaded = $state(false);
  async function searchPosts() {
    const q = query.trim();
    if (q.length < 2) { posts = []; postsLoaded = false; return; }
    posts = await forumApi.search(q).catch(() => []);
    postsLoaded = true;
  }
  $effect(() => {
    if (tab === "posts") void searchPosts();
  });
  let events = $state<GroupEvent[]>([]);
  let eventsLoaded = $state(false);
  let sport = $state<EventSport | null>(null);
  let kind = $state<EventKind | null>(null);
  type When = "any" | "week" | "weekend" | "month";
  let when = $state<When>("any");
  let picking = $state<"sport" | "kind" | "when" | null>(null);
  const WHEN: Record<When, string> = { any: "Any time", week: "This week", weekend: "This weekend", month: "This month" };

  function range(w: When): { from: Date | null; to: Date | null } {
    const now = new Date();
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (w === "week") return { from: null, to: new Date(day.getTime() + (8 - (day.getDay() || 7)) * 86_400_000) }; // to the end of Sunday
    if (w === "weekend") {
      const sat = new Date(day.getTime() + ((6 - day.getDay() + 7) % 7) * 86_400_000);
      return { from: day.getDay() === 0 ? null : sat, to: new Date((day.getDay() === 0 ? day : sat).getTime() + (day.getDay() === 0 ? 1 : 2) * 86_400_000) };
    }
    if (w === "month") return { from: null, to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    return { from: null, to: null };
  }

  async function searchEvents() {
    const q = query.trim();
    if (q.length < 2 && !sport && !kind) {
      events = [];
      eventsLoaded = false;
      return;
    }
    try {
      events = await eventsApi.search({ q, sport, kind, ...range(when) });
    } catch {
      events = [];
    }
    eventsLoaded = true;
  }
  $effect(() => {
    void [sport, kind, when, tab];
    if (tab === "events") void searchEvents();
  });

  const eventAction = (e: GroupEvent) =>
    e.member ? (e.answer === true ? "Going" : "Open") : e.requested ? "Requested" : e.groupAccess === "Open" ? "Join group to go" : "Ask to join";
  const opt = (label: string, on: boolean, pick: () => void) => ({ icon: on ? CircleCheck : Circle, label, onSelect: () => void pick() });
  const pickItems = $derived(
    picking === "sport"
      ? [opt("Any sport", !sport, () => (sport = null)), ...EVENT_SPORTS.map((x) => opt(x, sport === x, () => (sport = x)))]
      : picking === "kind"
        ? [opt("Any kind", !kind, () => (kind = null)), ...EVENT_KINDS.map((x) => opt(x, kind === x, () => (kind = x)))]
        : (Object.keys(WHEN) as When[]).map((w) => opt(WHEN[w], when === w, () => (when = w))),
  );
  let groups = $state<GroupSearchResult[]>([]);
  let results = $state<UserSearchResult[]>([]);
  let loading = $state(false);
  let searched = $state(false);
  let followingIds = $state<Set<string>>(new Set());
  let togglingId = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    if (open) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  $effect(() => {
    if (open) {
      query = "";
      tab = "people";
      groups = [];
      events = [];
      eventsLoaded = false;
      results = [];
      searched = false;
      followingIds = new Set();
      // Focus input after the sheet animates in
      setTimeout(() => inputEl?.focus(), 80);
    }
  });

  function onInput() {
    clearTimeout(debounceTimer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      groups = [];
      searched = false;
      if (tab === "events") void searchEvents();
      return;
    }
    debounceTimer = setTimeout(() => { void search(q); if (tab === "events") void searchEvents(); if (tab === "posts") void searchPosts(); }, 250);
  }

  async function search(q: string) {
    loading = true;
    searched = false;
    try {
      const [res, found] = await Promise.all([socialApi.searchUsers(q), groupsApi.search(q).catch(() => [])]);
      results = res;
      groups = found;
      // Seed local follow state from server response
      followingIds = new Set(res.filter((u) => u.isFollowing).map((u) => u.id));
      requestedIds = new Set(res.filter((u) => u.isRequested).map((u) => u.id));
      searched = true;
    } catch {
      results = [];
      searched = true;
    } finally {
      loading = false;
    }
  }

  // Private accounts you asked to follow (search results don't say; this session only).
  let requestedIds = $state(new Set<string>());

  async function toggleFollow(user: UserSearchResult) {
    if (togglingId === user.id) return;
    togglingId = user.id;
    const wasFollowing = followingIds.has(user.id);
    const wasRequested = requestedIds.has(user.id);
    try {
      if (wasFollowing || wasRequested) {
        await socialApi.unfollow(user.username);
        followingIds = new Set([...followingIds].filter((id) => id !== user.id));
        requestedIds = new Set([...requestedIds].filter((id) => id !== user.id));
      } else {
        const status = await socialApi.follow(user.username);
        if (status === "requested") requestedIds = new Set([...requestedIds, user.id]);
        else followingIds = new Set([...followingIds, user.id]);
      }
    } catch {
      toast.error("Couldn't do that. Try again.");
    } finally {
      togglingId = null;
    }
  }

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function openProfile(username: string) {
    onclose();
    void goto(`/social/${username}`);
  }

  function openGroup(g: GroupSearchResult) {
    onclose();
    void goto(g.state === "member" ? `/groups/${g.id}` : `/groups/join?id=${g.id}`);
  }

  const groupAction = (g: GroupSearchResult) =>
    g.state === "member" ? "Open" : g.state === "requested" ? "Requested" : g.state === "invited" || g.access === "Open" ? "Join" : "Ask to join";
</script>

<ActionSheet open={!!picking} onOpenChange={(v) => { if (!v) picking = null; }} title={picking === "sport" ? "Sport" : picking === "kind" ? "Kind" : "When"} items={pickItems} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-black/50"
    role="presentation"
    onclick={onclose}
    transition:fade={{ duration: 150 }}
  ></div>

  <!-- Sheet -->
  <div
    class="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background border-t border-border rounded-t-xl max-h-[90dvh]"
    use:sheetDrag={{ onDismiss: onclose }} use:backDismiss={onclose}
    transition:sheetUp
  >
    <!-- Handle -->
    <div class="flex justify-center pt-2.5 pb-1 shrink-0">
      <div data-sheet-bar class="h-1 w-10 rounded-full bg-muted-foreground/20"></div>
    </div>

    <!-- Search bar -->
    <div class="flex items-center gap-2 px-3 pb-3 pt-1 border-b border-border shrink-0">
      <Search class="h-4 w-4 text-muted-foreground shrink-0" />
      <input
        bind:this={inputEl}
        bind:value={query}
        oninput={onInput}
        type="search"
        placeholder={tab === "posts" ? "Search the Forum, or #tags…" : tab === "events" ? "Search events by place or name…" : tab === "groups" ? "Search groups by name or place…" : "Search by username or name…"}
        class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {#if loading}
        <Spinner class="h-4 w-4 text-muted-foreground shrink-0" />
      {/if}
      <button type="button" class="p-1 text-muted-foreground" onclick={onclose}>
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="shrink-0 px-3 pt-2.5">
      <Tabs.Root bind:value={tab}>
        <Tabs.List aria-label="Search for">
          <Tabs.Trigger value="people">People</Tabs.Trigger>
          <Tabs.Trigger value="groups">Groups</Tabs.Trigger>
          <Tabs.Trigger value="events">Events</Tabs.Trigger>
          <Tabs.Trigger value="posts">Forum</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
    </div>

    <!-- Results -->
    <div class="overflow-y-auto flex-1">
      {#if tab === "posts"}
        {#if tagHit}
          <a href="/social/tag/{encodeURIComponent(tagHit)}" onclick={onclose} class="flex min-h-14 items-center gap-3 border-b border-border px-4 text-inherit no-underline">
            <span class="flex size-10 items-center justify-center rounded-xl bg-muted text-sky-700 dark:text-sky-300"><Hash class="size-5" /></span>
            <span class="flex flex-col"><span class="text-[15px] font-semibold">#{tagHit}</span><span class="text-[12px] text-muted-foreground">Forum posts and posts with this tag</span></span>
          </a>
        {/if}
        {#if !postsLoaded}
          <p class="px-6 py-10 text-center text-sm text-muted-foreground">Search questions, form checks and advice in groups anyone can find, and your own groups.</p>
        {:else if posts.length === 0}
          <p class="px-6 py-10 text-center text-sm text-muted-foreground">No posts found for "<span class="text-foreground">{query.trim()}</span>".</p>
        {:else}
          <div class="pb-8" role="presentation" onclick={onclose}>{#each posts as p (p.id)}<PostRow post={p} />{/each}</div>
        {/if}
      {:else if tab === "events"}
        <div class="flex gap-2 overflow-x-auto px-3 py-2.5">
          {#each [["sport", sport ?? "Any sport", !!sport], ["kind", kind ?? "Any kind", !!kind], ["when", WHEN[when], when !== "any"]] as [key, label, on] (key)}
            <button type="button" onclick={() => (picking = key as "sport" | "kind" | "when")}
              class="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] {on ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border font-medium'}">{label}<ChevronDown class="size-3.5" /></button>
          {/each}
        </div>
        {#if !eventsLoaded}
          <p class="px-6 py-8 text-center text-sm text-muted-foreground">Find sessions, meets and races by a place ("Sligo") or a name, or pick a sport. Events in invite-only groups don't show here.</p>
        {:else if events.length === 0}
          <p class="px-6 py-10 text-center text-sm text-muted-foreground">No upcoming events found. Try another place, or fewer filters.</p>
        {:else}
          <ul class="divide-y divide-border pb-8">
            {#each events as e (e.id)}
              {@const badge = dayBadge(e.startsAtMs)}
              {@const action = eventAction(e)}
              <li>
                <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" onclick={() => { onclose(); void goto(`/events/${e.id}`); }}>
                  <span class="flex w-11 shrink-0 flex-col items-center tabular-nums"><span class="text-xl font-bold leading-tight">{badge.day}</span><span class="text-[12px] text-muted-foreground">{badge.month}</span></span>
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate text-sm font-semibold">{e.title}</span>
                    <span class="truncate text-xs text-muted-foreground">{[eventShort(e.startsAtMs), e.kind === "Session" ? null : e.kind, e.sport, e.repeats].filter(Boolean).join(" · ")}</span>
                    <span class="truncate text-xs text-muted-foreground">{[e.groupName, e.place ?? e.groupPlace].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span class="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold {action === 'Join group to go' || action === 'Ask to join' ? 'bg-primary text-primary-foreground' : 'border border-border'}">{action}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if tab === "groups"}
        {#if !searched || query.trim().length < 2}
          <p class="px-6 py-10 text-center text-sm text-muted-foreground">Find a gym, club or team by its name or where it is. Groups that are invite only don't show here.</p>
        {:else if groups.length === 0}
          <p class="px-6 py-12 text-center text-sm text-muted-foreground">No groups found for "<span class="text-foreground">{query.trim()}</span>". A member can invite you, or start one from Messages.</p>
        {:else}
          <ul class="divide-y divide-border pb-8">
            {#each groups as g (g.id)}
              {@const action = groupAction(g)}
              <li>
                <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" onclick={() => openGroup(g)}>
                  <GroupAvatar name={g.name} src={g.photoUrl} size={44} />
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-sm font-semibold">{g.name}</span>
                    <span class="truncate text-xs text-muted-foreground">{[g.kind, g.place, `${g.members} ${g.members === 1 ? "member" : "members"}`, g.followed ? `${g.followed} is a member` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span class="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold {action === 'Open' || action === 'Requested' ? 'border border-border' : 'bg-primary text-primary-foreground'}">{action}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if !searched && query.trim().length < 2}
        <div class="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <p class="text-sm text-muted-foreground">Search for people by username or display name.</p>
          <button type="button" class="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium" onclick={() => { onclose(); openInvite(); }}>
            <Link2 class="size-4" />Invite a friend
          </button>
        </div>

      {:else if searched && results.length === 0}
        <p class="text-sm text-muted-foreground text-center py-12 px-6">
          No users found for "<span class="text-foreground">{query.trim()}</span>".
        </p>

      {:else}
        <ul class="divide-y divide-border pb-8">
          {#each results as user (user.id)}
            {@const isFollowing = followingIds.has(user.id)}
            {@const isRequested = requestedIds.has(user.id)}
            <li class="flex items-center gap-3 px-4 py-3">
              <!-- Avatar (tappable → profile) -->
              <button
                type="button"
                class="h-11 w-11 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden"
                onclick={() => openProfile(user.username)}
              >
                {#if user.avatarUrl}
                  <img src={photoSrc(user.avatarUrl)} alt={user.displayName} class="h-full w-full object-cover" />
                {:else}
                  {initials(user.displayName)}
                {/if}
              </button>

              <!-- Name + username (tappable → profile) -->
              <button
                type="button"
                class="flex-1 min-w-0 text-left"
                onclick={() => openProfile(user.username)}
              >
                <p class="text-sm font-medium truncate leading-tight">{user.displayName}</p>
                <p class="text-xs text-muted-foreground">@{user.username} · {user.followerCount} follower{user.followerCount === 1 ? "" : "s"}</p>
              </button>

              <!-- Follow / Following -->
              <button
                type="button"
                class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50
                  {isFollowing || isRequested
                    ? 'border border-border text-foreground bg-background hover:bg-muted/40'
                    : 'bg-primary text-primary-foreground'}"
                disabled={togglingId === user.id}
                onclick={() => void toggleFollow(user)}
              >
                {#if togglingId === user.id}
                  <Spinner class="h-3 w-3" />
                {:else if isFollowing}
                  <UserCheck class="h-3 w-3" /> Following
                {:else if isRequested}
                  Requested
                {:else}
                  <UserPlus class="h-3 w-3" /> {user.followsYou ? "Follow back" : "Follow"}
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
