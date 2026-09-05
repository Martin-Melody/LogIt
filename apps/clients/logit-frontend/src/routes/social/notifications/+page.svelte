<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Loader2, Heart, MessageCircle, UserPlus, Bell } from "lucide-svelte";
  import { notificationsApi, type ApiNotification } from "@logit/core/api/socialApi";
  import { unreadNotifications } from "$lib/stores/notifications.store";
  import { formatDistanceToNow } from "$lib/utils";

  let items = $state<ApiNotification[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let sentinel = $state<HTMLDivElement | null>(null);

  async function load(more = false) {
    if (more) loadingMore = true;
    else loading = true;
    error = null;
    try {
      const page = await notificationsApi.list(more ? nextCursor ?? undefined : undefined);
      items = more ? [...items, ...page.notifications] : page.notifications;
      nextCursor = page.nextCursor;
    } catch {
      error = "Couldn't load notifications.";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  onMount(async () => {
    await load();
    // Opening the screen marks everything read.
    try {
      await notificationsApi.markRead();
      unreadNotifications.clear();
    } catch {
      // non-fatal
    }
  });

  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && nextCursor && !loadingMore) void load(true);
    }, { rootMargin: "400px" });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  function icon(t: ApiNotification["type"]) {
    return t === "Like" ? Heart : t === "Comment" ? MessageCircle : UserPlus;
  }

  function verb(n: ApiNotification) {
    if (n.type === "Like") return n.commentId ? "liked your comment" : "liked your post";
    return n.type === "Comment" ? "commented on your post" : "followed you";
  }

  function target(n: ApiNotification) {
    if (n.type === "Follow") return `/social/${n.actor.username}`;
    return n.postId ? `/social/post/${n.postId}` : `/social/${n.actor.username}`;
  }
</script>

<div class="flex flex-col min-h-full">
  <header class="flex items-center gap-2 px-3 h-12 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <button type="button" class="p-1 -ml-1 text-muted-foreground" aria-label="Back" onclick={() => history.back()}>
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-base font-semibold">Notifications</h1>
  </header>

  {#if loading}
    <div class="flex justify-center py-20"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
  {:else if error}
    <div class="flex flex-col items-center gap-3 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">{error}</p>
      <button type="button" class="text-sm text-primary" onclick={() => load()}>Try again</button>
    </div>
  {:else if items.length === 0}
    <div class="flex flex-col items-center gap-2 py-20 text-center px-6">
      <Bell class="h-6 w-6 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground">No notifications yet.</p>
    </div>
  {:else}
    <ul class="divide-y divide-border">
      {#each items as n (n.id)}
        {@const Icon = icon(n.type)}
        <li>
          <button
            type="button"
            class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 {n.readAt ? '' : 'bg-primary/5'}"
            onclick={() => goto(target(n))}
          >
            <div class="relative shrink-0">
              <div class="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold overflow-hidden">
                {#if n.actor.avatarUrl}
                  <img src={n.actor.avatarUrl} alt={n.actor.displayName} class="h-full w-full object-cover" />
                {:else}
                  {n.actor.displayName.charAt(0).toUpperCase()}
                {/if}
              </div>
              <span class="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-background flex items-center justify-center">
                <Icon class="h-3 w-3 {n.type === 'Like' ? 'text-rose-500 fill-rose-500' : 'text-muted-foreground'}" />
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm leading-snug">
                <span class="font-semibold">{n.actor.displayName}</span>
                <span class="text-muted-foreground"> {verb(n)}</span>
              </p>
              {#if n.postBody}
                <p class="text-xs text-muted-foreground truncate mt-0.5">{n.postBody}</p>
              {/if}
              <p class="text-[11px] text-muted-foreground/70 mt-0.5">{formatDistanceToNow(new Date(n.createdAt))}</p>
            </div>
          </button>
        </li>
      {/each}
    </ul>
    <div bind:this={sentinel} class="h-px"></div>
    {#if loadingMore}
      <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
    {/if}
  {/if}
</div>
