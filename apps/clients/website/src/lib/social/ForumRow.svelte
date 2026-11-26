<!-- A forum post in a list on the web, signed out (tag pages, profiles): title, a line, #tags,
     upvotes and replies. -->
<script lang="ts">
  import type { ForumPost } from "@logit/core/api/forumApi";

  const { post }: { post: ForumPost } = $props();
  const when = (ms: number) => new Date(ms).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
</script>

<a href={post.webPath} class="flex flex-col gap-1 border-b border-border py-3.5 last:border-b-0 hover:bg-muted/40">
  {#if post.group}<span class="text-xs text-muted-foreground">{post.group.name}</span>{/if}
  <span class="text-[17px] font-semibold leading-snug text-heading">{post.title}</span>
  {#if post.body}<span class="line-clamp-2 text-sm text-muted-foreground">{post.body}</span>{/if}
  {#if post.tags.length}<span class="text-sm text-sky-700 dark:text-sky-300">{post.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
  <span class="text-xs text-muted-foreground">{post.upvotes} {post.upvotes === 1 ? "upvote" : "upvotes"} · {post.commentCount} {post.commentCount === 1 ? "reply" : "replies"} · {post.author ? post.author.displayName || post.author.username : "Deleted account"} · {when(post.createdAtMs)}</span>
</a>
