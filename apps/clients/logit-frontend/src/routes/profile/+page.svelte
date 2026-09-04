<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    Settings, Pencil, Check, X, SlidersHorizontal, Dumbbell, Cloud, Server, Rss,
    Trophy, MessageSquare, CalendarDays, Activity, Cpu, LayoutDashboard,
    Heart, PenSquare, Loader2, MessageCircle, Trash2,
  } from "lucide-svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import { startProfileTour } from "$lib/tour/index";
  import ProfileAvatar from "$lib/components/ProfileAvatar.svelte";
  import CreatePostSheet from "$lib/components/CreatePostSheet.svelte";
  import { Button } from "$lib/components/ui/button";
  import { profile } from "$lib/stores/profile.store";
  import { profileConfig } from "$lib/stores/profileConfig.store";
  import { localProfileWidgetRegistry } from "$lib/features/profileWidgets/localProfileWidgetRegistry";
  import { authStore } from "$lib/api/authStore.svelte";
  import { getServerMode } from "@logit/core/api/serverConfig";
  import { socialApi, type ApiProfile, type ApiPost } from "@logit/core/api/socialApi";
  import { formatDistanceToNow } from "$lib/utils";
  import { pushPublicProfileSnapshot } from "$lib/features/profileWidgets/publicProfileSync";

  // --- Profile editing ---
  let editing = $state(false);
  const draft = $state({ name: "", bio: "" });

  function openEdit() {
    draft.name = $profile.name;
    draft.bio = $profile.bio;
    editing = true;
  }

  function saveEdit() {
    profile.save({ name: draft.name.trim(), bio: draft.bio.trim() });
    editing = false;
    void syncPublicProfile();
  }

  const serverMode = getServerMode();

  // --- Widgets ---
  const widgets = localProfileWidgetRegistry.list();

  const enabledWidgets = $derived(
    [...$profileConfig.slots]
      .filter((s) => s.enabled)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => ({ slot: s, def: widgets.find((w) => w.id === s.id) }))
      .filter((x): x is { slot: typeof x.slot; def: NonNullable<typeof x.def> } => x.def !== undefined),
  );

  // --- Social data (only when authenticated) ---
  let socialProfile = $state<ApiProfile | null>(null);
  let posts = $state<ApiPost[]>([]);
  let postsLoading = $state(false);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);
  let showCreatePost = $state(false);
  let commentPost = $state<ApiPost | null>(null);

  async function loadSocialData() {
    if (!authStore.isAuthenticated || !authStore.user) return;
    try {
      const [p, page] = await Promise.all([
        socialApi.getProfile(authStore.user.username),
        socialApi.getUserPosts(authStore.user.username, 20),
      ]);
      socialProfile = p;
      posts = page.posts;
      nextCursor = page.nextCursor;
    } catch {
      // non-fatal
    } finally {
      postsLoading = false;
    }
    // background sync of widget data — fire and forget
    void syncPublicProfile();
  }

  // Delegates to the shared function (publicProfileSync.ts) rather than building the PATCH
  // inline — extracted out so it survives the planned self-page/ProfileView unification
  // unchanged. Kept as a local wrapper so existing call sites below don't need renaming.
  const syncPublicProfile = pushPublicProfileSnapshot;

  async function loadMorePosts() {
    if (!authStore.user || !nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const page = await socialApi.getUserPosts(authStore.user.username, 20, nextCursor);
      posts = [...posts, ...page.posts];
      nextCursor = page.nextCursor;
    } catch {
      // ignore
    } finally {
      loadingMore = false;
    }
  }


  let _lastAvatarUrl = $state<string | undefined>(undefined);

  $effect(() => {
    const current = $profile.avatarDataUrl;
    if (authStore.isAuthenticated && current && current !== _lastAvatarUrl) {
      _lastAvatarUrl = current;
      void syncPublicProfile();
    }
  });

  onMount(() => {
    void startProfileTour();
    if (authStore.isAuthenticated) {
      postsLoading = true;
      _lastAvatarUrl = $profile.avatarDataUrl; // seed so effect doesn't double-fire on load
      void loadSocialData();
    }
  });
</script>

