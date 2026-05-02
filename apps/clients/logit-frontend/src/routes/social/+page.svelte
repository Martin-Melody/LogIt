<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Loader2, RefreshCw, Dumbbell, Trophy, MessageSquare, Trash2 } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiPost, type FeedPage } from "$lib/api/socialApi";
  import ConnectAccountPrompt from "$lib/components/ConnectAccountPrompt.svelte";
  import { formatDistanceToNow } from "$lib/utils";

  let posts = $state<ApiPost[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let showConnectPrompt = $state(false);
  let deletingId = $state<string | null>(null);

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
    } catch {
      // silently ignore
    } finally {
      deletingId = null;
    }
  }

  onMount(() => {
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
      <button type="button" class="p-1 text-muted-foreground" onclick={() => void load()}>
        <RefreshCw class="h-4 w-4" />
      </button>
    {/if}
  </div>

  {#if !authStore.isAuthenticated}
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
    </div>

  {:else}
    <ul class="flex flex-col divide-y divide-border">
      {#each posts as post (post.id)}
        {@const Icon = postIcon(post.type)}
        <li class="px-4 py-3 flex flex-col gap-2">
          <!-- Author row -->
          <div class="flex items-center gap-2.5">
            <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
              {post.authorDisplayName.charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium leading-none">{post.authorDisplayName}</p>
              <p class="text-xs text-muted-foreground mt-0.5">@{post.authorUsername} · {relativeTime(post.createdAt)}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <Icon class="h-3.5 w-3.5 text-muted-foreground" />
              {#if post.authorId === authStore.user?.id}
                <button type="button"
                  class="text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-40"
                  disabled={deletingId === post.id}
                  onclick={() => void deletePost(post.id)}>
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              {/if}
            </div>
          </div>

          <!-- Body -->
          {#if post.body}
            <p class="text-sm">{post.body}</p>
          {/if}

          <!-- Workout payload -->
          {#if post.payloadJson}
            {@const payload = (() => { try { return JSON.parse(post.payloadJson); } catch { return null; } })()}
            {#if payload}
              <div class="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {#if post.type === "WorkoutSession" && payload.splitName}
                  <span class="font-medium text-foreground">{payload.splitName}</span>
                  {#if payload.duration} · {Math.round(payload.duration / 60)}min{/if}
                  {#if payload.exercises?.length} · {payload.exercises.length} exercise{payload.exercises.length !== 1 ? "s" : ""}{/if}
                {:else if post.type === "PersonalRecord" && payload.exerciseName}
                  <span class="font-medium text-foreground">{payload.exerciseName}</span>
                  {#if payload.weight} · {payload.weight}{payload.unit ?? "kg"}{/if}
                  {#if payload.reps} × {payload.reps}{/if}
                {:else}
                  <span class="font-mono text-[11px] break-all">{post.payloadJson}</span>
                {/if}
              </div>
            {/if}
          {/if}
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
