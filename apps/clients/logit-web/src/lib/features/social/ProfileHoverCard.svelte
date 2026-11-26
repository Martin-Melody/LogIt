<!-- Hover (or focus) a name in Social: who they are, their last 3 posts, Follow and Message,
     like Instagram on the web (canvas board 14). The name still links to their profile. -->
<script lang="ts" module>
  import type { ApiPost, ApiProfile } from "@logit/core/api/socialApi";
  // Shared across every name on the page, so hovering the same person twice doesn't refetch.
  const cache = new Map<string, Promise<{ profile: ApiProfile; posts: ApiPost[] } | null>>();
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { Spinner } from "$lib/components/ui/spinner";
  import { socialApi } from "@logit/core/api/socialApi";
  import { attachmentSummary } from "@logit/core/domain/sharedContent";
  import Avatar from "./Avatar.svelte";
  import FollowButton from "./FollowButton.svelte";

  let { username, class: className = "", children }: { username: string; class?: string; children: Snippet } = $props();

  let open = $state(false);
  let data = $state<{ profile: ApiProfile; posts: ApiPost[] } | null | undefined>(undefined);
  $effect(() => {
    if (!open || data !== undefined) return;
    let load = cache.get(username);
    if (!load) {
      load = socialApi.getProfile(username).then(async (profile) => ({
        profile,
        posts: profile.canSeeContent === false ? [] : (await socialApi.getUserPosts(username, 3).catch(() => ({ posts: [] }))).posts.slice(0, 3),
      })).catch(() => null);
      cache.set(username, load);
    }
    void load.then((d) => (data = d));
  });
  const tile = (p: ApiPost) => {
    const s = attachmentSummary(p.type, p.payloadJson);
    return s ? { label: s.label, text: s.title } : { label: "Post", text: p.body ?? "" };
  };
</script>

<HoverCard.Root bind:open openDelay={400} closeDelay={100}>
  <HoverCard.Trigger href="/social/{username}" class={className}>{@render children()}</HoverCard.Trigger><!-- no space: names sit in sentences
  --><HoverCard.Content class="w-80 p-4" align="start">
    {#if data === undefined}
      <div class="grid h-28 place-items-center"><Spinner class="size-5 text-muted-foreground" /></div>
    {:else if data === null}
      <p class="text-[13px] text-muted-foreground">Couldn't load @{username}.</p>
    {:else}
      {@const p = data.profile}
      <div class="flex flex-col gap-3">
        <a href="/social/{p.username}" class="flex items-center gap-3">
          <Avatar name={p.displayName || p.username} url={p.avatarUrl} size={52} />
          <span class="min-w-0">
            <span class="block truncate text-[15px] font-semibold">{p.displayName || p.username}</span>
            <span class="block truncate text-xs text-muted-foreground">@{p.username}{p.followsYou ? " · Follows you" : ""}</span>
          </span>
        </a>
        {#if p.bio}<p class="line-clamp-2 text-[13px]">{p.bio}</p>{/if}
        <div class="grid grid-cols-2 text-center text-xs text-muted-foreground">
          <span><strong class="block text-[15px] text-foreground tabular-nums">{p.followerCount}</strong>{p.followerCount === 1 ? "follower" : "followers"}</span>
          <span><strong class="block text-[15px] text-foreground tabular-nums">{p.followingCount}</strong>following</span>
        </div>
        {#if p.canSeeContent === false}
          <p class="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">This account is private.</p>
        {:else if data.posts.length}
          <div class="grid grid-cols-3 gap-1">
            {#each data.posts as post (post.id)}
              {@const t = tile(post)}
              <a href="/social/post/{post.id}" class="flex h-20 flex-col justify-end gap-0.5 overflow-hidden rounded-lg border border-border bg-background p-2 hover:bg-muted">
                <span class="text-[9px] font-semibold uppercase tracking-wide {post.type === 'PersonalRecord' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}">{t.label}</span>
                <span class="line-clamp-2 text-[11px] font-medium leading-tight">{t.text}</span>
              </a>
            {/each}
          </div>
        {/if}
        {#if !p.isSelf}
          <div class="flex gap-2">
            <FollowButton username={p.username} status={p.followStatus ?? (p.isFollowing ? "following" : "none")} isPrivate={p.isPrivate} followsYou={p.followsYou} primary class="h-[34px] flex-1" />
            {#if p.canSeeContent !== false}<a href="/social/messages?u={p.username}" class="inline-flex h-[34px] flex-1 items-center justify-center rounded-[9px] border border-border text-[13px] font-medium hover:bg-muted">Message</a>{/if}
          </div>
        {/if}
      </div>
    {/if}
  </HoverCard.Content>
</HoverCard.Root>