<div class="flex flex-col pb-24">

  <!-- Settings gear -->
  <div class="flex justify-end px-3 pt-3">
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => void goto("/settings")} data-tour="profile-settings">
      <Settings class="h-4 w-4" />
    </Button>
  </div>

  <!-- Profile header -->
  <div class="flex flex-col items-center gap-3 px-4 pt-2 pb-6">
    <!-- Avatar -->
    <div data-tour="profile-avatar">
      <ProfileAvatar
        name={$profile.name}
        avatarDataUrl={$profile.avatarDataUrl}
        editable={!editing}
        class="h-24 w-24"
      />
    </div>

    <!-- Name + bio / edit form -->
    {#if editing}
      <div class="w-full max-w-xs flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="p-name">Name</label>
          <input
            id="p-name"
            type="text"
            autocomplete="name"
            class="w-full rounded border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={draft.name}
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-muted-foreground" for="p-bio">Bio</label>
          <textarea
            id="p-bio"
            rows={3}
            placeholder="Something about yourself…"
            class="w-full rounded border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            bind:value={draft.bio}
          ></textarea>
        </div>
        <div class="flex gap-2 justify-center">
          <Button size="sm" onclick={saveEdit}><Check class="h-3.5 w-3.5 mr-1" /> Save</Button>
          <Button size="sm" variant="outline" onclick={() => (editing = false)}><X class="h-3.5 w-3.5 mr-1" /> Cancel</Button>
        </div>
      </div>
    {:else}
      <div class="text-center flex flex-col gap-1">
        <h1 class="text-xl font-bold">{$profile.name || "Your Name"}</h1>
        {#if authStore.isAuthenticated && authStore.user}
          <p class="text-sm text-muted-foreground">@{authStore.user.username}</p>
        {/if}
        {#if $profile.bio}
          <p class="text-sm text-muted-foreground max-w-xs mt-0.5">{$profile.bio}</p>
        {:else}
          <p class="text-sm text-muted-foreground/50 italic mt-0.5">Add a bio…</p>
        {/if}
      </div>

      <!-- Follower / following counts (only when social profile loaded) -->
      {#if socialProfile}
        <div class="flex items-center gap-5 text-sm">
          <div class="text-center">
            <p class="font-semibold tabular-nums">{socialProfile.followerCount}</p>
            <p class="text-xs text-muted-foreground">followers</p>
          </div>
          <div class="text-center">
            <p class="font-semibold tabular-nums">{socialProfile.followingCount}</p>
            <p class="text-xs text-muted-foreground">following</p>
          </div>
        </div>
      {/if}

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={openEdit} data-tour="profile-edit">
          <Pencil class="h-3.5 w-3.5 mr-1.5" /> Edit profile
        </Button>
        {#if authStore.isAuthenticated}
          <Button variant="outline" size="sm" onclick={() => (showCreatePost = true)}>
            <PenSquare class="h-3.5 w-3.5 mr-1.5" /> New post
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Account status bar -->
  <div class="mx-3 mb-1">
    {#if authStore.isAuthenticated && authStore.user}
      <div class="flex items-center gap-3 rounded border border-border px-3 py-2">
        {#if serverMode === "cloud"}
          <Cloud class="h-3.5 w-3.5 text-primary shrink-0" />
        {:else}
          <Server class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {/if}
        <p class="text-xs text-muted-foreground flex-1 min-w-0 truncate">
          {serverMode === "cloud" ? "Logit cloud" : "Self-hosted"}
        </p>
        <Button variant="ghost" size="sm" class="text-muted-foreground h-7 text-xs shrink-0"
          onclick={() => void authStore.logout()}>
          Sign out
        </Button>
      </div>
    {:else}
      <button
        type="button"
        class="w-full flex items-center justify-between rounded border border-dashed border-border px-3 py-2.5 text-left hover:border-muted-foreground/50 transition-colors"
        onclick={() => void goto("/auth?mode=register")}
      >
        <div>
          <p class="text-sm font-medium">Create an account</p>
          <p class="text-xs text-muted-foreground">Unlock social features and cloud backup.</p>
        </div>
        <Cloud class="h-4 w-4 text-muted-foreground/50 shrink-0 ml-3" />
      </button>
    {/if}
  </div>

  <!-- Profile widgets -->
  <div class="flex flex-col gap-3 px-3" data-tour="profile-widgets">
    {#each enabledWidgets as { def } (def.id)}
      <svelte:component this={def.component} {...(def.props ?? {})} />
    {/each}
  </div>

  <!-- Bottom actions -->
  <div class="flex justify-center gap-1 mt-6 flex-wrap px-2">
    <Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" onclick={() => void goto("/exercises")}>
      <Dumbbell class="h-3.5 w-3.5" /> Exercise library
    </Button>
    <span class="text-muted-foreground/30 self-center">·</span>
    <Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" onclick={() => void goto("/profile/customize")}>
      <SlidersHorizontal class="h-3.5 w-3.5" /> Customise
    </Button>
    {#if authStore.isAuthenticated}
      <span class="text-muted-foreground/30 self-center">·</span>
      <Button variant="ghost" size="sm" class="text-muted-foreground gap-1.5" onclick={() => void goto("/social")}>
        <Rss class="h-3.5 w-3.5" /> Feed
      </Button>
    {/if}
  </div>

  <!-- Posts (only when authenticated) -->
  {#if authStore.isAuthenticated}
    <div class="mt-4 border-t border-border">
      <div class="flex items-center justify-between px-4 py-3">
        <p class="text-sm font-semibold">Posts</p>
      </div>

      {#if postsLoading}
        <div class="flex justify-center py-8">
          <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      {:else if posts.length === 0}
        <p class="text-sm text-muted-foreground text-center py-8 px-6">No posts yet. Share a workout or write something!</p>
      {:else}
        <div class="flex flex-col divide-y divide-border">
          {#each posts as post (post.id)}
            <PostCard
              {post}
              onopencomments={(p) => (commentPost = p)}
              onchange={(next) => { posts = next ? posts.map((p) => p.id === post.id ? next : p) : posts.filter((p) => p.id !== post.id); }}
            />
          {/each}
        </div>

        {#if nextCursor}
          <div class="flex justify-center py-4">
            <button
              type="button"
              class="text-sm text-muted-foreground flex items-center gap-1.5 disabled:opacity-50"
              disabled={loadingMore}
              onclick={() => void loadMorePosts()}
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
    </div>
  {/if}

</div>

<CreatePostSheet
  open={showCreatePost}
  onposted={(post) => { posts = [post, ...posts]; if (socialProfile) socialProfile = { ...socialProfile }; }}
  onclose={() => (showCreatePost = false)}
/>

<CommentSheet
  post={commentPost}
  onclose={() => (commentPost = null)}
  oncommentcountchange={(id, delta) => {
    posts = posts.map((p) => p.id === id ? { ...p, commentCount: p.commentCount + delta } : p);
  }}
/>
