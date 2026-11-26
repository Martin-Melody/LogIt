<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import CheckIcon from "@lucide/svelte/icons/check";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    discoverApi,
    socialApi,
    type ApiPost,
    type ApiProfile,
    type DiscoverPost,
    type SocialSettings,
  } from "@logit/core/api/socialApi";
  import { appendUnique, caughtUpIndex, withForumCards } from "@logit/core/domain/socialFeed";
  import { tagsApi, type ForumPost, type TagCount } from "@logit/core/api/forumApi";
  import ForumCard from "$lib/features/social/ForumCard.svelte";
  import ForumPosts from "$lib/features/social/ForumPosts.svelte";
  import PostCard from "$lib/features/social/PostCard.svelte";
  import Composer from "$lib/features/social/Composer.svelte";
  import PeopleSuggestions from "$lib/features/social/PeopleSuggestions.svelte";
  import PeopleSearch from "$lib/features/social/PeopleSearch.svelte";
  import PrivacyCard from "$lib/features/social/PrivacyCard.svelte";
  import DiscoverQuestion from "$lib/features/social/DiscoverQuestion.svelte";
  import Notifications from "$lib/features/social/Notifications.svelte";
  import Avatar from "$lib/features/social/Avatar.svelte";
  import { me, socialBadge } from "$lib/features/social/socialData.svelte";

  // Me › Social. Following is everyone you follow, newest first; once you've seen what's new,
  // "You're all caught up" and suggested posts from Discover carry on below. Discover is its
  // own tab, fed by the server's Discover service.

  type Tab = "following" | "discover" | "forum" | "notifications";
  const tab = $derived<Tab>(
    (["discover", "forum", "notifications"] as const).find((t) => t === page.url.searchParams.get("tab")) ?? "following",
  );
  let trending = $state<TagCount[] | null>(null);
  $effect(() => {
    if (tab === "forum" && trending === null) void tagsApi.trending().then((t) => (trending = t)).catch(() => (trending = []));
  });
  function go(t: Tab) {
    void goto(t === "following" ? "/social" : `/social?tab=${t}`, { noScroll: true, keepFocus: true });
    if (t === "discover") guideSignal("social.discover-opened");
  }

  const self = me();
  let profile = $state<ApiProfile | null>(null);
  let settings = $state<SocialSettings | null>(null);
  let composerOpen = $state(false);

  $effect(() => {
    if (self) void socialApi.getProfile(self.username).then((p) => (profile = p)).catch(() => {});
    void socialApi.getSettings().then((s) => (settings = s)).catch(() => {});
    void socialBadge.refresh(true);
  });

  // ── Following ───────────────────────────────────────────────────────────────
  let feed = $state<ApiPost[]>([]);
  // Forum posts from people you follow and your groups, as title cards (canvas F1).
  let forumCards = $state<ForumPost[]>([]);
  let feedCursor = $state<string | null>(null);
  let feedStatus = $state<"loading" | "ready" | "more" | "error">("loading");
  let feedRequest = 0;
  let showOlder = $state(false);
  let suggested = $state<DiscoverPost[] | null>(null);
  let feedSentinel = $state<HTMLDivElement | null>(null);

  async function loadFeed(more = false) {
    if (more && (feedStatus !== "ready" || !feedCursor)) return;
    const req = ++feedRequest;
    feedStatus = more ? "more" : "loading";
    try {
      const pageData = await socialApi.getFeed(20, more ? feedCursor ?? undefined : undefined);
      if (req !== feedRequest) return;
      feed = more ? appendUnique(feed, pageData.posts) : pageData.posts;
      forumCards = more ? [...forumCards, ...(pageData.forum ?? [])] : (pageData.forum ?? []);
      feedCursor = pageData.nextCursor;
      feedStatus = "ready";
    } catch {
      if (req !== feedRequest) return;
      feedStatus = more ? "ready" : "error";
    }
  }

  const caughtUp = $derived(feedStatus === "loading" ? null : caughtUpIndex(feed, !!feedCursor, Date.now()));
  const newPosts = $derived(caughtUp === null ? feed : feed.slice(0, caughtUp));
  const olderPosts = $derived(caughtUp === null ? [] : feed.slice(caughtUp));
  const items = $derived(withForumCards(feed, forumCards));
  const splitMs = $derived(caughtUp !== null && caughtUp < feed.length ? Date.parse(feed[caughtUp]!.createdAt) : -Infinity);

  // Suggested posts once the divider is placed.
  $effect(() => {
    if (tab !== "following" || caughtUp === null || suggested !== null) return;
    // Skip anything already in the feed, as a post or as what a repost shares.
    const seen = new Set(feed.flatMap((p) => [p.id, p.repostOf?.id].filter(Boolean)));
    void discoverApi.posts(8).then((r) => (suggested = r.items.filter((d) => !seen.has(d.post.id)).slice(0, 5))).catch(() => (suggested = []));
  });

  // Infinite scroll: until the divider is placed, and again after "Show older posts".
  $effect(() => {
    if (tab !== "following" || !feedSentinel || feedStatus !== "ready" || !feedCursor) return;
    if (caughtUp !== null && !showOlder) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) void loadFeed(true); }, { rootMargin: "600px" });
    io.observe(feedSentinel);
    return () => io.disconnect();
  });

  // ── Discover ────────────────────────────────────────────────────────────────
  let disc = $state<DiscoverPost[]>([]);
  let discCursor = $state<string | null>(null);
  let discStatus = $state<"idle" | "loading" | "ready" | "more" | "error">("idle");
  let discSentinel = $state<HTMLDivElement | null>(null);

  async function loadDiscover(more = false) {
    if (more && (discStatus !== "ready" || !discCursor)) return;
    discStatus = more ? "more" : "loading";
    try {
      const r = await discoverApi.posts(20, more ? discCursor ?? undefined : undefined);
      // Pages are ranked, so a post can move between pages as likes come in: skip repeats.
      const shown = new Set(disc.map((d) => d.post.id));
      disc = more ? [...disc, ...r.items.filter((d) => !shown.has(d.post.id))] : r.items;
      discCursor = r.nextCursor;
      discStatus = "ready";
    } catch {
      discStatus = more ? "ready" : "error";
    }
  }

  let feedStarted = false;
  $effect(() => {
    if (tab === "following" && !feedStarted) { feedStarted = true; void loadFeed(); }
    if (tab === "discover" && discStatus === "idle") void loadDiscover();
  });

  $effect(() => {
    if (tab !== "discover" || !discSentinel || discStatus !== "ready" || !discCursor) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) void loadDiscover(true); }, { rootMargin: "600px" });
    io.observe(discSentinel);
    return () => io.disconnect();
  });

  function replaceIn(list: ApiPost[], id: string, next: ApiPost | null) {
    return next ? list.map((p) => (p.id === id ? next : p)) : list.filter((p) => p.id !== id);
  }
  function onFeedChange(id: string, next: ApiPost | null) { feed = replaceIn(feed, id, next); }
  function onDiscChange(id: string, next: ApiPost | null) {
    disc = next ? disc.map((d) => (d.post.id === id ? { ...d, post: next } : d)) : disc.filter((d) => d.post.id !== id);
  }
  function onSuggestedChange(id: string, next: ApiPost | null) {
    suggested = (suggested ?? []).flatMap((d) => (d.post.id === id ? (next ? [{ ...d, post: next }] : []) : [d]));
  }
  function posted(p: ApiPost) {
    feed = [p, ...feed];
    if (tab !== "following") go("following");
  }

  const discoverOn = $derived(!!settings && !settings.isPrivate && settings.showInDiscover === true);
