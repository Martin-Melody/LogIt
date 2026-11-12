<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    Loader2,
    Heart,
    MessageCircle,
    UserPlus,
    Bell,
    AtSign,
    Repeat2,
    Quote,
    Trophy,
    TrendingUp,
    TrendingDown,
  } from "lucide-svelte";
  import { notificationsApi, type ApiNotification } from "@logit/core/api/socialApi";
  import { formatWeight } from "@logit/core/domain/units";
  import { unreadNotifications } from "$lib/stores/notifications.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { localInbox, type LocalNotification } from "$lib/features/inbox/localInbox";
  import { chip } from "$lib/components/ui/choice";
  import { formatDistanceToNow } from "$lib/utils";
  import { popIn } from "$lib/transitions";

  // One inbox: social notifications from the server (signed in) merged with the ones
  // made on the device (PRs, progression changes). Opening it marks everything read.

  type Filter = "all" | "social" | "pr" | "progression";
  type Row =
    | { source: "social"; id: string; atMs: number; read: boolean; n: ApiNotification }
    | { source: "local"; id: string; atMs: number; read: boolean; n: LocalNotification };

  const FILTERS: { id: Filter; label: string; social?: boolean }[] = [
    { id: "all", label: "All" },
    { id: "social", label: "Social", social: true },
    { id: "pr", label: "PRs" },
    { id: "progression", label: "Progression" },
  ];

  const initialFilter = page.url.searchParams.get("filter") as Filter | null;
  let filter = $state<Filter>(
    initialFilter && FILTERS.some((f) => f.id === initialFilter) ? initialFilter : "all",
  );
  const filters = $derived(FILTERS.filter((f) => !f.social || authStore.isAuthenticated));

  let social = $state<ApiNotification[]>([]);
  let loading = $state(false);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let sentinel = $state<HTMLDivElement | null>(null);

  // Read state as it was when the inbox opened, so new items stay highlighted this visit.
  const unreadLocalAtOpen = new Set(get(localInbox).filter((n) => !n.read).map((n) => n.id));

  async function loadSocial(more = false) {
    if (!authStore.isAuthenticated) return;
    if (more) loadingMore = true;
    else loading = true;
    error = null;
    try {
      const res = await notificationsApi.list(more ? (nextCursor ?? undefined) : undefined);
      social = more ? [...social, ...res.notifications] : res.notifications;
      nextCursor = res.nextCursor;
    } catch {
      error = "Couldn't load social notifications.";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  onMount(async () => {
    localInbox.markAllRead();
    await loadSocial();
    if (!authStore.isAuthenticated) return;
    try {
      await notificationsApi.markRead();
      unreadNotifications.clear();
    } catch {
      // non-fatal
    }
  });

  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting && nextCursor && !loadingMore) void loadSocial(true);
      },
      { rootMargin: "400px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  const rows = $derived.by<Row[]>(() => {
    const all: Row[] = [
      ...social.map((n) => ({
        source: "social" as const,
        id: `s-${n.id}`,
        atMs: new Date(n.createdAt).getTime(),
        read: !!n.readAt,
        n,
      })),
      ...$localInbox.map((n) => ({
        source: "local" as const,
        id: `l-${n.id}`,
        atMs: n.createdAtMs,
        read: !unreadLocalAtOpen.has(n.id),
        n,
      })),
    ];
    return all
      .filter((r) =>
        filter === "all" ? true : filter === "social" ? r.source === "social" : r.source === "local" && r.n.kind === filter,
      )
      .sort((a, b) => b.atMs - a.atMs);
  });

  function socialIcon(t: ApiNotification["type"]) {
    return t === "Like" ? Heart
      : t === "Comment" ? MessageCircle
      : t === "Mention" ? AtSign
      : t === "Repost" ? Repeat2
      : t === "Quote" ? Quote
      : UserPlus;
  }

  function verb(n: ApiNotification) {
    if (n.type === "Like") return n.commentId ? "liked your comment" : "liked your post";
    if (n.type === "Mention") return n.commentId ? "mentioned you in a comment" : "mentioned you in a post";
    if (n.type === "Repost") return "reposted your post";
    if (n.type === "Quote") return "quoted your post";
    return n.type === "Comment" ? "commented on your post" : "followed you";
  }

  function socialTarget(n: ApiNotification) {
    if (n.type === "Follow") return `/social/${n.actor.username}`;
    return n.postId ? `/social/post/${n.postId}` : `/social/${n.actor.username}`;
  }

  function localTarget(n: LocalNotification) {
    return n.exerciseId ? `/exercises/${n.exerciseId}` : null;
  }

  function prText(n: Extract<LocalNotification, { kind: "pr" }>) {
    const set = `${n.reps} × ${formatWeight(n.weightKg, $profile.weightUnit)}`;
    return n.prKind === "weight" ? `${set}, your heaviest yet` : `${set}, most reps at that weight`;
  }

  const emptyText = $derived(
    filter === "pr" ? "No PRs yet. They show up here after a workout."
      : filter === "progression" ? "No progression changes yet. Raised targets and deloads show up here."
      : filter === "social" ? "No social notifications yet."
      : "No notifications yet.",
  );
