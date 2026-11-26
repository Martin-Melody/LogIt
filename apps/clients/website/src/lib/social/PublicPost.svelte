<!-- A feed post on the public pages (design canvas W1, W2, S1): who, when, the words (#tags and
     @names link), what's attached, and likes and comments. Like opens the sign-in prompt (S5). A
     repost shows what it shares (or that it's unavailable). -->
<script lang="ts">
  import { attachmentSummary } from "@logit/core/domain/sharedContent";
  import type { ApiPost } from "@logit/core/api/socialApi";
  import Heart from "@lucide/svelte/icons/heart";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import { ask } from "./prompt.svelte";
  import { photoUrl, shortDate } from "./publicApi";
  import RichText from "./RichText.svelte";

  const { post, href, showAuthor = false, api = "" }: { post: ApiPost; href?: string; showAuthor?: boolean; api?: string } = $props();
  const avatar = $derived(photoUrl(api, post.authorAvatarUrl));
  const when = shortDate;
  const plain = $derived(!!post.repostOf && !post.body);
  const shown = $derived(plain && post.repostOf ? post.repostOf : post);
  const card = $derived(attachmentSummary(shown.type, shown.payloadJson));
</script>

<article class="flex flex-col gap-2.5 border-b border-border py-4">
  <span class="flex items-center gap-2.5 text-sm text-muted-foreground">
    {#if showAuthor}
      <a href="/@{post.authorUsername}" class="flex min-w-0 items-center gap-2.5">
        <span class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-foreground">{#if avatar}<img src={avatar} alt="" class="size-full object-cover" />{:else}{(post.authorDisplayName || post.authorUsername).charAt(0).toUpperCase()}{/if}</span>
        <span class="truncate"><strong class="font-semibold text-heading hover:underline">{post.authorDisplayName || post.authorUsername}</strong> @{post.authorUsername}</span>
      </a><span aria-hidden="true">·</span>
    {/if}
    <span class="shrink-0">{when(post.createdAt)}{#if post.repostOf} · reposted{/if}</span>
  </span>
  {#if post.body}<RichText text={post.body} class="text-[15px] leading-relaxed" />{/if}
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
  <span class="flex items-center gap-2 text-sm text-muted-foreground">
    <button type="button" aria-label="Like" class="-ml-2 flex h-9 items-center gap-1.5 rounded-full px-2 hover:bg-muted hover:text-foreground" onclick={() => ask("like")}><Heart class="size-4" />{post.likeCount}</button>
    {#if href}<a {href} aria-label="Comments" class="flex h-9 items-center gap-1.5 rounded-full px-2 hover:bg-muted hover:text-foreground"><MessageCircle class="size-4" />{post.commentCount}</a>
    {:else}<button type="button" aria-label="Comment" class="flex h-9 items-center gap-1.5 rounded-full px-2 hover:bg-muted hover:text-foreground" onclick={() => ask("reply")}><MessageCircle class="size-4" />{post.commentCount}</button>{/if}
  </span>
</article>
