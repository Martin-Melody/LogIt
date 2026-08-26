<script lang="ts">
  import { goto } from "$app/navigation";
  import { ArrowLeft, Loader2, RefreshCw, Dumbbell, Trophy, MessageSquare, Trash2, PenSquare, CalendarDays, Activity, Cpu, LayoutDashboard, Heart, MessageCircle, Pencil, Check, X, Search } from "lucide-svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiPost, type FeedPage } from "@logit/core/api/socialApi";
  import ConnectAccountPrompt from "$lib/components/ConnectAccountPrompt.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import UserSearchSheet from "$lib/components/UserSearchSheet.svelte";
  import { formatDistanceToNow } from "$lib/utils";

  let posts = $state<ApiPost[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let showConnectPrompt = $state(false);
  let deletingId = $state<string | null>(null);
  let pendingDeleteId = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let editDraft = $state("");
  let savingEditId = $state<string | null>(null);
  let showCreatePost = $state(false);
  let showSearch = $state(false);
  let likingId = $state<string | null>(null);
  let commentPost = $state<typeof posts[number] | null>(null);

  async function toggleLike(post: ApiPost) {
    if (!authStore.isAuthenticated) { showConnectPrompt = true; return; }
    if (likingId === post.id) return;
    likingId = post.id;
    const wasLiked = post.isLikedByMe;
    // optimistic update
    posts = posts.map((p) =>
      p.id === post.id
        ? { ...p, isLikedByMe: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) }
        : p,
    );
    try {
      if (wasLiked) await socialApi.unlikePost(post.id);
      else await socialApi.likePost(post.id);
    } catch {
      // revert
      posts = posts.map((p) =>
        p.id === post.id
          ? { ...p, isLikedByMe: wasLiked, likeCount: p.likeCount + (wasLiked ? 1 : -1) }
          : p,
      );
    } finally {
      likingId = null;
    }
  }

  async function load(reset = true) {
    if (!authStore.isAuthenticated) return;
    if (reset) loading = true;
    else loadingMore = true;
    error = null;
    try {
      const page: FeedPage = await socialApi.getFeed(20, reset ? undefined : nextCursor ?? undefined);
      if (reset) posts = page.posts;
      else posts = [...posts, ...page.posts];
      nextCursor = page.nextCursor;
    } catch {
      error = "Couldn't load feed. Check your connection.";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  async function deletePost(id: string) {
    deletingId = id;
    try {
      await socialApi.deletePost(id);
      posts = posts.filter((p) => p.id !== id);
      pendingDeleteId = null;
    } catch {
      // silently ignore
    } finally {
      deletingId = null;
    }
  }

  function startEditPost(post: ApiPost) {
    editingId = post.id;
    editDraft = post.body ?? "";
  }

  async function saveEditPost(post: ApiPost) {
    if (!editDraft.trim() || savingEditId === post.id) return;
    savingEditId = post.id;
    try {
      const updated = await socialApi.editPost(post.id, editDraft.trim());
      posts = posts.map((p) => p.id === post.id ? updated : p);
      editingId = null;
    } catch {
      // keep open
    } finally {
      savingEditId = null;
    }
  }

  let _loadStarted = false;
  $effect(() => {
    if (!authStore.ready) return;
    if (_loadStarted) return;
    _loadStarted = true;
    if (!authStore.isAuthenticated) {
      showConnectPrompt = true;
      loading = false;
      return;
    }
    void load();
  });

  function postIcon(type: ApiPost["type"]) {
    if (type === "WorkoutSession") return Dumbbell;
    if (type === "PersonalRecord") return Trophy;
    if (type === "Split") return CalendarDays;
    if (type === "Exercise") return Activity;
    if (type === "Algorithm") return Cpu;
    if (type === "Widget") return LayoutDashboard;
    return MessageSquare;
  }

  function relativeTime(iso: string) {
    return formatDistanceToNow(new Date(iso));
  }
</script>

<div class="flex flex-col pb-24">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 pt-3 pb-2 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <button type="button" class="p-1 -ml-1 text-muted-foreground" onclick={() => history.back()}>
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-base font-semibold flex-1">Feed</h1>
    {#if authStore.isAuthenticated}
      <button type="button" class="p-1 text-muted-foreground" onclick={() => (showSearch = true)}>
        <Search class="h-4 w-4" />
      </button>
      <button type="button" class="p-1 text-muted-foreground" onclick={() => (showCreatePost = true)}>
        <PenSquare class="h-4 w-4" />
      </button>
      <button type="button" class="p-1 text-muted-foreground" onclick={() => void load()}>
        <RefreshCw class="h-4 w-4" />
      </button>
    {/if}
  </div>

  {#if !authStore.ready || (authStore.ready && !authStore.isAuthenticated && loading)}
    <div class="flex justify-center py-16">
      <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
    </div>

  {:else if !authStore.isAuthenticated}
    <!-- Not logged in state -->
    <div class="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <p class="text-sm text-muted-foreground">Sign in to see posts from people you follow.</p>
      <div class="flex gap-2">
        <button type="button"
          class="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium"
          onclick={() => goto("/auth?mode=login&redirect=/social")}>
          Log in
        </button>
        <button type="button"
          class="px-4 py-2 rounded border border-border text-sm"
          onclick={() => goto("/auth?mode=register&redirect=/social")}>
          Sign up
        </button>
      </div>
    </div>

  {:else if loading}
    <div class="flex justify-center py-16">
      <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
    </div>

  {:else if error}
    <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
      <p class="text-sm text-muted-foreground">{error}</p>
      <button type="button" class="text-sm text-primary" onclick={() => void load()}>Try again</button>
    </div>

  {:else if posts.length === 0}
    <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
      <p class="text-sm font-medium">Nothing here yet</p>
      <p class="text-xs text-muted-foreground">Follow some people to see their workouts and posts here.</p>
      <button
        type="button"
        class="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
        onclick={() => (showSearch = true)}
      >
        <Search class="h-3.5 w-3.5" /> Find people to follow
      </button>
    </div>

  {:else}
    <ul class="flex flex-col divide-y divide-border">
      {#each posts as post (post.id)}
        {@const Icon = postIcon(post.type)}
        <li class="px-4 py-3 flex flex-col gap-2">
          <!-- Author row -->
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden"
              onclick={() => void goto(`/social/${post.authorUsername}`)}
            >
              {#if post.authorAvatarUrl}
                <img src={post.authorAvatarUrl} alt={post.authorDisplayName} class="h-full w-full object-cover" />
              {:else}
                {post.authorDisplayName.charAt(0).toUpperCase()}
              {/if}
            </button>
            <button
              type="button"
              class="flex-1 min-w-0 text-left"
              onclick={() => void goto(`/social/${post.authorUsername}`)}
            >
              <p class="text-sm font-medium leading-none">{post.authorDisplayName}</p>
              <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span class="text-xs text-muted-foreground">@{post.authorUsername} · {relativeTime(post.createdAt)}</span>
                {#if post.editedAt}<span class="text-[10px] text-muted-foreground/60 italic">edited</span>{/if}
              </div>
            </button>
            <div class="flex items-center gap-2 shrink-0">
              <Icon class="h-3.5 w-3.5 text-muted-foreground" />
              {#if post.authorId === authStore.user?.id}
                {#if pendingDeleteId === post.id}
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs text-muted-foreground">Delete?</span>
                    <button type="button"
                      class="text-xs text-destructive font-medium disabled:opacity-40"
                      disabled={deletingId === post.id}
                      onclick={() => void deletePost(post.id)}>
                      {#if deletingId === post.id}<Loader2 class="h-3 w-3 animate-spin" />{:else}Yes{/if}
                    </button>
                    <button type="button" class="text-xs text-muted-foreground"
                      onclick={() => (pendingDeleteId = null)}>No</button>
                  </div>
                {:else if editingId !== post.id}
                  <button type="button"
                    class="text-muted-foreground/60 hover:text-foreground transition-colors"
                    onclick={() => startEditPost(post)}>
                    <Pencil class="h-3.5 w-3.5" />
                  </button>
                  <button type="button"
                    class="text-muted-foreground/60 hover:text-destructive transition-colors"
                    onclick={() => (pendingDeleteId = post.id)}>
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                {/if}
              {/if}
            </div>
          </div>

          <!-- Body / inline edit -->
          {#if editingId === post.id}
            <div class="flex items-end gap-2">
              <textarea
                bind:value={editDraft}
                rows={2}
                class="flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEditPost(post); } if (e.key === "Escape") { editingId = null; } }}
              ></textarea>
              <div class="flex gap-1 shrink-0">
                <button type="button"
                  class="flex items-center justify-center h-8 w-8 rounded bg-primary text-primary-foreground disabled:opacity-50"
                  disabled={!editDraft.trim() || savingEditId === post.id}
                  onclick={() => void saveEditPost(post)}>
                  {#if savingEditId === post.id}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Check class="h-3.5 w-3.5" />{/if}
                </button>
                <button type="button"
                  class="flex items-center justify-center h-8 w-8 rounded border border-border text-muted-foreground"
                  onclick={() => { editingId = null; }}>
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          {:else if post.body}
            <p class="text-sm">{post.body}</p>
          {/if}

          <!-- Payload card -->
          {#if post.payloadJson}
            {@const payload = (() => { try { return JSON.parse(post.payloadJson); } catch { return null; } })()}
            {#if payload}
              <div class="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex flex-col gap-1">
                {#if post.type === "WorkoutSession"}
                  {#if payload.duration}
                    <span class="font-medium text-foreground">{Math.round(payload.duration / 60000)} min workout</span>
                  {/if}
                  {#if payload.exercises?.length}
                    <span>{payload.exercises.map((e: { name: string; sets: number }) => `${e.name} (${e.sets})`).join(" · ")}</span>
                  {/if}

                {:else if post.type === "PersonalRecord" && payload.exerciseName}
                  <span class="font-medium text-foreground">{payload.exerciseName}</span>
                  <span>
                    {#if payload.weight}{payload.weight}{payload.unit ?? "kg"}{/if}
                    {#if payload.reps} × {payload.reps} reps{/if}
                  </span>

                {:else if post.type === "Split" && payload.name}
                  <span class="font-medium text-foreground">{payload.name}</span>
                  {#if payload.days?.length}
                    <span>{payload.days.map((d: { name?: string }) => d.name).filter(Boolean).join(" · ")}</span>
                  {/if}

                {:else if post.type === "Exercise" && payload.name}
                  <span class="font-medium text-foreground">{payload.name}</span>
                  {#if payload.notes}<span>{payload.notes}</span>{/if}

                {:else if post.type === "Algorithm" && payload.name}
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-foreground">{payload.name}</span>
                    <span class="capitalize rounded border border-border px-1.5 py-0.5 text-[10px]">{payload.family}</span>
                  </div>
                  {#if payload.description}<span>{payload.description}</span>{/if}
                  {#if payload.author}<span class="text-muted-foreground/60">by {payload.author}</span>{/if}

                {:else if post.type === "Widget" && payload.name}
                  <span class="font-medium text-foreground">{payload.name}</span>
                  {#if payload.description}<span>{payload.description}</span>{/if}

                {/if}
              </div>
            {/if}
          {/if}

          <!-- Like + comment row -->
          <div class="flex items-center gap-3 -mb-0.5">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40
                {post.isLikedByMe ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'}"
              disabled={likingId === post.id}
              onclick={() => void toggleLike(post)}
            >
              <Heart class="h-3.5 w-3.5 {post.isLikedByMe ? 'fill-rose-500' : ''}" />
              {#if post.likeCount > 0}<span>{post.likeCount}</span>{/if}
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onclick={() => (commentPost = post)}
            >
              <MessageCircle class="h-3.5 w-3.5" />
              {#if post.commentCount > 0}<span>{post.commentCount}</span>{/if}
            </button>
          </div>
        </li>
      {/each}
    </ul>

    <!-- Load more -->
    {#if nextCursor}
      <div class="flex justify-center py-4">
        <button type="button"
          class="text-sm text-muted-foreground flex items-center gap-1.5 disabled:opacity-50"
          disabled={loadingMore}
          onclick={() => void load(false)}>
          {#if loadingMore}
            <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading…
          {:else}
            Load more
          {/if}
        </button>
      </div>
    {/if}
  {/if}
</div>

<ConnectAccountPrompt
  open={showConnectPrompt}
  feature="The social feed"
  onclose={() => { showConnectPrompt = false; history.back(); }}
/>

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
    posts = posts.map((p) => p.id === id ? { ...p, commentCount: p.commentCount + delta } : p);
  }}
/>