</script>

<div class="mx-auto flex max-w-[1060px] flex-wrap items-start gap-5">
  <div class="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-[26px] font-bold tracking-tight">Social</h1>
      <div role="tablist" aria-label="Feed" data-guide="social-tabs" class="flex gap-1 rounded-[10px] border border-border bg-card p-1">
        {#each [["following", "Following"], ["discover", "Discover"], ["forum", "Forum"], ["notifications", socialBadge.count ? `Notifications · ${socialBadge.count}` : "Notifications"]] as [t, label] (t)}
          <button type="button" role="tab" aria-selected={tab === t} onclick={() => go(t as Tab)}
            class="h-8 rounded-lg px-3 text-[13px] {tab === t ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'}">{label}</button>
        {/each}
      </div>
    </header>

    {#if settings && tab !== "notifications"}<DiscoverQuestion bind:settings={settings!} />{/if}

    {#if tab === "following"}
      <div class="flex items-center gap-3 rounded-[10px] border border-border bg-card px-[18px] py-3.5">
        <Avatar name={self?.username ?? "?"} url={profile?.avatarUrl} />
        <button type="button" onclick={() => (composerOpen = true)}
          class="h-10 min-w-0 flex-1 truncate rounded-[10px] border border-border bg-background px-3 text-left text-[13px] text-muted-foreground">Share a workout, a PR or a thought</button>
        <button type="button" onclick={() => (composerOpen = true)} class="h-8 rounded-[9px] bg-primary px-3.5 text-xs font-semibold text-primary-foreground">New post</button>
      </div>

      {#if feedStatus === "loading"}
        <Skeleton class="h-40" /><Skeleton class="h-40" />
      {:else if feedStatus === "error"}
        <Alert.Root variant="destructive"><Alert.Description>Couldn't load your feed. <button type="button" class="underline" onclick={() => loadFeed()}>Try again</button></Alert.Description></Alert.Root>
      {:else}
        {#each items.filter((i) => i.at > splitMs) as item (`${item.kind}:${item.post.id}`)}
          {#if item.kind === "forum"}<ForumCard post={item.post} />
          {:else}<PostCard post={item.post} onchange={(n) => onFeedChange(item.post.id, n)} onposted={posted} />{/if}
        {/each}

        {#if caughtUp !== null}
          <div class="flex flex-col items-center gap-1 pt-4 pb-1.5 text-center">
            <span aria-hidden="true" class="flex size-7 items-center justify-center rounded-full border-[1.5px] border-emerald-500 text-emerald-500"><CheckIcon class="size-3.5" /></span>
            {#if feed.length === 0}
              <span class="text-sm font-semibold">Nothing here yet</span>
              <span class="text-xs text-muted-foreground">Follow people to see their workouts and posts. Some suggestions below.</span>
            {:else}
              <span class="text-sm font-semibold">You're all caught up</span>
              <span class="text-xs text-muted-foreground">{newPosts.length ? "You've seen every new post from people you follow." : "No new posts from people you follow."} Suggested posts below.</span>
            {/if}
          </div>
          {#each suggested ?? [] as s (s.post.id)}
            <PostCard post={s.post} reason={s.reason} suggested follow onchange={(n) => onSuggestedChange(s.post.id, n)} onposted={posted} />
          {/each}
          <div class="flex flex-wrap justify-center gap-2">
            <button type="button" onclick={() => go("discover")} class="h-8 rounded-[9px] border border-border px-3 text-xs">See more in Discover</button>
            {#if olderPosts.length && !showOlder}
              <button type="button" onclick={() => (showOlder = true)} class="h-8 rounded-[9px] border border-border px-3 text-xs">Show older posts</button>
            {/if}
          </div>
          {#if showOlder}
            <h2 class="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Older posts</h2>
            {#each items.filter((i) => i.at <= splitMs) as item (`${item.kind}:${item.post.id}`)}
              {#if item.kind === "forum"}<ForumCard post={item.post} />
              {:else}<PostCard post={item.post} onchange={(n) => onFeedChange(item.post.id, n)} onposted={posted} />{/if}
            {/each}
          {/if}
        {/if}
        <div bind:this={feedSentinel} class="h-px"></div>
        {#if feedStatus === "more"}<Skeleton class="h-32" />{/if}
      {/if}

    {:else if tab === "discover"}
      <p class="text-[13px] text-muted-foreground">Posts from people you don't follow yet. Each one says why it's here.</p>
      <PeopleSuggestions variant="grid" title="People you might know" limit={8} />
      {#if discStatus === "loading" || discStatus === "idle"}
        <Skeleton class="h-40" /><Skeleton class="h-40" />
      {:else if discStatus === "error"}
        <Alert.Root variant="destructive"><Alert.Description>Couldn't load Discover. <button type="button" class="underline" onclick={() => loadDiscover()}>Try again</button></Alert.Description></Alert.Root>
      {:else if disc.length === 0}
        <p class="py-10 text-center text-[13px] text-muted-foreground">Nothing to suggest yet. As more people post, they'll show up here.</p>
      {:else}
        {#each disc as d (d.post.id)}
          <PostCard post={d.post} reason={d.reason} follow onchange={(n) => onDiscChange(d.post.id, n)} onposted={posted} />
        {/each}
        <div bind:this={discSentinel} class="h-px"></div>
        {#if discStatus === "more"}<Skeleton class="h-32" />{/if}
      {/if}

    {:else if tab === "forum"}
      <p class="text-[13px] text-muted-foreground">Questions and threads from anyone on LogIt. Tag posts so people can find them: #sligo, #deadlift.</p>
      <ForumPosts>
        {#snippet top()}
          {#if trending?.length}
            <div class="flex flex-wrap gap-2" aria-label="Trending tags">
              {#each trending as t (t.tag)}<a href="/social/tag/{encodeURIComponent(t.tag)}" class="rounded-full border border-border px-3 py-1 text-[13px] text-sky-700 hover:bg-muted/40 dark:text-sky-300">#{t.tag}</a>{/each}
            </div>
          {/if}
        {/snippet}
      </ForumPosts>
    {:else}
      <Notifications />
    {/if}
  </div>

  <aside class="flex flex-[1_1_280px] flex-col gap-3.5">
    {#if tab === "following"}
      {#if profile}
        <section class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
          <div class="flex items-center gap-2.5">
            <Avatar name={profile.displayName} url={profile.avatarUrl} size={44} />
            <span><span class="block text-sm font-semibold">{profile.displayName}</span><span class="text-xs text-muted-foreground">@{profile.username}</span></span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-center text-xs">
            <a href="/social/{profile.username}?tab=followers"><span class="block text-base font-bold">{profile.followerCount}</span><span class="text-muted-foreground">Followers</span></a>
            <a href="/social/{profile.username}?tab=following"><span class="block text-base font-bold">{profile.followingCount}</span><span class="text-muted-foreground">Following</span></a>
          </div>
          <a href="/social/{profile.username}" class="text-xs text-muted-foreground hover:text-foreground">View my profile ›</a>
        </section>
      {/if}
      <PeopleSearch />
      <PeopleSuggestions title="People to follow" limit={4} />
    {:else if tab === "discover"}
      <PeopleSearch />
      <PrivacyCard bind:settings />
      <section class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <h2 class="text-sm font-semibold">Not interested?</h2>
        <p class="text-xs leading-relaxed text-muted-foreground">Use ··· on a post: "Not interested" stops Discover showing you that person. Block and Report work as everywhere else.</p>
      </section>
    {:else}
      <PrivacyCard bind:settings />
    {/if}
  </aside>
</div>

<Composer bind:open={composerOpen} {discoverOn} onposted={posted} />
