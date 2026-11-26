<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ChevronDown, CirclePlay, ImageIcon, Lock, Flag, Ban, Plus, Share2, Star, UserMinus } from "lucide-svelte";
  import { longpress } from "$lib/swipe";
  import { socialApi, type ApiProfile, type ApiPost, type FollowStatus, type PublicProfileData } from "@logit/core/api/socialApi";
  import { storiesApi } from "@logit/core/api/storiesApi";
  import { trainingApi, type TrainingFriend } from "@logit/core/api/trainingApi";
  import { ApiError } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import { profile as myProfile } from "$lib/stores/profile.store";
  import { stories, loadStories, watch } from "$lib/features/friends/stories.svelte";
  import { minutesIn } from "$lib/features/friends/trainingPresence";
  import { buildPublicProfileData } from "$lib/features/profileWidgets/publicProfileSync";
  import { toast } from "svelte-sonner";
  import ActionSheet, { type ActionItem } from "$lib/components/ActionSheet.svelte";
  import PostCard from "./PostCard.svelte";
  import ForumList from "./ForumList.svelte";
  import ReportSheet from "./ReportSheet.svelte";
  import MentionText from "./MentionText.svelte";
  import ProfileCards from "./ProfileCards.svelte";
  import { shownCards } from "@logit/core/domain/profileCards";
  import ShareProfileSheet from "./ShareProfileSheet.svelte";
  import TrainingNowSheet from "./TrainingNowSheet.svelte";
  import AvatarViewer from "./AvatarViewer.svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";

  interface Props {
    username: string;
    /** The page's ⋯ button opens this (share, report, block); bound so the header can hold it. */
    menuOpen?: boolean;
    /** Walkthrough marks (data-guide) for the avatar and the Training tab, on your own Profile tab only. */
    avatarGuideMark?: string;
    trainingGuideMark?: string;
  }

  let { username, menuOpen = $bindable(false), avatarGuideMark, trainingGuideMark }: Props = $props();

  let profile = $state<ApiProfile | null>(null);
  let profileError = $state<string | null>(null);
  let profileLoading = $state(true);

  let posts = $state<ApiPost[]>([]);
  let postsLoading = $state(true);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);
  let sentinel = $state<HTMLDivElement | null>(null);

  let followLoading = $state(false);
  let followMenuOpen = $state(false);
  let closeFriend = $state<boolean | null>(null);
  let shareOpen = $state(false);
  let trainingFriend = $state<TrainingFriend | null>(null);
  let trainingSheet = $state(false);
  /** Your own cards, live from this phone (others see them after the next push). */
  let liveData = $state<PublicProfileData | null>(null);
  let reportOpen = $state(false);
  let confirmBlock = $state(false);
  let blocking = $state(false);
  // Posts | Forum | Training (design canvas F5); Training only when there's something to show.
  let view = $state<"posts" | "forum" | "training">("posts");
  let commentPost = $state<ApiPost | null>(null);

  const isSelf = $derived(profile?.isSelf ?? authStore.user?.username === username);
  // Older servers don't send followStatus/canSeeContent: fall back to isFollowing / visible.
  const followStatus = $derived<FollowStatus>(profile?.followStatus ?? (profile?.isFollowing ? "following" : "none"));
  // A private account you aren't an accepted follower of: header only, and a lock.
  const locked = $derived(!!profile && profile.canSeeContent === false);

  onMount(async () => {
    await loadProfile();
    // A private account you can't see: its posts would only answer "private".
    if (!locked) void loadPosts();
    else postsLoading = false;
    if (isSelf) liveData = await buildPublicProfileData().catch(() => null);
    else if (authStore.isAuthenticated && profile && !locked) {
      if (!stories.row.length) void loadStories();
      trainingApi.friends().then((f) => (trainingFriend = f.find((t) => t.username === profile?.username) ?? null)).catch(() => {});
    }
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

  // Bumped by every load; a response for an older request (e.g. a "more" for the previous
  // profile, still in flight when the username changed) is dropped instead of appended.
  let latestPostsRequest = 0;

  async function loadPosts(more = false) {
    if (more && (postsLoading || loadingMore || !nextCursor)) return;
    const request = ++latestPostsRequest;
    if (more) loadingMore = true;
    else postsLoading = true;
    try {
      const page = await socialApi.getUserPosts(username, 20, more ? nextCursor ?? undefined : undefined);
      if (request !== latestPostsRequest) return;
      posts = more ? [...posts, ...page.posts] : page.posts;
      nextCursor = page.nextCursor;
    } catch {
      // leave what we have
    } finally {
      if (request === latestPostsRequest) {
        postsLoading = false;
        loadingMore = false;
      }
    }
  }

  $effect(() => {
    if (!sentinel || postsLoading || loadingMore || !nextCursor) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) void loadPosts(true);
    }, { rootMargin: "500px" });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  /** Follow (or ask to, for a private account); tapping again unfollows or withdraws the request. */
  async function toggleFollow() {
    if (!authStore.isAuthenticated) { void goto("/auth?mode=login"); return; }
    if (!profile || profile.isSelf || followLoading) return;
    followLoading = true;
    const before = profile;
    try {
      if (followStatus === "none") {
        const status = await socialApi.follow(username);
        profile = {
          ...profile, followStatus: status, isFollowing: status === "following",
          followerCount: profile.followerCount + (status === "following" ? 1 : 0),
        };
      } else {
        await socialApi.unfollow(username);
        profile = {
          ...profile, followStatus: "none", isFollowing: false,
          followerCount: profile.followerCount - (followStatus === "following" ? 1 : 0),
        };
      }
      // On a private account, following or unfollowing changes what you can see.
      if (before.isPrivate && before.isFollowing !== profile.isFollowing) {
        await loadProfile();
        void loadPosts();
      }
    } catch (e) {
      profile = before;
      if (e instanceof ApiError && e.status === 409) { profile = { ...before, followStatus: "following", isFollowing: true }; return; }
      toast.error("Couldn't do that. Try again.");
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
    if (isSelf && liveData) return liveData;
    if (!profile?.publicProfileJson) return null;
    try { return JSON.parse(profile.publicProfileJson) as PublicProfileData; }
    catch { return null; }
  });
  const cards = $derived(shownCards(publicData));

  // Your own name, bio and photo as this phone has them: an edit shows at once, even offline.
  const shownName = $derived(isSelf ? $myProfile.name || profile?.displayName || "" : profile?.displayName ?? "");
  const shownBio = $derived(isSelf ? $myProfile.bio : profile?.bio ?? "");
  const shownAvatar = $derived(isSelf ? $myProfile.avatarDataUrl || null : profile?.avatarUrl ?? null);

  const storyAuthor = $derived(stories.row.find((a) => a.user.username === username) ?? null);
  const storyRing = $derived(!storyAuthor ? "none" : storyAuthor.stories.some((x) => !x.seen) ? "new" : "seen");

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  // Instagram's avatar: tap = the story if there is one, else the picture (yours: add to your
  // story); hold = a menu with both when there's a story to choose between.
  let viewingPhoto = $state(false);
  let avatarMenuOpen = $state(false);
  let held = false;

  function tapAvatar() {
    if (held) { held = false; return; } // the release after a hold
    if (storyAuthor) watch(username);
    else if (isSelf && authStore.isAuthenticated) stories.picking = true;
    else if (shownAvatar) viewingPhoto = true;
  }

  function holdAvatar() {
    if (!storyAuthor && !isSelf) { held = true; if (shownAvatar) viewingPhoto = true; return; }
    held = true;
    avatarMenuOpen = true;
  }

  const avatarItems = $derived<ActionItem[]>([
    ...(storyAuthor ? [{ icon: CirclePlay, label: "View story", onSelect: () => watch(username) }] : []),
    ...(shownAvatar ? [{ icon: ImageIcon, label: "View profile picture", onSelect: () => (viewingPhoto = true) }] : []),
    ...(isSelf && authStore.isAuthenticated ? [{ icon: Plus, label: "Add to your story", onSelect: () => (stories.picking = true) }] : []),
  ]);

  async function openFollowMenu() {
    followMenuOpen = true;
    closeFriend = null;
    try {
      closeFriend = (await storiesApi.lists()).closeFriends.some((p) => p.username === username);
    } catch {
      closeFriend = null;
    }
  }

  async function setCloseFriend(on: boolean) {
    try {
      await (on ? storiesApi.add("close-friends", username) : storiesApi.drop("close-friends", username));
      toast(on ? `Added to Close friends` : `Removed from Close friends`);
    } catch {
      toast.error("Couldn't change that. Try again.");
    }
  }

  const followItems = $derived<ActionItem[]>([
    ...(closeFriend === null ? [] : [{ icon: Star, label: closeFriend ? "Remove from Close friends" : "Add to Close friends", onSelect: () => void setCloseFriend(!closeFriend) }]),
    { icon: UserMinus, label: "Unfollow", destructive: true, onSelect: () => void toggleFollow() },
  ]);

  const menuItems = $derived<ActionItem[]>([
    { icon: Share2, label: "Share profile", onSelect: () => (shareOpen = true) },
    ...(isSelf ? [] : [
      { icon: Flag, label: `Report @${username}`, onSelect: () => (reportOpen = true) },
      { icon: Ban, label: `Block @${username}`, destructive: true, onSelect: () => (confirmBlock = true) },
    ]),
  ]);

  function onPostChange(id: string, next: ApiPost | null) {
    posts = next ? posts.map((p) => (p.id === id ? next : p)) : posts.filter((p) => p.id !== id);
  }
</script>

{#snippet count(n: number | undefined, label: string, href: string | null)}
  {#if href && !locked}
    <a {href} class="flex min-w-16 flex-col items-center"><strong class="text-[17px] font-bold tabular-nums">{n ?? 0}</strong><span class="text-[13px] text-muted-foreground">{label}</span></a>
  {:else}
    <span class="flex min-w-16 flex-col items-center"><strong class="text-[17px] font-bold tabular-nums">{n ?? "–"}</strong><span class="text-[13px] text-muted-foreground">{label}</span></span>
  {/if}
{/snippet}

{#if profileLoading}
  <div class="flex justify-center py-16"><Spinner class="h-5 w-5 text-muted-foreground" /></div>

{:else if profileError}
  <div class="flex flex-col items-center gap-3 py-16 text-center px-6">
    <p class="text-sm text-muted-foreground">{profileError}</p>
    <button type="button" class="h-11 rounded-lg border border-border px-4 text-sm font-medium" onclick={loadProfile}>Try again</button>
  </div>

{:else if profile}
  <!-- Head (design canvas PR1/PR6/PR7): photo and counts, name, bio, then the buttons. -->
  <div class="flex items-center gap-[18px] px-4 pt-3.5 pb-2.5">
    <button type="button" data-guide={avatarGuideMark} onclick={tapAvatar} onpointerdown={() => (held = false)} use:longpress={holdAvatar} oncontextmenu={(e) => e.preventDefault()}
      disabled={!storyAuthor && !isSelf && !shownAvatar}
      aria-label={storyAuthor ? `${shownName}'s story. Hold for the profile picture` : isSelf && authStore.isAuthenticated ? "Add to your story. Hold for more" : `${shownName}'s profile picture`}
      class="relative flex size-[84px] shrink-0 items-center justify-center rounded-full {storyRing === 'new' ? 'ring-[2.5px] ring-foreground ring-offset-[3px] ring-offset-background' : storyRing === 'seen' ? 'ring-[1.5px] ring-border ring-offset-[3px] ring-offset-background' : ''}">
      <span class="flex size-full select-none items-center justify-center overflow-hidden rounded-full bg-muted text-[28px] font-bold [-webkit-touch-callout:none]">
        {#if shownAvatar}<img src={photoSrc(shownAvatar)} alt="" draggable="false" class="size-full object-cover" />{:else}{initials(shownName || username)}{/if}
      </span>
      {#if isSelf && !storyAuthor && authStore.isAuthenticated}
        <span aria-hidden="true" class="absolute -right-0.5 -bottom-0.5 flex size-[26px] items-center justify-center rounded-full border-[3px] border-background bg-primary text-base font-bold leading-none text-primary-foreground">+</span>
      {/if}
      {#if trainingFriend}
        <span aria-hidden="true" class="absolute right-px bottom-px size-[22px] rounded-full border-4 border-background bg-success"></span>
      {/if}
    </button>
    <div class="flex flex-1 justify-around">
      {@render count(profile.postCount, profile.postCount === 1 ? "post" : "posts", null)}
      {@render count(profile.followerCount, profile.followerCount === 1 ? "follower" : "followers", `/social/${username}/followers`)}
      {@render count(profile.followingCount, "following", `/social/${username}/following`)}
    </div>
  </div>

  <div class="flex flex-col gap-1 px-4 pb-3">
    <p class="inline-flex items-center gap-1.5 text-[15px] font-semibold">{shownName}{#if profile.isPrivate}<Lock class="size-3.5 text-muted-foreground" aria-label="Private account" />{/if}</p>
    {#if shownBio}<MentionText text={shownBio} class="whitespace-pre-wrap text-sm leading-normal" />{/if}
    {#if !isSelf && profile.followedBy?.length}
      <p class="mt-1 text-[13px] text-muted-foreground">
        Followed by <strong class="font-semibold text-foreground">{profile.followedBy.join(", ")}</strong>{#if (profile.followedByCount ?? 0) > profile.followedBy.length}{" "}and {profile.followedByCount! - profile.followedBy.length} {profile.followedByCount! - profile.followedBy.length === 1 ? "other" : "others"} you follow{/if}
      </p>
    {:else if !isSelf && profile.followsYou}
      <p class="mt-1 text-[13px] text-muted-foreground">Follows you</p>
    {/if}
  </div>

  {#if trainingFriend}
    <button type="button" class="mx-4 mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left" onclick={() => (trainingSheet = true)}>
      <span class="size-2.5 shrink-0 rounded-full bg-success" aria-hidden="true"></span>
      <span class="flex-1 text-sm tabular-nums">Training now{trainingFriend.what ? ` · ${trainingFriend.what}` : ""} · {minutesIn(trainingFriend, Date.now())} min in</span>
      <span class="flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground">Cheer</span>
    </button>
  {/if}

  <div class="grid grid-cols-2 gap-2 px-4 pb-3.5">
    {#if isSelf}
      <button type="button" class="h-10 rounded-lg bg-muted text-sm font-semibold" data-guide="profile-edit" onclick={() => goto("/profile/edit")}>Edit profile</button>
      <button type="button" class="h-10 rounded-lg bg-muted text-sm font-semibold" onclick={() => (shareOpen = true)}>Share profile</button>
    {:else}
      {#if followStatus === "following"}
        <button type="button" class="flex h-10 items-center justify-center gap-1 rounded-lg bg-muted text-sm font-semibold disabled:opacity-50" disabled={followLoading} onclick={openFollowMenu}>Following <ChevronDown class="size-4" /></button>
      {:else if followStatus === "requested"}
        <button type="button" class="h-10 rounded-lg bg-muted text-sm font-semibold disabled:opacity-50" disabled={followLoading} onclick={toggleFollow} aria-label="Requested. Tap to withdraw the request">Requested</button>
      {:else}
        <button type="button" class="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={followLoading} onclick={toggleFollow}>
          {profile.followsYou ? "Follow back" : profile.isPrivate ? "Request to follow" : "Follow"}
        </button>
      {/if}
      <button type="button" class="h-10 rounded-lg bg-muted text-sm font-semibold" onclick={() => goto(`/messages/chat?u=${encodeURIComponent(profile!.username)}`)}>Message</button>
    {/if}
  </div>

  {#if locked}
    <div class="flex flex-col items-center gap-2 border-t border-border px-8 py-10 text-center">
      <span class="flex size-[60px] items-center justify-center rounded-full border-[1.5px] border-border"><Lock class="size-6" /></span>
      <p class="mt-1 text-base font-semibold">This account is private</p>
      <p class="text-sm text-muted-foreground">
        {followStatus === "requested"
          ? `Your request is waiting. You'll see ${shownName}'s posts and training once they accept it.`
          : `Follow ${shownName} to see their posts, forum posts and training. They'll get your request.`}
      </p>
    </div>
  {:else}
  <Tabs.Root value={view} onValueChange={(v) => (view = v as typeof view)}>
    <Tabs.List variant="line" aria-label="@{username}">
      {#each [["posts", "Posts"], ["forum", "Forum"], ...(isSelf || cards.length > 0 ? [["training", "Training"]] : [])] as [v, label] (v)}<Tabs.Trigger value={v} data-guide={v === "training" ? trainingGuideMark : undefined}>{label}</Tabs.Trigger>{/each}
    </Tabs.List>
  </Tabs.Root>

  {#if view === "forum"}
    <ForumList filter={{ user: username }} canPost={isSelf} sorts={["new", "top"]} empty={isSelf ? "Your forum posts show here." : "No forum posts yet."} />
  {:else if view === "training"}
    {#if publicData && cards.length}
      <ProfileCards data={publicData} name={shownName} />
      {#if isSelf}
        <p class="px-4 pb-6 text-[13px] leading-normal text-muted-foreground">This is what anyone who can see your profile sees, in the app and on the web. Others get new numbers when you finish a workout or log a weigh-in.</p>
      {/if}
    {:else if isSelf}
      <div class="flex flex-col items-center gap-3 px-8 py-12 text-center">
        <p class="text-sm text-muted-foreground">Show your split, records or weight trend here. Pick the cards in Edit profile.</p>
        <button type="button" class="h-11 rounded-lg border border-border px-4 text-sm font-medium" onclick={() => goto("/profile/edit")}>Choose cards</button>
      </div>
    {/if}
  {:else if postsLoading}
    <div class="flex justify-center py-12"><Spinner class="h-4 w-4 text-muted-foreground" /></div>
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
      <div class="flex justify-center py-4"><Spinner class="h-4 w-4 text-muted-foreground" /></div>
    {/if}
  {/if}
  {/if}
{/if}

<ActionSheet open={menuOpen} onOpenChange={(v) => (menuOpen = v)} title="@{username}" items={menuItems} />
<ActionSheet open={avatarMenuOpen} onOpenChange={(v) => (avatarMenuOpen = v)} title={shownName} items={avatarItems} />
{#if viewingPhoto && shownAvatar}<AvatarViewer src={shownAvatar} name={shownName} onclose={() => (viewingPhoto = false)} />{/if}
<ActionSheet open={followMenuOpen} onOpenChange={(v) => (followMenuOpen = v)} title={shownName} items={followItems} />
{#if shareOpen}<ShareProfileSheet {username} onclose={() => (shareOpen = false)} />{/if}
{#if trainingSheet && trainingFriend}<TrainingNowSheet friend={trainingFriend} onclose={() => (trainingSheet = false)} />{/if}

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
      <button type="button" class="text-xs bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 flex items-center gap-1 disabled:opacity-50" disabled={blocking} onclick={doBlock}>
        {#if blocking}<Spinner class="h-3.5 w-3.5" />{/if} Block
      </button>
    </div>
  </div>
{/if}

<CommentSheet
  post={commentPost}
  onclose={() => (commentPost = null)}
  oncommentcountchange={(id, delta) => { posts = posts.map((p) => (p.id === id ? { ...p, commentCount: p.commentCount + delta } : p)); }}
/>
