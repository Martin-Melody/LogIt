<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import LockIcon from "@lucide/svelte/icons/lock";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { toast } from "$lib/components/ui/sonner";
  import { ApiError } from "@logit/core/api/client";
  import { isPrivateError, socialApi, type ApiPost, type ApiProfile, type FollowStatus } from "@logit/core/api/socialApi";
  import Avatar from "$lib/features/social/Avatar.svelte";
  import FollowButton from "$lib/features/social/FollowButton.svelte";
  import PostCard from "$lib/features/social/PostCard.svelte";
  import ProfileCards from "$lib/features/social/ProfileCards.svelte";
  import ProfileEditor from "$lib/features/social/ProfileEditor.svelte";
  import ReportDialog from "$lib/features/social/ReportDialog.svelte";
  import MentionText from "$lib/features/social/MentionText.svelte";
  import ForumPosts from "$lib/features/social/ForumPosts.svelte";

  // Someone's profile (or yours): their cards, posts, followers and who they follow. A
  // private account you don't follow shows only the header and a lock.
  const username = $derived((page.params.username ?? "").toLowerCase());
  type Tab = "posts" | "forum" | "followers" | "following";
  const tab = $derived<Tab>((["forum", "followers", "following"] as const).find((t) => t === page.url.searchParams.get("tab")) ?? "posts");

  let profile = $state<ApiProfile | null>(null);
  let error = $state<string | null>(null);
  let status = $state<FollowStatus>("none");
  let posts = $state<ApiPost[] | null>(null);
  let cursor = $state<string | null>(null);
  let people = $state<ApiProfile[] | null>(null);
  let reportOpen = $state(false);
  let blockOpen = $state(false);
  let removing = $state<ApiProfile | null>(null);
  let removeOpen = $state(false);
  let editing = $state(false);

  const locked = $derived(!!profile && profile.canSeeContent === false);

  async function loadProfile(u: string) {
    editing = false;
    profile = null;
    error = null;
    posts = null;
    people = null;
    try {
      const p = await socialApi.getProfile(u);
      if (u !== username) return;
      profile = p;
      status = p.followStatus ?? (p.isFollowing ? "following" : "none");
    } catch (e) {
      if (u === username) error = e instanceof ApiError && e.status === 404 ? "There's nobody with that username, or they've blocked you." : "Couldn't load this profile.";
    }
  }
  $effect(() => { void loadProfile(username); });

  async function loadPosts(more = false) {
    try {
      const r = await socialApi.getUserPosts(username, 20, more ? cursor ?? undefined : undefined);
      posts = more ? [...(posts ?? []), ...r.posts] : r.posts;
      cursor = r.nextCursor;
    } catch (e) {
      posts = [];
      if (!isPrivateError(e)) toast.error("Couldn't load posts");
    }
  }

  async function loadPeople(which: "followers" | "following") {
    people = null;
    try {
      people = which === "followers" ? await socialApi.getFollowers(username) : await socialApi.getFollowing(username);
    } catch {
      people = [];
    }
  }

  $effect(() => {
    if (!profile || locked) return;
    if (tab === "posts" && posts === null) void loadPosts();
    if (tab === "followers" || tab === "following") void loadPeople(tab);
  });

  function onFollowChange(next: FollowStatus) {
    if (!profile) return;
    const wasFollowing = profile.followStatus === "following";
    const nowFollowing = next === "following";
    profile = { ...profile, followStatus: next, isFollowing: nowFollowing, followerCount: profile.followerCount + (nowFollowing ? 1 : 0) - (wasFollowing ? 1 : 0) };
    // Following (or unfollowing) a private account changes what you can see.
    if (profile.isPrivate && wasFollowing !== nowFollowing) void loadProfile(username);
  }

  async function block() {
    if (!profile) return;
    try {
      await socialApi.blockUser(profile.username);
      toast.success(`Blocked @${profile.username}`);
      void goto("/social");
    } catch {
      toast.error("Couldn't block them");
    }
  }

  async function removeFollower() {
    if (!removing) return;
    const u = removing;
    try {
      await socialApi.removeFollower(u.username);
      people = (people ?? []).filter((p) => p.id !== u.id);
      if (profile) profile = { ...profile, followerCount: Math.max(0, profile.followerCount - 1) };
    } catch {
      toast.error("Couldn't remove them");
    }
  }

  function setTab(t: Tab) {
    void goto(t === "posts" ? `/social/${username}` : `/social/${username}?tab=${t}`, { noScroll: true, keepFocus: true });
  }
</script>

