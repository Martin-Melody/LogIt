<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    Loader2, UserPlus, UserCheck, MoreHorizontal, Flag, Ban,
    ChevronDown, ChevronRight, Dumbbell, Pencil,
  } from "lucide-svelte";
  import { socialApi, type ApiProfile, type ApiPost, type PublicProfileData } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { toast } from "svelte-sonner";
  import PostCard from "./PostCard.svelte";
  import ReportSheet from "./ReportSheet.svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import WeightTrendWidget from "$lib/features/profileWidgets/components/WeightTrendWidget.svelte";
  import StreakWidget from "$lib/features/profileWidgets/components/StreakWidget.svelte";
  import MilestoneBadgesWidget from "$lib/features/profileWidgets/components/MilestoneBadgesWidget.svelte";

  interface Props {
    username: string;
    /** Rendered under the header (e.g. an Edit button on your own profile). */
    headerActions?: import("svelte").Snippet;
    /** `data-tour` id for the avatar element — only the self-profile page passes this
     * (its onboarding tour needs a stable target); left unset for every other caller so a
     * visited profile never carries a self-page tour tag. */
    avatarTourId?: string;
  }

  const { username, headerActions, avatarTourId }: Props = $props();

  let profile = $state<ApiProfile | null>(null);
  let profileError = $state<string | null>(null);
  let profileLoading = $state(true);

  let posts = $state<ApiPost[]>([]);
  let postsLoading = $state(true);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);
  let sentinel = $state<HTMLDivElement | null>(null);

  let followLoading = $state(false);
  let menuOpen = $state(false);
  let reportOpen = $state(false);
  let confirmBlock = $state(false);
  let blocking = $state(false);
  let statsOpen = $state(false);
  let commentPost = $state<ApiPost | null>(null);

  const isSelf = $derived(profile?.isSelf ?? authStore.user?.username === username);

  onMount(() => {
    void loadProfile();
    void loadPosts();
  });

  $effect(() => {
    if (menuOpen) { openOverlay(); return () => closeOverlay(); }
  });

  async function loadProfile() {
    profileLoading = true;
    profileError = null;
    try {
      profile = await socialApi.getProfile(username);
    } catch (e) {
      profileError = e instanceof ApiError && e.status === 404 ? "User not found." : "Couldn't load this profile.";
    } finally {
      profileLoading = false;
    }
  }

  async function loadPosts(more = false) {
    if (more) loadingMore = true;
    else postsLoading = true;
    try {
      const page = await socialApi.getUserPosts(username, 20, more ? nextCursor ?? undefined : undefined);
      posts = more ? [...posts, ...page.posts] : page.posts;
      nextCursor = page.nextCursor;
    } catch {
      // leave what we have
    } finally {
      postsLoading = false;
      loadingMore = false;
    }
  }

  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && nextCursor && !loadingMore) void loadPosts(true);
    }, { rootMargin: "500px" });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  async function toggleFollow() {
    if (!authStore.isAuthenticated) { void goto("/auth?mode=login"); return; }
    if (!profile || profile.isSelf || followLoading) return;
    followLoading = true;
    const was = profile.isFollowing;
    profile = { ...profile, isFollowing: !was, followerCount: profile.followerCount + (was ? -1 : 1) };
    try {
      if (was) await socialApi.unfollow(username);
      else await socialApi.follow(username);
    } catch {
      profile = { ...profile, isFollowing: was, followerCount: profile.followerCount + (was ? 1 : -1) };
    } finally {
      followLoading = false;
    }
  }

  async function doBlock() {
    if (blocking) return;
    blocking = true;
    try {
      await socialApi.blockUser(username);
      toast.success(`Blocked @${username}`);
      void goto("/social");
    } catch {
      toast.error("Couldn't block this account");
      blocking = false;
      confirmBlock = false;
    }
  }

  const publicData = $derived.by((): PublicProfileData | null => {
    if (!profile?.publicProfileJson) return null;
    try { return JSON.parse(profile.publicProfileJson) as PublicProfileData; }
    catch { return null; }
  });

  const stats = $derived.by(() => {
    const d = publicData;
    if (!d) return [];
    const enabled = new Set(d.widgets.filter((w) => w.enabled).map((w) => w.id));
    const out: { key: string; render: "body" | "split" | "prs" | "photo" | "weight" | "streak" | "badges" }[] = [];
    if (enabled.has("profile-body-stats") && d.bodyStats) out.push({ key: "body", render: "body" });
    if (enabled.has("profile-active-split") && d.activeSplit) out.push({ key: "split", render: "split" });
    if (enabled.has("profile-personal-records") && d.personalRecords?.length) out.push({ key: "prs", render: "prs" });
    if (enabled.has("profile-progress-photo") && d.progressPhoto) out.push({ key: "photo", render: "photo" });
    if (enabled.has("profile-weight-trend") && d.weightTrend?.points.length) out.push({ key: "weight", render: "weight" });
    if (enabled.has("profile-streak") && d.streak) out.push({ key: "streak", render: "streak" });
    if (enabled.has("profile-milestones") && d.badges?.length) out.push({ key: "badges", render: "badges" });
    return out;
  });

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  function fmt(v: number | null | undefined, unit: string) {
    return v != null ? `${v} ${unit}` : "—";
  }

  function onPostChange(id: string, next: ApiPost | null) {
    posts = next ? posts.map((p) => (p.id === id ? next : p)) : posts.filter((p) => p.id !== id);
  }