</script>

<div class="flex min-h-full flex-col pb-24">
  <PageHeader>
    <BackButton onclick={() => history.back()} />
    <h1 class="page-title">Notifications</h1>
  </PageHeader>

  <div class="flex gap-2 overflow-x-auto px-3 py-2">
    {#each filters as f (f.id)}
      <button type="button" class={chip(filter === f.id)} aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>
        {f.label}
      </button>
    {/each}
  </div>

  {#if error && filter !== "pr" && filter !== "progression"}
    <div class="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
      <p class="text-sm text-muted-foreground">{error}</p>
      <button type="button" class="h-11 shrink-0 text-sm text-primary" onclick={() => loadSocial()}>Try again</button>
    </div>
  {/if}

  {#if loading && rows.length === 0}
    <div class="flex justify-center py-20"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
  {:else if rows.length === 0}
    <div class="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <Bell class="h-6 w-6 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground">{emptyText}</p>
    </div>
  {:else}
    <ul class="divide-y divide-border border-t border-border">
      {#each rows as r (r.id)}
        <li in:popIn>
          {#if r.source === "social"}
            {@const n = r.n}
            {@const Icon = socialIcon(n.type)}
            <button
              type="button"
              class="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted/40 {r.read ? '' : 'bg-primary/5'}"
              onclick={() => goto(socialTarget(n))}
            >
              <div class="relative shrink-0">
                <div class="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                  {#if n.actor.avatarUrl}
                    <img src={n.actor.avatarUrl} alt={n.actor.displayName} class="h-full w-full object-cover" />
                  {:else}
                    {n.actor.displayName.charAt(0).toUpperCase()}
                  {/if}
                </div>
                <span class="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                  <Icon class="h-3 w-3 {n.type === 'Like' ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground'}" />
                </span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm leading-snug">
                  <span class="font-semibold">{n.actor.displayName}</span>
                  <span class="text-muted-foreground"> {verb(n)}</span>
                </p>
                {#if n.postBody}
                  <p class="mt-0.5 truncate text-xs text-muted-foreground">{n.postBody}</p>
                {/if}
                <p class="mt-0.5 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.createdAt))}</p>
              </div>
            </button>
          {:else}
            {@const n = r.n}
            {@const href = localTarget(n)}
            <button
              type="button"
              class="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent {r.read ? '' : 'bg-primary/5'}"
              disabled={!href}
              onclick={() => href && goto(href)}
            >
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                  {n.kind === 'pr' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : n.kind === 'progression' && n.change.kind === 'deload' ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/10 text-primary'}"
              >
                {#if n.kind === "pr"}
                  <Trophy class="h-4 w-4" />
                {:else if n.change.kind === "deload"}
                  <TrendingDown class="h-4 w-4" />
                {:else}
                  <TrendingUp class="h-4 w-4" />
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                {#if n.kind === "pr"}
                  <p class="text-sm leading-snug"><span class="font-semibold">New PR</span> · {n.exerciseName}</p>
                  <p class="mt-0.5 text-xs text-muted-foreground">{prText(n)}</p>
                {:else}
                  <p class="text-sm leading-snug">
                    <span class="font-semibold">{n.exerciseName}</span>
                    <span class="text-muted-foreground"> · {n.change.kind === "deload" ? "deload next time" : `${n.change.text} next time`}</span>
                  </p>
                  {#if n.change.detail}
                    <p class="mt-0.5 text-xs text-muted-foreground">{n.change.detail}</p>
                  {/if}
                {/if}
                <p class="mt-0.5 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.createdAtMs))}</p>
              </div>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    <div bind:this={sentinel} class="h-px"></div>
    {#if loadingMore}
      <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
    {/if}
  {/if}
</div>