<div class="mx-auto flex max-w-[1060px] flex-col gap-4">
  <a href="/social" class="text-[13px] text-muted-foreground hover:text-foreground">‹ Social</a>

  {#if error}
    <p class="py-16 text-center text-sm text-muted-foreground">{error}</p>
  {:else if !profile}
    <Skeleton class="h-36" /><Skeleton class="h-48" />
  {:else if editing && profile.isSelf}
    <ProfileEditor {profile} oncancel={() => (editing = false)} onsaved={(p) => { profile = { ...profile!, ...p }; editing = false; }} />
  {:else}
    <section class="flex flex-wrap items-center gap-[18px] rounded-[10px] border border-border bg-card px-[22px] py-5">
      <Avatar name={profile.displayName} url={profile.avatarUrl} size={72} />
      <div class="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <h1 class="flex items-center gap-2 text-[22px] font-bold">{profile.displayName}{#if profile.isPrivate}<LockIcon class="size-4 text-muted-foreground" aria-label="Private account" />{/if}</h1>
        <span class="text-[13px] text-muted-foreground">@{profile.username}</span>
        {#if profile.bio}<MentionText text={profile.bio} class="mt-1 text-sm leading-relaxed" />{/if}
        <div class="mt-1.5 flex gap-[18px] text-[13px]">
          <button type="button" disabled={locked} onclick={() => setTab("followers")}><strong>{profile.followerCount}</strong> <span class="text-muted-foreground">{profile.followerCount === 1 ? "follower" : "followers"}</span></button>
          <button type="button" disabled={locked} onclick={() => setTab("following")}><strong>{profile.followingCount}</strong> <span class="text-muted-foreground">following</span></button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if profile.isSelf}
          <button type="button" onclick={() => (editing = true)} class="h-9 rounded-[9px] border border-border px-3.5 text-[13px] font-medium hover:bg-muted">Edit profile</button>
        {:else}
          {#if profile.followsYou}<span class="text-xs text-muted-foreground">Follows you</span>{/if}
          <FollowButton username={profile.username} bind:status isPrivate={!!profile.isPrivate} followsYou={!!profile.followsYou} primary class="h-9 px-3.5 text-[13px]" onchange={onFollowChange} />
          <a href="/social/messages?u={encodeURIComponent(profile.username)}" class="flex h-9 items-center rounded-[9px] border border-border px-3.5 text-[13px] font-medium hover:bg-muted">Message</a>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <button {...props} type="button" aria-label="More: block or report" class="flex size-9 items-center justify-center rounded-[9px] border border-border"><MoreHorizontalIcon class="size-4" /></button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item onclick={() => (reportOpen = true)}>Report @{profile.username}</DropdownMenu.Item>
              <DropdownMenu.Item class="text-destructive" onclick={() => (blockOpen = true)}>Block @{profile.username}</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>
    </section>

    {#if locked}
      <section class="flex flex-col items-center gap-2 rounded-[10px] border border-border bg-card px-5 py-12 text-center">
        <span class="flex size-[52px] items-center justify-center rounded-full border-[1.5px] border-border"><LockIcon class="size-5" /></span>
        <h2 class="mt-1 text-base font-semibold">This account is private</h2>
        <p class="max-w-[380px] text-[13px] leading-relaxed text-muted-foreground">
          {status === "requested"
            ? `Your request is waiting. You'll see ${profile.displayName}'s posts once they accept it.`
            : `Follow ${profile.displayName} to see their posts, profile cards and who they follow. They'll get your request and can accept it.`}
        </p>
      </section>
    {:else}
      <ProfileCards json={profile.publicProfileJson} name={profile.displayName} />

      <div role="tablist" aria-label="Profile" class="flex gap-1 border-b border-border">
        {#each [["posts", "Posts"], ["forum", "Forum"], ["followers", "Followers"], ["following", "Following"]] as [t, label] (t)}
          <button type="button" role="tab" aria-selected={tab === t} onclick={() => setTab(t as Tab)}
            class="-mb-px h-9 border-b-2 px-3 text-[13px] {tab === t ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}">{label}</button>
        {/each}
      </div>

      {#if tab === "forum"}
        {#key username}<ForumPosts filter={{ user: username }} canPost={profile.isSelf} sorts={["new", "top"]} empty="No forum posts yet." />{/key}
      {:else if tab === "posts"}
        {#if posts === null}
          <Skeleton class="h-40" />
        {:else if posts.length === 0}
          <p class="py-10 text-center text-[13px] text-muted-foreground">No posts yet.</p>
        {:else}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-3.5">
            {#each posts as post (post.id)}
              <PostCard {post} onchange={(n) => { posts = n ? (posts ?? []).map((p) => (p.id === post.id ? n : p)) : (posts ?? []).filter((p) => p.id !== post.id); }} />
            {/each}
          </div>
          {#if cursor}<button type="button" onclick={() => loadPosts(true)} class="h-8 self-center rounded-[9px] border border-border px-3 text-xs">Show more</button>{/if}
        {/if}
      {:else}
        {#if people === null}
          <Skeleton class="h-40" />
        {:else if people.length === 0}
          <p class="py-10 text-center text-[13px] text-muted-foreground">{tab === "followers" ? "No followers yet." : "Not following anyone yet."}</p>
        {:else}
          <section class="flex flex-col gap-1 rounded-[10px] border border-border bg-card p-2">
            {#each people as u (u.id)}
              <div class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40">
                <a href="/social/{u.username}" class="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={u.displayName} url={u.avatarUrl} />
                  <span class="min-w-0"><span class="block truncate text-[13px] font-medium">{u.displayName}</span><span class="block truncate text-xs text-muted-foreground">@{u.username}</span></span>
                </a>
                {#if profile.isSelf && tab === "followers"}
                  <button type="button" onclick={() => { removing = u; removeOpen = true; }} class="h-8 rounded-[9px] border border-border px-3 text-xs">Remove</button>
                {/if}
              </div>
            {/each}
          </section>
        {/if}
      {/if}
    {/if}

    <ReportDialog bind:open={reportOpen} targetType="User" targetId={profile.id} what="@{profile.username}" />
    <AlertDialog.Root bind:open={blockOpen}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Block @{profile.username}?</AlertDialog.Title>
          <AlertDialog.Description>You won't see each other's posts, comments or profiles, and neither of you follows the other any more. They aren't told.</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action onclick={block}>Block</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
    <AlertDialog.Root bind:open={removeOpen}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Remove @{removing?.username} as a follower?</AlertDialog.Title>
          <AlertDialog.Description>They stop seeing your posts in their feed{profile.isPrivate ? " and your private profile" : ""}. They aren't told, and they can ask to follow you again.</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action onclick={removeFollower}>Remove</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  {/if}
</div>
