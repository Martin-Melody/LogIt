<!-- A forum post in the feed (design canvas F1): a title card from someone you follow or one of
     your groups; tap to open the thread. -->
<script lang="ts">
  import { ChevronUp, MessageCircle } from "lucide-svelte";
  import type { ForumPost } from "@logit/core/api/forumApi";
  import { shortAgo } from "$lib/features/friends/dmTime";

  const { post }: { post: ForumPost } = $props();
  const who = $derived(post.author ? post.author.displayName || post.author.username : "Someone");
</script>

<div class="flex flex-col gap-2 px-4 py-3">
  <span class="flex items-center gap-1.5 text-[12px] text-muted-foreground">
    <MessageCircle class="size-3.5" />Forum · {who} posted{post.group ? ` in ${post.group.name}` : ""} · {shortAgo(post.createdAtMs, Date.now())}
  </span>
  <a href="/social/forum/{post.id}" class="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3 text-inherit no-underline active:bg-muted/50">
    <span class="text-[16px] font-semibold leading-snug">{post.title}</span>
    {#if post.body}<span class="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{post.body}</span>{/if}
    {#if post.tags.length}<span class="line-clamp-1 text-[13px] text-sky-700 dark:text-sky-300">{post.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
    <span class="flex items-center gap-2 text-[12px] text-muted-foreground">
      <span class="flex h-7 items-center gap-1 rounded-full px-2 font-semibold {post.upvoted ? 'bg-primary text-primary-foreground' : 'border border-border'}"><ChevronUp class="size-3.5" />{post.upvotes}</span>
      <span class="flex items-center gap-1"><MessageCircle class="size-3.5" />{post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}</span>
    </span>
  </a>
</div>
