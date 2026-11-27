<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { photoSrc } from "@logit/core/api/photosApi";
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
    Target,
    ThumbsUp,
    Pin,
    Users as UsersIcon,
    Calendar as CalendarIcon,
    Flag as FlagIcon,
  } from "lucide-svelte";
  import {
    followedByText,
    notificationsApi,
    socialApi,
    type ApiNotification,
    type FollowRequestItem,
  } from "@logit/core/api/socialApi";
  import { toast } from "svelte-sonner";
  import { formatWeight } from "@logit/core/domain/units";
  import { unreadNotifications } from "$lib/stores/notifications.store";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { localInbox, type LocalNotification } from "$lib/features/inbox/localInbox";
  import { chip } from "$lib/components/ui/choice";
  import { formatDistanceToNow } from "$lib/utils";
  import { popIn, reveal } from "$lib/transitions";
  import { askForPush, markPushAsked, pushAsked, pushPermission } from "$lib/platform/push";
  import { pushApi } from "@logit/core/api/pushApi";

  // One inbox: social notifications from the server (signed in) merged with the ones
  // made on the device (PRs, progression changes). Opening it marks everything read.

  type Filter = "all" | "social" | "pr" | "goal" | "progression";
  type Row =
    | { source: "social"; id: string; atMs: number; read: boolean; n: ApiNotification }
    | { source: "local"; id: string; atMs: number; read: boolean; n: LocalNotification };

  const FILTERS: { id: Filter; label: string; social?: boolean }[] = [
    { id: "all", label: "All" },
    { id: "social", label: "Social", social: true },
    { id: "pr", label: "PRs" },
    { id: "goal", label: "Goals" },
    { id: "progression", label: "Progression" },
  ];

  const initialFilter = page.url.searchParams.get("filter") as Filter | null;
  let filter = $state<Filter>(
    initialFilter && FILTERS.some((f) => f.id === initialFilter) ? initialFilter : "all",
  );
  const filters = $derived(FILTERS.filter((f) => !f.social || authStore.isAuthenticated));

  let social = $state<ApiNotification[]>([]);
  // Private accounts: people waiting for an answer. Shown above the list, not in it.
  let requests = $state<FollowRequestItem[]>([]);

  async function answer(r: FollowRequestItem, accept: boolean) {
    requests = requests.filter((x) => x.user.id !== r.user.id);
    try {
      if (accept) await socialApi.acceptFollowRequest(r.user.username);
      else await socialApi.declineFollowRequest(r.user.username);
    } catch {
      requests = [r, ...requests];
      toast.error("Couldn't do that. Try again.");
    }
  }
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

  let opened = $state(false);

  // Design canvas P3: asked once, after the first notification, when this server can push and
  // Android hasn't been asked. "Not now" never asks again; Settings › Notifications still can.
  let askPush = $state(false);
  async function checkAskPush() {
    if (askPush || pushAsked() || social.length === 0 || (await pushPermission()) !== "prompt") return;
    askPush = await pushApi.settings().then((s) => s.available, () => false);
  }
  $effect(() => {
    if (social.length) void checkAskPush();
  });
  function answerAskPush(turnOn: boolean) {
    askPush = false;
    if (turnOn) void askForPush();
    else markPushAsked();
  }

  async function markSeen() {
    try {
      await notificationsApi.markRead();
      unreadNotifications.clear();
    } catch {
      // non-fatal
    }
  }

  onMount(async () => {
    localInbox.markAllRead();
    await loadSocial();
    if (!authStore.isAuthenticated) return;
    void socialApi.getFollowRequests().then((r) => (requests = r)).catch(() => {});
    await markSeen();
    opened = true;
  });

  // New ones while this page is open (the badge store checks every 20 s, and when the app comes
  // back to the front): show them here too, instead of only after leaving and coming back.
  $effect(() => {
    if (!opened || $unreadNotifications === 0 || loading) return;
    void (async () => {
      await loadSocial();
      void socialApi.getFollowRequests().then((r) => (requests = r)).catch(() => {});
      await markSeen();
    })();
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
      ...social.filter((n) => n.type !== "FollowRequest").map((n) => ({
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
      : t === "Comment" || t === "Reply" ? MessageCircle
      : t === "Mention" ? AtSign
      : t === "Repost" ? Repeat2
      : t === "Quote" ? Quote
      : t === "Cheer" || t === "StoryCheer" ? ThumbsUp
      : t === "GroupNote" ? Pin
      : t === "GroupRequest" || t === "GroupApproved" || t === "GroupDeclined" ? UsersIcon
      : t.startsWith("GroupEvent") ? CalendarIcon
      : t === "GroupReport" ? FlagIcon
      : t === "GroupPostReply" ? MessageCircle
      : UserPlus;
  }

  function verb(n: ApiNotification) {
    if (n.type === "Like") return n.commentId ? "liked your comment" : "liked your post";
    if (n.type === "Mention") return n.commentId ? "mentioned you in a comment" : "mentioned you in a post";
    if (n.type === "Reply") return "replied to your comment";
    if (n.type === "Repost") return "reposted your post";
    if (n.type === "Quote") return "quoted your post";
    if (n.type === "FollowRequest") return "asked to follow you";
    if (n.type === "FollowAccepted") return "accepted your follow request";
    if (n.type === "CoachInvite") return "wants to coach you";
    if (n.type === "CoachProgram") return "sent you a program";
    if (n.type === "CoachPaymentFailed") return "couldn't take your coaching payment. Check your card in My coach";
    if (n.type === "Cheer") return "cheered you on";
    if (n.type === "StoryCheer") return "cheered your story";
    if (n.type === "GroupNote") return n.group ? `pinned a note in ${n.group.name}` : "pinned a note in a group";
    if (n.type === "GroupRequest") return n.group ? `asked to join ${n.group.name}` : "asked to join your group";
    if (n.type === "GroupApproved") return n.group ? `let you into ${n.group.name}` : "let you into the group";
    if (n.type === "GroupEvent") return `added ${n.event?.title ?? "an event"}${n.group ? ` in ${n.group.name}` : ""}`;
    if (n.type === "GroupEventChanged") return `changed the time or place of ${n.event?.title ?? "an event"}`;
    if (n.type === "GroupEventCancelled") return `cancelled ${n.event?.title ?? "an event"}`;
    if (n.type === "GroupReport") return "· something was reported. Open Reports in the group's ⋯";
    if (n.type === "GroupPostReply") return n.group ? `replied to you in ${n.group.name}` : "replied to you in a group";
    if (n.type === "GroupEventReminder") return `· ${n.event?.title ?? "Your event"} is tomorrow`;
    if (n.type === "GroupDeclined") return "· The organisers didn't approve your request";
    return n.type === "Comment" ? "commented on your post" : "followed you";
  }

  function socialTarget(n: ApiNotification) {
    if (n.type === "CoachInvite") return "/clients";
    if (n.type === "CoachProgram") return "/splits";
    if (n.type === "CoachPaymentFailed") return "/clients";
    if (n.type === "Follow") return `/social/${n.actor.username}`;
    if (n.type.startsWith("GroupEvent") && n.event) return `/events/${n.event.id}`;
    if (n.type === "GroupNote" || n.type === "GroupApproved") return n.group ? `/groups/${n.group.id}` : "/messages";
    if (n.type === "GroupReport") return n.group ? `/groups/${n.group.id}/reports` : "/messages";
    if (n.type === "GroupPostReply") return n.groupPostId ? `/social/forum/${n.groupPostId}` : "/messages";
    if (n.type === "GroupRequest") return n.group ? `/groups/${n.group.id}/members` : "/messages";
    if (n.type === "GroupDeclined") return n.group ? `/groups/join?id=${n.group.id}` : "/messages";
    return n.postId ? `/social/post/${n.postId}` : `/social/${n.actor.username}`;
  }

  function localTarget(n: LocalNotification) {
    if (n.kind === "goal") return `/progress/goals/${n.goalId}`;
    return n.exerciseId ? `/exercises/${n.exerciseId}` : null;
  }

  function prText(n: Extract<LocalNotification, { kind: "pr" }>) {
    const set = `${formatWeight(n.weightKg, $profile.weightUnit)} × ${n.reps}`;
    return n.prKind === "weight" ? `${set}, your heaviest yet` : `${set}, most reps at that weight`;
  }

  const emptyText = $derived(
    filter === "pr" ? "No PRs yet. They show up here after a workout."
      : filter === "goal" ? "No goals reached yet. Set one on the Progress page."
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

  {#if error && filter !== "pr" && filter !== "goal" && filter !== "progression"}
    <div class="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
      <p class="text-sm text-muted-foreground">{error}</p>
      <button type="button" class="h-11 shrink-0 text-sm text-primary" onclick={() => loadSocial()}>Try again</button>
    </div>
  {/if}

  {#if askPush}
    <section transition:reveal aria-labelledby="ask-push-h" class="mx-3 my-2 flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
      <h2 id="ask-push-h" class="text-[15px] font-semibold">Get these on your phone</h2>
      <p class="text-sm leading-relaxed text-muted-foreground">See when your coach messages you or someone comments, without opening LogIt. You choose which kinds in Settings.</p>
      <div class="flex gap-2">
        <button type="button" class="h-11 flex-1 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground" onclick={() => answerAskPush(true)}>Turn on</button>
        <button type="button" class="h-11 flex-1 rounded-[10px] border border-border text-sm font-medium" onclick={() => answerAskPush(false)}>Not now</button>
      </div>
    </section>
  {/if}

  {#if requests.length && (filter === "all" || filter === "social")}
    <section class="border-t border-border px-3 py-3 flex flex-col gap-2.5" aria-label="Follow requests">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow requests · {requests.length}</p>
      {#each requests as r (r.user.id)}
        <div class="flex items-center gap-3">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" onclick={() => goto(`/social/${r.user.username}`)}>
            <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
              {#if r.user.avatarUrl}<img src={photoSrc(r.user.avatarUrl)} alt="" class="h-full w-full object-cover" />{:else}{r.user.displayName.charAt(0).toUpperCase()}{/if}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{r.user.displayName}</span>
              <span class="block truncate text-xs text-muted-foreground">@{r.user.username}{followedByText(r.followedBy, r.followedByOthers) ? ` · ${followedByText(r.followedBy, r.followedByOthers)}` : ""}</span>
            </span>
          </button>
          <button type="button" class="h-9 shrink-0 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground" onclick={() => answer(r, true)}>Accept</button>
          <button type="button" class="h-9 shrink-0 rounded-md border border-border px-3 text-xs" onclick={() => answer(r, false)}>Decline</button>
        </div>
      {/each}
    </section>
  {/if}

  {#if loading && rows.length === 0}
    <div class="flex justify-center py-20"><Spinner class="h-5 w-5 text-muted-foreground" /></div>
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
                    <img src={photoSrc(n.actor.avatarUrl)} alt={n.actor.displayName} class="h-full w-full object-cover" />
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
                  <span class="font-semibold">{n.type === "GroupEventReminder" || n.type === "GroupReport" || n.type === "GroupDeclined" ? (n.group?.name ?? "Your group") : n.actor.displayName}</span>
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
                  {n.kind === 'pr' || n.kind === 'goal' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : n.kind === 'progression' && n.change.kind === 'deload' ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/10 text-primary'}"
              >
                {#if n.kind === "pr"}
                  <Trophy class="h-4 w-4" />
                {:else if n.kind === "goal"}
                  <Target class="h-4 w-4" />
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
                {:else if n.kind === "goal"}
                  <p class="text-sm leading-snug"><span class="font-semibold">Goal reached</span> · {n.exerciseName}</p>
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
      <div class="flex justify-center py-4"><Spinner class="h-4 w-4 text-muted-foreground" /></div>
    {/if}
  {/if}
</div>
