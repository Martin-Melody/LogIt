<!-- A forum post in a list on the public pages (canvas F4, S2–S4): the group, title, a line, #tags,
     upvotes and replies. The title's link covers the row; Upvote opens the sign-in prompt (S5). -->
<script lang="ts">
  import { shortDate } from "./publicApi";
  import type { ForumPost } from "@logit/core/api/forumApi";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Pin from "@lucide/svelte/icons/pin";
  import { ask } from "./prompt.svelte";

  const { post }: { post: ForumPost } = $props();
  const when = shortDate;
</script>

<div class="relative flex flex-col gap-1.5 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-muted/40 sm:px-5">
  {#if post.pinned || post.group}
    <span class="flex items-center gap-2 text-xs text-muted-foreground">
      {#if post.pinned}<span class="flex items-center gap-1"><Pin class="size-3" />Pinned</span>{/if}
      {#if post.group}<span class="rounded-md border border-border px-1.5 py-0.5">{post.group.name}</span>{/if}
    </span>
  {/if}
  <a href={post.webPath} class="text-[17px] font-semibold leading-snug text-heading after:absolute after:inset-0 after:content-['']">{post.title}</a>
  {#if post.body}<span class="line-clamp-2 text-sm text-muted-foreground">{post.body}</span>{/if}
  {#if post.tags.length}<span class="text-sm text-sky-300">{post.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
  <span class="flex items-center gap-2 text-xs text-muted-foreground">
    <button type="button" aria-label="Upvote" class="relative z-10 flex h-8 items-center gap-1 rounded-full border border-border px-2.5 font-semibold hover:bg-muted hover:text-foreground" onclick={() => ask("upvote")}><ChevronUp class="size-3.5" />{post.upvotes}</button>
    <span class="flex items-center gap-1"><MessageCircle class="size-3.5" />{post.commentCount}</span>
    <span class="ml-auto truncate">{post.author ? post.author.displayName || post.author.username : "Deleted account"} · {when(post.createdAtMs)}</span>
  </span>
</div>
