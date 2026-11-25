<!-- A post in a list (design canvas Q1, Q5): pinned, its kind, title, a line of text, upvotes,
     comments, who and when. -->
<script lang="ts">
  import { ChevronUp, MessageCircle, Pin } from "lucide-svelte";
  import type { GroupPost } from "@logit/core/api/groupPostsApi";
  import { shortAgo } from "$lib/features/friends/dmTime";

  const { post, showGroup = false }: { post: GroupPost; showGroup?: boolean } = $props();
</script>

<a href="/groups/posts/{post.id}" class="flex flex-col gap-1.5 border-b border-border px-4 py-3 text-inherit no-underline">
  <span class="flex items-center gap-2">
    {#if post.pinned}<span class="flex items-center gap-1 text-[11px] text-muted-foreground"><Pin class="size-3" />Pinned</span>{/if}
    <span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{post.kind}</span>
    {#if post.locked}<span class="text-[11px] text-muted-foreground">Locked</span>{/if}
  </span>
  {#if post.deleted}
    <span class="text-[15px] italic text-muted-foreground">{post.removedByModerator ? "Removed by a moderator" : "Deleted by its author"}</span>
  {:else}
    <span class="text-[15px] font-semibold leading-snug">{post.title}</span>
    {#if post.body || showGroup}<span class="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{showGroup ? `${post.group.name} · ` : ""}{post.body}</span>{/if}
  {/if}
  <span class="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
    <span class="flex h-7 items-center gap-1 rounded-full px-2 font-semibold {post.upvoted ? 'bg-primary text-primary-foreground' : 'border border-border'}"><ChevronUp class="size-3.5" />{post.upvotes}</span>
    <span class="flex items-center gap-1"><MessageCircle class="size-3.5" />{post.commentCount}</span>
    <span class="flex-1"></span>
    <span class="truncate">{post.author ? post.author.displayName || post.author.username : "Deleted account"} · {shortAgo(post.lastActivityAtMs, Date.now())}</span>
  </span>
</a>
