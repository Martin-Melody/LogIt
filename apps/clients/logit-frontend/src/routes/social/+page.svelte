<script lang="ts">
  import { goto } from "$app/navigation";
  import { Loader2, Search, PenSquare, Bell } from "lucide-svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiPost } from "@logit/core/api/socialApi";
  import ConnectAccountPrompt from "$lib/components/ConnectAccountPrompt.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import UserSearchSheet from "$lib/components/UserSearchSheet.svelte";
  import { unreadNotifications } from "$lib/stores/notifications.store";

  let posts = $state<ApiPost[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let showConnectPrompt = $state(false);
  let showCreatePost = $state(false);
  let showSearch = $state(false);
  let commentPost = $state<ApiPost | null>(null);
  let sentinel = $state<HTMLDivElement | null>(null);

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
      if (pullDist > PULL_THRESHOLD) void load("refresh");
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
    if (mode === "initial") loading = true;
    else if (mode === "refresh") refreshing = true;
    else loadingMore = true;
    error = null;
    try {
      const page = await socialApi.getFeed(20, mode === "more" ? nextCursor ?? undefined : undefined);
      posts = mode === "more" ? [...posts, ...page.posts] : page.posts;
      nextCursor = page.nextCursor;
    } catch {
      if (mode !== "more") error = "Couldn't load the feed. Check your connection.";
    } finally {
      loading = false;
      refreshing = false;
      loadingMore = false;
    }
  }

  let started = false;
  $effect(() => {
    if (!authStore.ready || started) return;
    started = true;
    if (!authStore.isAuthenticated) {
      loading = false;
      return;
    }
    void load("initial");
    // The bell/nav badge otherwise only updates on a 60s poll or app-visibility change — stale
    // if a notification arrived while already elsewhere in the app (see
    // docs/bugs/social-smoke-test-findings.md #2).
    void unreadNotifications.refresh();
  });

  // Infinite scroll
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore) void load("more");
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
  <header class="flex items-center gap-1 px-3 h-12 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <h1 class="text-base font-semibold flex-1 px-1">Feed</h1>
    {#if authStore.isAuthenticated}
      <button type="button" class="p-2 text-muted-foreground" aria-label="Search people" onclick={() => (showSearch = true)}>
        <Search class="h-[1.15rem] w-[1.15rem]" />
      </button>
      <button type="button" class="p-2 text-muted-foreground relative" aria-label="Notifications" onclick={() => goto("/social/notifications")}>
        <Bell class="h-[1.15rem] w-[1.15rem]" />
        {#if $unreadNotifications > 0}
          <span class="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-semibold text-white flex items-center justify-center">
            {$unreadNotifications > 9 ? "9+" : $unreadNotifications}
          </span>
        {/if}
      </button>
      <button type="button" class="p-2 text-muted-foreground" aria-label="New post" onclick={() => (showCreatePost = true)}>
        <PenSquare class="h-[1.15rem] w-[1.15rem]" />
      </button>
    {/if}
  </header>

  {#if !authStore.ready || (loading && authStore.isAuthenticated)}
    <div class="flex justify-center py-20"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>

  {:else if !authStore.isAuthenticated}
    <div class="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center flex-1">
      <p class="text-sm text-muted-foreground">Sign in to see posts from people you follow.</p>
      <div class="flex gap-2">
        <button type="button" class="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium" onclick={() => goto("/auth?mode=login&redirect=/social")}>Log in</button>
        <button type="button" class="px-4 py-2 rounded border border-border text-sm" onclick={() => goto("/auth?mode=register&redirect=/social")}>Sign up</button>
      </div>
    </div>

  {:else if error}
    <div class="flex flex-col items-center gap-3 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">{error}</p>
      <button type="button" class="text-sm text-primary" onclick={() => load("initial")}>Try again</button>
    </div>

  {:else if posts.length === 0}
    <div class="flex flex-col items-center gap-3 py-20 text-center px-6 flex-1">
      <p class="text-sm font-medium">Your feed is empty</p>
      <p class="text-xs text-muted-foreground">Follow people to see their workouts and posts here.</p>
      <button type="button" class="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground" onclick={() => (showSearch = true)}>
        <Search class="h-3.5 w-3.5" /> Find people
      </button>
    </div>

  {:else}
    <div use:pullToRefresh>
      <!-- No transform here (not even translateY(0)) — a CSS transform on this wrapper would
           make it the containing block for every `position: fixed` descendant (PostCard's
           overflow menu, its confirm dialogs, ReportSheet, …), anchoring them to this div's
           box instead of the viewport. The height-animated box below already pushes the list
           down through normal layout, which is all the rubber-band effect needs. -->
      <div
        class="flex justify-center overflow-hidden"
        style="height: {refreshing ? 40 : pullDist}px; transition: {dragging ? 'none' : 'height 200ms ease-out'};"
      >
        <Loader2
          class="h-4 w-4 my-2 text-muted-foreground {refreshing ? 'animate-spin' : ''}"
          style="opacity: {refreshing ? 1 : Math.min(pullDist / PULL_THRESHOLD, 1)};"
        />
      </div>
      <div class="divide-y divide-border">
        {#each posts as post (post.id)}
          <PostCard {post} onopencomments={(p) => (commentPost = p)} onchange={(next) => onPostChange(post.id, next)} />
        {/each}
      </div>

      <div bind:this={sentinel} class="h-px"></div>
      {#if loadingMore}
        <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
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
