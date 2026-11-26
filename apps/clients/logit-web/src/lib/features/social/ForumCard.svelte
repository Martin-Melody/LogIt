<!-- A forum post in the Following feed (design canvas F1): a title card from someone you follow
     or one of your groups. -->
<script lang="ts">
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
  import type { ForumPost } from "@logit/core/api/forumApi";

  const { post }: { post: ForumPost } = $props();
</script>

<div class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-3.5">
  <span class="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircleIcon class="size-3.5" />Forum · {#if post.author}<a href="/social/{post.author.username}" class="font-medium text-foreground hover:underline">{post.author.displayName || post.author.username}</a>{:else}Someone{/if} posted{post.group ? ` in ${post.group.name}` : ""}</span>
  <a href="/social/forum/{post.id}" class="flex flex-col gap-1.5 rounded-lg border border-border px-3.5 py-3 hover:bg-muted/40">
    <span class="text-base font-semibold">{post.title}</span>
    {#if post.body}<span class="line-clamp-2 text-sm text-muted-foreground">{post.body}</span>{/if}
    {#if post.tags.length}<span class="text-[13px] text-sky-700 dark:text-sky-300">{post.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
    <span class="flex items-center gap-3 text-xs text-muted-foreground"><span class="flex items-center gap-0.5"><ChevronUpIcon class="size-3.5" />{post.upvotes}</span><span class="flex items-center gap-1"><MessageCircleIcon class="size-3.5" />{post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}</span></span>
  </a>
</div>
