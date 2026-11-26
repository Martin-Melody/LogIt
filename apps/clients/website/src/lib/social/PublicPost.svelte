<!-- A feed post on the public pages (design canvas W1, W2): who, when, the words, what's attached,
     and likes and comments as counts. A repost shows what it shares (or that it's unavailable). -->
<script lang="ts">
  import { attachmentSummary } from "@logit/core/domain/sharedContent";
  import type { ApiPost } from "@logit/core/api/socialApi";

  const { post, href, showAuthor = false }: { post: ApiPost; href?: string; showAuthor?: boolean; api?: string } = $props();
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  const plain = $derived(!!post.repostOf && !post.body);
  const shown = $derived(plain && post.repostOf ? post.repostOf : post);
  const card = $derived(attachmentSummary(shown.type, shown.payloadJson));
</script>

<article class="flex flex-col gap-2.5 border-b border-border py-4">
  <span class="text-sm text-muted-foreground">
    {#if showAuthor}<strong class="font-semibold text-heading">{post.authorDisplayName}</strong> · {/if}{when(post.createdAt)}{#if post.repostOf} · reposted{/if}
  </span>
  {#if post.body}<p class="whitespace-pre-wrap text-[15px] leading-relaxed">{post.body}</p>{/if}
  {#if post.repostOf}
    {#if post.repostOf.deleted}
      <p class="rounded-xl border border-border px-4 py-3 text-sm italic text-muted-foreground">This post isn't available.</p>
    {:else}
      <div class="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
        <span class="text-sm text-muted-foreground">{post.repostOf.authorDisplayName} @{post.repostOf.authorUsername}</span>
        {#if plain && post.repostOf.body}<p class="whitespace-pre-wrap text-[15px] leading-relaxed">{post.repostOf.body}</p>{/if}
        {#if card}<div class="flex flex-col gap-1 rounded-lg bg-muted px-3.5 py-3"><span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</span><span class="text-[15px] font-semibold text-heading">{card.title}</span>{#if card.detail}<span class="text-sm text-muted-foreground">{card.detail}</span>{/if}</div>{/if}
      </div>
    {/if}
  {:else if card}
    <div class="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 px-4 py-3"><span class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</span><span class="text-[15px] font-semibold text-heading">{card.title}</span>{#if card.detail}<span class="text-sm text-muted-foreground">{card.detail}</span>{/if}</div>
  {/if}
  <span class="flex items-center gap-4 text-sm text-muted-foreground">
    <span>{post.likeCount} {post.likeCount === 1 ? "like" : "likes"}</span>
    {#if href}<a {href} class="hover:text-foreground">{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</a>{:else}<span>{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</span>{/if}
  </span>
</article>
