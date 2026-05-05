<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    ArrowLeft, Loader2, Dumbbell, Trophy, MessageSquare,
    CalendarDays, Activity, Cpu, LayoutDashboard, UserPlus, UserCheck, Heart, MessageCircle,
  } from "lucide-svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiProfile, type ApiPost, type PublicProfileData } from "$lib/api/socialApi";
  import { ApiError } from "$lib/api/client";
  import ConnectAccountPrompt from "$lib/components/ConnectAccountPrompt.svelte";
  import * as Card from "$lib/components/ui/card";
  import { formatDistanceToNow } from "$lib/utils";

  const props = $props<{ params: { username: string } }>();
  const username = $derived(props.params.username);

  // ── State ────────────────────────────────────────────────────────────────────

  let profile = $state<ApiProfile | null>(null);
  let profileLoading = $state(true);
  let profileError = $state<string | null>(null);

  let posts = $state<ApiPost[]>([]);
  let postsLoading = $state(true);
  let postsError = $state<string | null>(null);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);

  let followLoading = $state(false);
  let showConnectPrompt = $state(false);
  let likingId = $state<string | null>(null);
  let commentPost = $state<ApiPost | null>(null);

  async function toggleLike(post: ApiPost) {
    if (!authStore.isAuthenticated) { showConnectPrompt = true; return; }
    if (likingId === post.id) return;
    likingId = post.id;
    const wasLiked = post.isLikedByMe;
    posts = posts.map((p) =>
      p.id === post.id
        ? { ...p, isLikedByMe: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) }
        : p,
    );
    try {
      if (wasLiked) await socialApi.unlikePost(post.id);
      else await socialApi.likePost(post.id);
    } catch {
      posts = posts.map((p) =>
        p.id === post.id
          ? { ...p, isLikedByMe: wasLiked, likeCount: p.likeCount + (wasLiked ? 1 : -1) }
          : p,
      );
    } finally {
      likingId = null;
    }
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function loadProfile() {
    profileLoading = true;
    profileError = null;
    try {
      profile = await socialApi.getProfile(username);
    } catch (e) {
      profileError = e instanceof ApiError && e.status === 404
        ? "User not found."
        : "Couldn't load profile.";
    } finally {
      profileLoading = false;
    }
  }

  async function loadPosts(reset = true) {
    if (reset) postsLoading = true;
    else loadingMore = true;
    postsError = null;
    try {
      const page = await socialApi.getUserPosts(username, 20, reset ? undefined : nextCursor ?? undefined);
      if (reset) posts = page.posts;
      else posts = [...posts, ...page.posts];
      nextCursor = page.nextCursor;
    } catch {
      postsError = "Couldn't load posts.";
    } finally {
      postsLoading = false;
      loadingMore = false;
    }
  }

  onMount(() => {
    void loadProfile();
    void loadPosts();
  });

  // ── Follow / unfollow ────────────────────────────────────────────────────────

  async function toggleFollow() {
    if (!authStore.isAuthenticated) {
      showConnectPrompt = true;
      return;
    }
    if (!profile || profile.isSelf || followLoading) return;

    followLoading = true;
    const wasFollowing = profile.isFollowing;

    // Optimistic update
    profile = {
      ...profile,
      isFollowing: !wasFollowing,
      followerCount: profile.followerCount + (wasFollowing ? -1 : 1),
    };

    try {
      if (wasFollowing) await socialApi.unfollow(username);
      else await socialApi.follow(username);
    } catch {
      // Revert on failure
      profile = {
        ...profile,
        isFollowing: wasFollowing,
        followerCount: profile.followerCount + (wasFollowing ? 1 : -1),
      };
    } finally {
      followLoading = false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function postIcon(type: ApiPost["type"]) {
    if (type === "WorkoutSession") return Dumbbell;
    if (type === "PersonalRecord") return Trophy;
    if (type === "Split") return CalendarDays;
    if (type === "Exercise") return Activity;
    if (type === "Algorithm") return Cpu;
    if (type === "Widget") return LayoutDashboard;
    return MessageSquare;
  }

  function initials(name: string): string {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  const publicData = $derived((): PublicProfileData | null => {
    if (!profile?.publicProfileJson) return null;
    try { return JSON.parse(profile.publicProfileJson) as PublicProfileData; }
    catch { return null; }
  });

  function isWidgetEnabled(data: PublicProfileData, id: string) {
    const slot = data.widgets.find((w) => w.id === id);
    return slot?.enabled ?? false;
  }

  function orderedWidgets(data: PublicProfileData) {
    return [...data.widgets]
      .filter((w) => w.enabled)
      .sort((a, b) => a.order - b.order);
  }

  function fmtStat(val: number | null | undefined, unit: string) {
    return val != null ? `${val} ${unit}` : "—";
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
    <span class="text-sm font-semibold flex-1 truncate">
      {profile ? `@${profile.username}` : "Profile"}
    </span>
  </div>

  {#if profileLoading}
    <div class="flex justify-center py-16">
      <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
    </div>

  {:else if profileError}
    <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
      <p class="text-sm text-muted-foreground">{profileError}</p>
      <button type="button" class="text-sm text-primary" onclick={() => void loadProfile()}>Try again</button>
    </div>

  {:else if profile}
    <!-- Profile header -->
    <div class="flex flex-col items-center gap-3 px-4 pt-6 pb-5 border-b border-border">
      <!-- Avatar -->
      <div class="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-xl font-semibold shrink-0">
        {#if profile.avatarUrl}
          <img src={profile.avatarUrl} alt={profile.displayName} class="h-full w-full rounded-full object-cover" />
        {:else}
          {initials(profile.displayName)}
        {/if}
      </div>

      <!-- Name + username -->
      <div class="text-center">
        <p class="text-lg font-bold leading-tight">{profile.displayName}</p>
        <p class="text-sm text-muted-foreground">@{profile.username}</p>
      </div>

      <!-- Bio -->
      {#if profile.bio}
        <p class="text-sm text-muted-foreground text-center max-w-xs">{profile.bio}</p>
      {/if}

      <!-- Follower / following counts -->
      <div class="flex items-center gap-5 text-sm">
        <div class="text-center">
          <p class="font-semibold tabular-nums">{profile.followerCount}</p>
          <p class="text-xs text-muted-foreground">followers</p>
        </div>
        <div class="text-center">
          <p class="font-semibold tabular-nums">{profile.followingCount}</p>
          <p class="text-xs text-muted-foreground">following</p>
        </div>
      </div>

      <!-- Follow / unfollow button -->
      {#if !profile.isSelf}
        <button
          type="button"
          class="flex items-center gap-1.5 px-5 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50
            {profile.isFollowing
              ? 'border border-border text-foreground bg-background hover:bg-muted/40'
              : 'bg-primary text-primary-foreground'}"
          disabled={followLoading}
          onclick={() => void toggleFollow()}
        >
          {#if profile.isFollowing}
            <UserCheck class="h-4 w-4" /> Following
          {:else}
            <UserPlus class="h-4 w-4" /> Follow
          {/if}
        </button>
      {/if}
    </div>

    <!-- Public profile widgets -->
    {#if publicData()}
      {@const data = publicData()!}
      <div class="flex flex-col gap-3 px-3 py-4 border-b border-border">
        {#each orderedWidgets(data) as slot (slot.id)}
          {#if slot.id === "profile-body-stats" && data.bodyStats}
            {@const bs = data.bodyStats}
            <Card.Root>
              <Card.Header><Card.Title class="text-sm">Body Stats</Card.Title></Card.Header>
              <Card.Content>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <dt class="text-muted-foreground">Height</dt>
                  <dd class="font-medium">{fmtStat(bs.height, bs.heightUnit)}</dd>
                  <dt class="text-muted-foreground">Weight</dt>
                  <dd class="font-medium">{fmtStat(bs.weight, bs.weightUnit)}</dd>
                </dl>
              </Card.Content>
            </Card.Root>

          {:else if slot.id === "profile-active-split" && data.activeSplit}
            {@const sp = data.activeSplit}
            <Card.Root>
              <Card.Header><Card.Title class="text-sm">Active Split</Card.Title></Card.Header>
              <Card.Content>
                <p class="text-sm font-medium">{sp.name}</p>
                {#if sp.days.length > 0}
                  <ul class="mt-2 flex flex-col gap-1">
                    {#each sp.days as day}
                      <li class="flex items-center justify-between text-xs">
                        <span class="text-muted-foreground">{day.name}</span>
                        <span class="text-right text-foreground/70">
                          {day.exercises.slice(0, 3).join(", ")}{day.exercises.length > 3 ? "…" : ""}
                        </span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </Card.Content>
            </Card.Root>

          {:else if slot.id === "profile-personal-records" && data.personalRecords?.length}
            <Card.Root>
              <Card.Header><Card.Title class="text-sm">Personal Records</Card.Title></Card.Header>
              <Card.Content>
                <ul class="flex flex-col divide-y divide-border">
                  {#each data.personalRecords as pr (pr.exerciseName)}
                    <li class="flex items-center justify-between py-1.5 text-sm">
                      <span class="truncate text-foreground/90 max-w-[55%]">{pr.exerciseName}</span>
                      <span class="font-medium tabular-nums shrink-0">{pr.weight} kg × {pr.reps}</span>
                    </li>
                  {/each}
                </ul>
              </Card.Content>
            </Card.Root>
          {/if}
        {/each}
      </div>
    {/if}

    <!-- Posts -->
    {#if postsLoading}
      <div class="flex justify-center py-12">
        <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    {:else if postsError}
      <div class="flex flex-col items-center gap-3 py-12 text-center px-6">
        <p class="text-sm text-muted-foreground">{postsError}</p>
        <button type="button" class="text-sm text-primary" onclick={() => void loadPosts()}>Try again</button>
      </div>
    {:else if posts.length === 0}
      <p class="text-sm text-muted-foreground text-center py-12">No posts yet.</p>
    {:else}
      <ul class="flex flex-col divide-y divide-border">
        {#each posts as post (post.id)}
          {@const Icon = postIcon(post.type)}
          <li class="px-4 py-3 flex flex-col gap-2">
            <!-- Type icon + timestamp -->
            <div class="flex items-center justify-between">
              <Icon class="h-3.5 w-3.5 text-muted-foreground" />
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-muted-foreground">{relativeTime(post.createdAt)}</span>
                {#if post.editedAt}<span class="text-[10px] text-muted-foreground/60 italic">edited</span>{/if}
              </div>
            </div>

            {#if post.body}
              <p class="text-sm">{post.body}</p>
            {/if}

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

      {#if nextCursor}
        <div class="flex justify-center py-4">
          <button
            type="button"
            class="text-sm text-muted-foreground flex items-center gap-1.5 disabled:opacity-50"
            disabled={loadingMore}
            onclick={() => void loadPosts(false)}
          >
            {#if loadingMore}
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading…
            {:else}
              Load more
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<ConnectAccountPrompt
  open={showConnectPrompt}
  feature="Following people"
  onclose={() => (showConnectPrompt = false)}
/>

<CommentSheet
  post={commentPost}
  onclose={() => (commentPost = null)}
  oncommentcountchange={(id, delta) => {
    posts = posts.map((p) => p.id === id ? { ...p, commentCount: p.commentCount + delta } : p);
  }}
/>
