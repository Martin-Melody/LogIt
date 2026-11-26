<!-- A forum post in a list (design canvas F2, F4–F6): pinned, the group it's labelled with, title,
     a line of text, #tags, upvotes, comments, who and when. -->
<script lang="ts">
  import { ChevronUp, MessageCircle, Pin } from "lucide-svelte";
  import type { ForumPost } from "@logit/core/api/forumApi";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import GroupPill from "./GroupPill.svelte";

  const { post, showGroup = true }: { post: ForumPost; showGroup?: boolean } = $props();
</script>

<!-- The title's link covers the row (::after), so the author's name can be its own link. -->
<div class="relative flex flex-col gap-1.5 border-b border-border px-4 py-3 active:bg-muted/50">
  {#if post.pinned || post.locked || (showGroup && post.group)}
    <span class="flex items-center gap-2">
      {#if post.pinned}<span class="flex items-center gap-1 text-[11px] text-muted-foreground"><Pin class="size-3" />Pinned</span>{/if}
      {#if showGroup && post.group}<GroupPill group={post.group} />{/if}
      {#if post.locked}<span class="text-[11px] text-muted-foreground">Locked</span>{/if}
    </span>
  {/if}
  {#if post.deleted}
    <a href="/social/forum/{post.id}" class="text-[15px] italic text-muted-foreground no-underline after:absolute after:inset-0 after:content-['']">{post.removedByModerator ? "Removed by a moderator" : "Deleted by its author"}</a>
  {:else}
    <a href="/social/forum/{post.id}" class="text-[15px] font-semibold leading-snug text-inherit no-underline after:absolute after:inset-0 after:content-['']">{post.title}</a>
    {#if post.body}<span class="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{post.body}</span>{/if}
    {#if post.tags.length}<span class="line-clamp-1 text-[13px] text-sky-700 dark:text-sky-300">{post.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
  {/if}
  <span class="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
    <span class="flex h-7 items-center gap-1 rounded-full px-2 font-semibold {post.upvoted ? 'bg-primary text-primary-foreground' : 'border border-border'}"><ChevronUp class="size-3.5" />{post.upvotes}</span>
    <span class="flex items-center gap-1"><MessageCircle class="size-3.5" />{post.commentCount}</span>
    <span class="flex-1"></span>
    <span class="flex min-w-0 items-center gap-1">
      {#if post.author}<a href="/social/{post.author.username}" class="relative z-10 flex min-h-8 min-w-0 items-center truncate font-medium text-foreground no-underline">{post.author.displayName || post.author.username}</a>{:else}<span>Deleted account</span>{/if}
      <span class="shrink-0">· {shortAgo(post.lastActivityAtMs, Date.now())}</span>
    </span>
  </span>
</div>