</script>

{#if profileLoading}
  <div class="flex justify-center py-16"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>

{:else if profileError}
  <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
    <p class="text-sm text-muted-foreground">{profileError}</p>
    <button type="button" class="text-sm text-primary" onclick={loadProfile}>Try again</button>
  </div>

{:else if profile}
  <!-- Header -->
  <div class="flex flex-col items-center gap-3 px-4 pt-6 pb-5 border-b border-border">
    <div data-tour={avatarTourId} class="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-xl font-semibold overflow-hidden">
      {#if profile.avatarUrl}
        <img src={profile.avatarUrl} alt={profile.displayName} class="h-full w-full object-cover" />
      {:else}
        {initials(profile.displayName)}
      {/if}
    </div>

    <div class="text-center">
      <p class="text-lg font-bold leading-tight">{profile.displayName}</p>
      <p class="text-sm text-muted-foreground">@{profile.username}</p>
    </div>

    {#if profile.bio}
      <p class="text-sm text-muted-foreground text-center max-w-xs whitespace-pre-wrap">{profile.bio}</p>
    {/if}

    <div class="flex items-center gap-6 text-sm">
      <button type="button" class="text-center" onclick={() => goto(`/social/${username}/followers`)}>
        <span class="font-semibold tabular-nums">{profile.followerCount}</span>
        <span class="text-xs text-muted-foreground block">followers</span>
      </button>
      <button type="button" class="text-center" onclick={() => goto(`/social/${username}/following`)}>
        <span class="font-semibold tabular-nums">{profile.followingCount}</span>
        <span class="text-xs text-muted-foreground block">following</span>
      </button>
    </div>

    {#if isSelf}
      {#if headerActions}
        {@render headerActions()}
      {:else}
        <button type="button" class="flex items-center gap-1.5 px-5 py-2 rounded border border-border text-sm font-medium hover:bg-muted/40" onclick={() => goto("/profile")}>
          <Pencil class="h-3.5 w-3.5" /> Edit profile
        </button>
      {/if}
    {:else}
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 px-5 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50
            {profile.isFollowing ? 'border border-border bg-background hover:bg-muted/40' : 'bg-primary text-primary-foreground'}"
          disabled={followLoading}
          onclick={toggleFollow}
        >
          {#if profile.isFollowing}<UserCheck class="h-4 w-4" /> Following{:else}<UserPlus class="h-4 w-4" /> Follow{/if}
        </button>
        <button type="button" class="p-2 rounded border border-border text-muted-foreground" aria-label="More" onclick={() => (menuOpen = true)}>
          <MoreHorizontal class="h-4 w-4" />
        </button>
      </div>
    {/if}
  </div>

  <!-- Stats (collapsible) -->
  {#if stats.length > 0}
    <div class="border-b border-border">
      <button type="button" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium" onclick={() => (statsOpen = !statsOpen)}>
        <span class="flex items-center gap-2"><Dumbbell class="h-4 w-4 text-muted-foreground" /> Training stats</span>
        {#if statsOpen}<ChevronDown class="h-4 w-4 text-muted-foreground" />{:else}<ChevronRight class="h-4 w-4 text-muted-foreground" />{/if}
      </button>
      {#if statsOpen && publicData}
        <div class="px-4 pb-4 flex flex-col gap-3">
          {#each stats as s (s.key)}
            {#if s.render === "body" && publicData.bodyStats}
              <div class="rounded-lg border border-border p-3">
                <p class="text-xs font-semibold mb-1.5">Body</p>
                <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt class="text-muted-foreground">Height</dt><dd class="font-medium">{fmt(publicData.bodyStats.height, publicData.bodyStats.heightUnit)}</dd>
                  <dt class="text-muted-foreground">Weight</dt><dd class="font-medium">{fmt(publicData.bodyStats.weight, publicData.bodyStats.weightUnit)}</dd>
                </dl>
              </div>
            {:else if s.render === "split" && publicData.activeSplit}
              <div class="rounded-lg border border-border p-3">
                <p class="text-xs font-semibold mb-1.5">Active split</p>
                <p class="text-sm font-medium">{publicData.activeSplit.name}</p>
                <ul class="mt-1.5 flex flex-col gap-1">
                  {#each publicData.activeSplit.days as day}
                    <li class="flex items-center justify-between text-xs gap-2">
                      <span class="text-muted-foreground shrink-0">{day.name}</span>
                      <span class="text-right text-foreground/70 truncate">{day.exercises.slice(0, 3).join(", ")}{day.exercises.length > 3 ? "…" : ""}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {:else if s.render === "prs" && publicData.personalRecords?.length}
              <div class="rounded-lg border border-border p-3">
                <p class="text-xs font-semibold mb-1.5">Personal records</p>
                <ul class="flex flex-col divide-y divide-border">
                  {#each publicData.personalRecords as pr (pr.exerciseName)}
                    <li class="flex items-center justify-between py-1.5 text-sm gap-2">
                      <span class="truncate text-foreground/90">{pr.exerciseName}</span>
                      <span class="font-medium tabular-nums shrink-0">{pr.weight} kg × {pr.reps}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {:else if s.render === "photo" && publicData.progressPhoto}
              <div class="rounded-lg border border-border p-3">
                <p class="text-xs font-semibold mb-1.5">Progress photo</p>
                <img
                  src={publicData.progressPhoto.dataUrl}
                  alt="{profile.displayName}'s current progress photo"
                  class="w-full rounded-md object-cover aspect-square"
                />
              </div>
            {:else if s.render === "weight" && publicData.weightTrend}
              <WeightTrendWidget data={publicData.weightTrend} />
            {:else if s.render === "streak" && publicData.streak}
              <StreakWidget data={publicData.streak} />
            {:else if s.render === "badges" && publicData.badges}
              <MilestoneBadgesWidget data={publicData.badges} />
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Posts -->
  {#if postsLoading}
    <div class="flex justify-center py-12"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
  {:else if posts.length === 0}
    <p class="text-sm text-muted-foreground text-center py-12">No posts yet.</p>
  {:else}
    <div class="divide-y divide-border">
      {#each posts as post (post.id)}
        <PostCard {post} onopencomments={(p) => (commentPost = p)} onchange={(next) => onPostChange(post.id, next)} />
      {/each}
    </div>
    <div bind:this={sentinel} class="h-px"></div>
    {#if loadingMore}
      <div class="flex justify-center py-4"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
    {/if}
  {/if}
{/if}

<!-- Profile overflow menu -->
{#if menuOpen}
  <button type="button" class="fixed inset-0 bg-black/40 z-40" aria-label="Close" onclick={() => (menuOpen = false)}></button>
  <div class="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)]">
    <div class="py-1">
      <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-muted/50" onclick={() => { menuOpen = false; reportOpen = true; }}>
        <Flag class="h-4 w-4 text-muted-foreground" /> Report @{username}
      </button>
      <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm text-destructive hover:bg-muted/50" onclick={() => { menuOpen = false; confirmBlock = true; }}>
        <Ban class="h-4 w-4" /> Block @{username}
      </button>
    </div>
  </div>
{/if}

<ReportSheet
  open={reportOpen}
  targetType="User"
  targetId={profile?.id ?? ""}
  what={`@${username}`}
  onclose={() => (reportOpen = false)}
/>

{#if confirmBlock}
  <button type="button" class="fixed inset-0 bg-black/50 z-50" aria-label="Cancel" onclick={() => (confirmBlock = false)}></button>
  <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(90vw,20rem)] rounded-xl border border-border bg-background p-5 flex flex-col gap-3">
    <p class="text-sm font-semibold">Block @{username}?</p>
    <p class="text-xs text-muted-foreground">You won't see each other's posts, comments, or profiles, and you'll both stop following each other. Undo from Settings.</p>
    <div class="flex gap-2 justify-end pt-1">
      <button type="button" class="text-xs text-muted-foreground px-3 py-1.5" onclick={() => (confirmBlock = false)}>Cancel</button>
      <button type="button" class="text-xs bg-destructive text-destructive-foreground rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50" disabled={blocking} onclick={doBlock}>
        {#if blocking}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if} Block
      </button>
    </div>
  </div>
{/if}

<CommentSheet
  post={commentPost}
  onclose={() => (commentPost = null)}
  oncommentcountchange={(id, delta) => { posts = posts.map((p) => (p.id === id ? { ...p, commentCount: p.commentCount + delta } : p)); }}
/>
