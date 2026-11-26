<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Loader2, Search, PenSquare, Settings2, Check } from "lucide-svelte";
  import { onMount } from "svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { discoverApi, socialApi, type ApiPost, type DiscoverPost, type SocialSettings } from "@logit/core/api/socialApi";
  import { caughtUpIndex } from "@logit/core/domain/socialFeed";
  import PeopleStrip from "$lib/components/social/PeopleStrip.svelte";
  import FriendsRow from "$lib/components/social/FriendsRow.svelte";
  import ConnectAccountPrompt from "$lib/components/ConnectAccountPrompt.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import UserSearchSheet from "$lib/components/UserSearchSheet.svelte";
  import { unreadNotifications } from "$lib/stores/notifications.store";


  let posts = $state<ApiPost[]>([]);
  // One status instead of three loading flags: the flags let a refresh and a "load more" run at
  // once, and whichever finished first cleared all three, so the next page could be fetched
  // twice or an old page appended to a freshly refreshed feed.
  type FeedStatus = "loading" | "ready" | "refreshing" | "more" | "error";
  let status = $state<FeedStatus>("loading");
  const loading = $derived(status === "loading");
  const refreshing = $derived(status === "refreshing");
  const loadingMore = $derived(status === "more");
  const error = $derived(status === "error" ? "Couldn't load the feed. Check your connection." : null);
  // Bumped by every load; a response for an older request is dropped.
  let latestRequest = 0;
  let nextCursor = $state<string | null>(null);
  let showConnectPrompt = $state(false);
  let showCreatePost = $state(false);
  let showSearch = $state(false);
  let commentPost = $state<ApiPost | null>(null);
  let sentinel = $state<HTMLDivElement | null>(null);

  // Following (people you follow, newest first, then "You're all caught up" and suggested
  // posts) or Discover (picked by the server's Discover service).
  type Tab = "following" | "discover";
  const tab = $derived<Tab>(page.url.searchParams.get("tab") === "discover" ? "discover" : "following");
  function setTab(t: Tab) {
    void goto(t === "discover" ? "/social?tab=discover" : "/social", { replaceState: true, noScroll: true, keepFocus: true });
  }

  let settings = $state<SocialSettings | null>(null);
  async function answerDiscover(show: boolean) {
    try {
      settings = await socialApi.updateSettings({ showInDiscover: show });
    } catch {
      // the card stays; they can answer again
    }
  }

  // After the divider: a few suggested posts, and older posts from people you follow on request.
  let suggested = $state<DiscoverPost[] | null>(null);
  let showOlder = $state(false);
  const caughtUp = $derived(status === "ready" || status === "more" ? caughtUpIndex(posts, !!nextCursor, Date.now()) : null);
  const newPosts = $derived(caughtUp === null ? posts : posts.slice(0, caughtUp));
  const olderPosts = $derived(caughtUp === null ? [] : posts.slice(caughtUp));

  $effect(() => {
    if (tab !== "following" || caughtUp === null || suggested !== null) return;
    const seen = new Set(posts.flatMap((p) => [p.id, p.repostOf?.id].filter(Boolean)));
    void discoverApi.posts(8)
      .then((r) => (suggested = r.items.filter((d) => !seen.has(d.post.id)).slice(0, 5)))
      .catch(() => (suggested = []));
  });

  // Discover tab.
  let disc = $state<DiscoverPost[]>([]);
  let discCursor = $state<string | null>(null);
  let discStatus = $state<"idle" | "loading" | "ready" | "more" | "error">("idle");
  let discSentinel = $state<HTMLDivElement | null>(null);

  async function loadDiscover(mode: "initial" | "refresh" | "more" = "initial") {
    if (mode === "more" && (discStatus !== "ready" || !discCursor)) return;
    discStatus = mode === "more" ? "more" : "loading";
    try {
      const r = await discoverApi.posts(20, mode === "more" ? discCursor ?? undefined : undefined);
      // Pages are ranked, so a post can move between pages as likes come in: skip repeats.
      const shown = new Set(disc.map((d) => d.post.id));
      disc = mode === "more" ? [...disc, ...r.items.filter((d) => !shown.has(d.post.id))] : r.items;
      discCursor = r.nextCursor;
      discStatus = "ready";
    } catch {
      discStatus = mode === "more" ? "ready" : "error";
    }
  }

  $effect(() => {
    if (tab === "discover" && discStatus === "idle" && authStore.isAuthenticated) void loadDiscover();
  });

  $effect(() => {
    if (tab !== "discover" || !discSentinel || discStatus !== "ready" || !discCursor) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) void loadDiscover("more"); }, { rootMargin: "600px" });
    io.observe(discSentinel);
    return () => io.disconnect();
  });

  function onDiscChange(id: string, next: ApiPost | null) {
    disc = next ? disc.map((d) => (d.post.id === id ? { ...d, post: next } : d)) : disc.filter((d) => d.post.id !== id);
  }
  function onSuggestedChange(id: string, next: ApiPost | null) {
    suggested = (suggested ?? []).flatMap((d) => (d.post.id === id ? (next ? [{ ...d, post: next }] : []) : [d]));
  }

  // Pull-to-refresh: `refreshing` above was already scaffolded (drives the spinner) but nothing
  // ever called load("refresh") — this action wires up the actual gesture.
  let pullDist = $state(0);
  let dragging = $state(false);
  const PULL_THRESHOLD = 60;
  const PULL_MAX = 80;

  function pullToRefresh(node: HTMLElement) {
    let startY = 0;
    let tracking = false;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1 || refreshing) return;
      // Only arm at the top of the actual scroll container (src/routes/+layout.svelte's
      // <main>, not this page's own div) — otherwise a mid-scroll drag would fire it.
      const mainEl = node.closest("main");
      if (!mainEl || mainEl.scrollTop > 0) return;
      startY = e.touches[0]!.clientY;
      tracking = true;
      dragging = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0) { pullDist = 0; return; }
      e.preventDefault();
      pullDist = Math.min(dy * 0.5, PULL_MAX);
    }

    function onTouchEnd() {
      if (!tracking) return;
      tracking = false;
      dragging = false;
      if (pullDist > PULL_THRESHOLD) {
        if (tab === "discover") void loadDiscover("refresh");
        else { suggested = null; showOlder = false; void load("refresh"); }
      }
      pullDist = 0;
    }

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd);
    node.addEventListener("touchcancel", onTouchEnd);

    return {
      destroy() {
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("touchend", onTouchEnd);
        node.removeEventListener("touchcancel", onTouchEnd);
      },
    };
  }

  async function load(mode: "initial" | "refresh" | "more" = "initial") {
    if (!authStore.isAuthenticated) return;
    // "More" only continues a settled feed. A refresh or retry always wins: it bumps the
    // request number, so a "more" still in flight is ignored when it lands.
    if (mode === "more" && (status !== "ready" || !nextCursor)) return;
    const request = ++latestRequest;
    status = mode === "initial" ? "loading" : mode === "refresh" ? "refreshing" : "more";
    try {
      const page = await socialApi.getFeed(20, mode === "more" ? nextCursor ?? undefined : undefined);
      if (request !== latestRequest) return;
      posts = mode === "more" ? [...posts, ...page.posts] : page.posts;
      nextCursor = page.nextCursor;
      status = "ready";
    } catch {
      if (request !== latestRequest) return;
      // A failed "more" keeps what's already shown; scrolling retries it.
      status = mode === "more" ? "ready" : "error";
    }
  }

  let started = false;
  $effect(() => {
    if (!authStore.ready || started) return;
    started = true;
    if (!authStore.isAuthenticated) {
      status = "ready";
      return;
    }
    void load("initial");
    void socialApi.getSettings().then((s) => (settings = s)).catch(() => {});
    // The bell/nav badge otherwise only updates on a 60s poll or app-visibility change — stale
    // if a notification arrived while already elsewhere in the app (see
    // docs/bugs/social-smoke-test-findings.md #2).
    void unreadNotifications.refresh();
  });

  // Infinite scroll. Re-created each time the feed settles: a new observer reports straight
  // away, so a sentinel that stayed on screen through a load still asks for the next page.
  $effect(() => {
    if (tab !== "following" || !sentinel || status !== "ready" || !nextCursor) return;
    if (caughtUp !== null && !showOlder) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) void load("more");
    }, { rootMargin: "600px" });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function onPostChange(id: string, next: ApiPost | null) {
    posts = next ? posts.map((p) => (p.id === id ? next : p)) : posts.filter((p) => p.id !== id);
  }
</script>

<div class="flex flex-col min-h-full">
  <!-- Header -->
  <PageHeader>
    <h1 class="page-title">Feed</h1>
    {#if authStore.isAuthenticated}
      <button type="button" class="p-2 text-muted-foreground" aria-label="Search people and groups" onclick={() => (showSearch = true)}>
        <Search class="h-[1.15rem] w-[1.15rem]" />
      </button>
      <button type="button" class="p-2 text-muted-foreground" aria-label="Privacy" onclick={() => goto("/settings/privacy")}>
        <Settings2 class="h-[1.15rem] w-[1.15rem]" />
      </button>
      <button type="button" class="p-2 text-muted-foreground" aria-label="New post" onclick={() => (showCreatePost = true)}>
        <PenSquare class="h-[1.15rem] w-[1.15rem]" />
      </button>
    {/if}
  </PageHeader>

  {#if !authStore.ready || (loading && authStore.isAuthenticated)}
    <div class="flex justify-center py-20"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>

  {:else if !authStore.isAuthenticated}
    <div class="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center flex-1">
      <p class="text-sm text-muted-foreground">Sign in to see posts from people you follow.</p>
      <div class="flex gap-2">
        <button type="button" class="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium" onclick={() => goto("/auth?mode=login&redirect=/social")}>Log in</button>
        <button type="button" class="px-4 py-2 rounded-md border border-border text-sm" onclick={() => goto("/auth?mode=register&redirect=/social")}>Sign up</button>
      </div>
    </div>

  {:else}
    <FriendsRow />
    <div class="px-4 pb-2.5">
      <div role="tablist" aria-label="Feed" class="grid grid-cols-2 gap-[3px] rounded-[10px] bg-muted p-[3px]">
        <button type="button" role="tab" aria-selected={tab === "following"} onclick={() => setTab("following")}
          class="h-[34px] rounded-lg text-sm {tab === 'following' ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'}">Following</button>
        <button type="button" role="tab" aria-selected={tab === "discover"} onclick={() => setTab("discover")}
          class="h-[34px] rounded-lg text-sm {tab === 'discover' ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'}">Discover</button>
      </div>
    </div>

    {#if settings && settings.showInDiscover === null && !settings.isPrivate}
      <div class="mx-4 mb-3 flex flex-col gap-2 rounded-xl border border-sky-500/40 bg-sky-500/5 p-3.5">
        <p class="text-sm font-semibold">Discover is here</p>
        <p class="text-xs leading-relaxed text-muted-foreground">People who don't follow you yet can find posts in Discover. Should yours be there? Your followers see them either way. You can change this in Social settings.</p>
        <div class="flex gap-2">
          <button type="button" class="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground" onclick={() => answerDiscover(true)}>Yes, show my posts</button>
          <button type="button" class="h-9 rounded-md border border-border px-3 text-xs" onclick={() => answerDiscover(false)}>No, followers only</button>
        </div>
      </div>
    {/if}

    <div use:pullToRefresh>
      <!-- No transform here (not even translateY(0)) — a CSS transform on this wrapper would
           make it the containing block for every `position: fixed` descendant (PostCard's
           overflow menu, its confirm dialogs, ReportSheet, …), anchoring them to this div's
           box instead of the viewport. The height-animated box below already pushes the list
           down through normal layout, which is all the rubber-band effect needs. -->
      <div
        class="flex justify-center overflow-hidden"
        style="height: {refreshing || (tab === 'discover' && discStatus === 'loading' && disc.length > 0) ? 40 : pullDist}px; transition: {dragging ? 'none' : 'height 200ms ease-out'};"
      >
        <Loader2
          class="h-4 w-4 my-2 text-muted-foreground {refreshing ? 'animate-spin' : ''}"
          style="opacity: {refreshing ? 1 : Math.min(pullDist / PULL_THRESHOLD, 1)};"
        />
      </div>

      {#if tab === "following"}
        {#if error}
          <div class="flex flex-col items-center gap-3 py-20 text-center px-6">
            <p class="text-sm text-muted-foreground">{error}</p>
            <button type="button" class="text-sm text-primary" onclick={() => load("initial")}>Try again</button>
          </div>
        {:else}
          <div class="divide-y divide-border">
            {#each newPosts as post (post.id)}
              <PostCard {post} onopencomments={(p) => (commentPost = p)} onchange={(next) => onPostChange(post.id, next)} />
            {/each}
          </div>

          {#if caughtUp !== null}
            <div class="flex flex-col items-center gap-1 border-t border-border px-6 pt-6 pb-3 text-center">
              <span aria-hidden="true" class="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-emerald-500 text-emerald-500"><Check class="h-3.5 w-3.5" /></span>
              {#if posts.length === 0}
                <p class="text-sm font-semibold">Your feed is empty</p>
                <p class="text-xs text-muted-foreground">Follow people to see their workouts and posts here. Some suggestions below.</p>
              {:else}
                <p class="text-sm font-semibold">You're all caught up</p>
                <p class="text-xs text-muted-foreground">{newPosts.length ? "You've seen every new post from people you follow." : "No new posts from people you follow."} Suggested posts below.</p>
              {/if}
            </div>
            {#if posts.length === 0}<PeopleStrip />{/if}
            <div class="divide-y divide-border border-t border-border">
              {#each suggested ?? [] as s (s.post.id)}
                <PostCard post={s.post} reason={s.reason} suggested follow onopencomments={(p) => (commentPost = p)} onchange={(next) => onSuggestedChange(s.post.id, next)} />
              {/each}
            </div>
            <div class="flex flex-wrap justify-center gap-2 px-4 py-4">
              <button type="button" class="h-9 rounded-md border border-border px-3 text-xs" onclick={() => setTab("discover")}>See more in Discover</button>
              {#if olderPosts.length && !showOlder}
                <button type="button" class="h-9 rounded-md border border-border px-3 text-xs" onclick={() => (showOlder = true)}>Show older posts</button>
              {/if}
            </div>
            {#if showOlder}
              <p class="border-t border-border px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Older posts</p>
              <div class="divide-y divide-border">
                {#each olderPosts as post (post.id)}
                  <PostCard {post} onopencomments={(p) => (commentPost = p)} onchange={(next) => onPostChange(post.id, next)} />
                {/each}
              </div>
            {/if}
          {/if}

          <div bind:this={sentinel} class="h-px"></div>
          {#if loadingMore}
            <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
          {/if}
        {/if}

      {:else}
        <PeopleStrip />
        {#if discStatus === "idle" || (discStatus === "loading" && disc.length === 0)}
          <div class="flex justify-center py-16"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
        {:else if discStatus === "error"}
          <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
            <p class="text-sm text-muted-foreground">Couldn't load Discover. Check your connection.</p>
            <button type="button" class="text-sm text-primary" onclick={() => loadDiscover()}>Try again</button>
          </div>
        {:else if disc.length === 0}
          <p class="px-6 py-16 text-center text-sm text-muted-foreground">Nothing to suggest yet. As more people post, they'll show up here.</p>
        {:else}
          <div class="divide-y divide-border border-t border-border">
            {#each disc as d (d.post.id)}
              <PostCard post={d.post} reason={d.reason} follow onopencomments={(p) => (commentPost = p)} onchange={(next) => onDiscChange(d.post.id, next)} />
            {/each}
          </div>
          <div bind:this={discSentinel} class="h-px"></div>
          {#if discStatus === "more"}
            <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<ConnectAccountPrompt open={showConnectPrompt} feature="The social feed" onclose={() => { showConnectPrompt = false; }} />

<CreatePostSheet
  open={showCreatePost}
  onposted={(post) => { posts = [post, ...posts]; }}
  onclose={() => (showCreatePost = false)}
/>

<UserSearchSheet open={showSearch} onclose={() => (showSearch = false)} />

<CommentSheet
  post={commentPost}
  onclose={() => (commentPost = null)}
  oncommentcountchange={(id, delta) => {
    posts = posts.map((p) => (p.id === id ? { ...p, commentCount: p.commentCount + delta } : p));
  }}
/>
