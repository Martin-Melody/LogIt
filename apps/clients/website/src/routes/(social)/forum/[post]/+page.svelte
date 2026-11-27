<!-- A forum post on the web, signed out (design canvas Q6, F1–F6): the post and its comments, nested as
     in the app, and Sign in to comment (any account, on app.getlogit.app) or Get the app. -->
<script lang="ts">
  import { buildTree, type Node } from "@logit/core/domain/commentTree";
  import type { ForumComment } from "@logit/core/api/forumApi";
  import { PLAY_URL, SITE_URL } from "$lib/site";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import { ask, logIn } from "$lib/social/prompt.svelte";
  import RichText from "@logit/ui/RichText.svelte";
  import PlainText from "$lib/social/RichText.svelte";
  import { richTextPlain } from "@logit/core/domain/richText";
  import { shortDate } from "$lib/social/publicApi";
  import { page } from "$app/state";

  const { data } = $props();
  const post = $derived(data.thread.post);
  const tree = $derived(buildTree(data.thread.comments));
  const photo = (url: string | null) => (url ? (url.startsWith("/") ? `${data.api}${url}` : url) : null);
  const when = shortDate;
  const who = (c: { author: { displayName: string; username: string } | null }) => (c.author ? c.author.displayName || c.author.username : "Deleted account");
  const description = $derived((richTextPlain(post.body ?? "") || post.title).slice(0, 155));
  const jsonLd = $derived(JSON.stringify({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    text: richTextPlain(post.body ?? ""),
    datePublished: new Date(post.createdAtMs).toISOString(),
    author: { "@type": "Person", name: who(post) },
    url: `${SITE_URL}${page.url.pathname}`,
    commentCount: post.commentCount,
    keywords: post.tags.join(", "),
    interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: post.upvotes },
  }).replace(/</g, "\\u003c"));
</script>

<svelte:head>
  <title>{post.title}{post.group ? ` · ${post.group.name}` : ""} · LogIt</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}{page.url.pathname}" />
  <meta property="og:title" content={post.title} />
  <meta property="og:description" content={description} />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

{#snippet comments(nodes: Node<ForumComment>[])}
  {#each nodes as n (n.comment.id)}
    <li class="flex flex-col gap-1 border-l border-border pl-4">
      <span class="text-sm"><strong class="font-semibold text-heading">{n.comment.deleted ? "Removed" : who(n.comment)}</strong><span class="text-muted-foreground">{" · "}{when(n.comment.createdAtMs)}{n.comment.upvotes ? ` · ${n.comment.upvotes} upvotes` : ""}</span></span>
      {#if n.comment.deleted}<p class="text-[15px] italic leading-relaxed text-muted-foreground">This comment was removed.</p>{:else}<PlainText text={n.comment.body} class="text-[15px] leading-relaxed" />{/if}
      {#if n.replies.length}<ul class="mt-2 flex flex-col gap-3">{@render comments(n.replies)}</ul>{/if}
    </li>
  {/each}
{/snippet}

<div class="flex flex-col gap-4 px-4 pb-10 pt-6 sm:px-5">
  {#if post.group}
    <span class="flex items-center gap-2.5 text-sm text-muted-foreground">
      <span class="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs font-bold text-heading">{#if photo(post.group.photoUrl)}<img src={photo(post.group.photoUrl)} alt="" class="size-full object-cover" />{:else}{post.group.name.slice(0, 2).toUpperCase()}{/if}</span>
      {[post.group.name, post.group.kind, post.group.place, `${post.group.members} members`].filter(Boolean).join(" · ")}
    </span>
  {:else}
    <span class="text-sm text-muted-foreground">LogIt Forum</span>
  {/if}
  <h1 class="text-3xl font-bold leading-tight text-heading">{post.title}</h1>
  <p class="text-sm text-muted-foreground">{who(post)} · {when(post.createdAtMs)}</p>
  {#if post.body}<RichText text={post.body} class="text-base leading-relaxed" />{/if}
  {#if photo(post.photoUrl)}<img src={photo(post.photoUrl)} alt="" class="max-h-[480px] w-fit rounded-xl border border-border" />{/if}
  {#if post.tags.length}<span class="flex flex-wrap gap-x-2.5 text-[15px]">{#each post.tags as t (t)}<a href="/t/{encodeURIComponent(t)}" class="text-sky-700 hover:underline dark:text-sky-300">#{t}</a>{/each}</span>{/if}

  <div class="flex items-center gap-2">
    <button type="button" aria-label="Upvote" class="flex h-9 items-center gap-1 rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted" onclick={() => ask("upvote")}><ChevronUp class="size-4" />{post.upvotes}</button>
    <button type="button" class="flex h-9 items-center rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted" onclick={() => ask("reply")}>Reply</button>
  </div>

  <h2 class="mt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</h2>
  {#if tree.length}<ul class="flex flex-col gap-4">{@render comments(tree)}</ul>{/if}

  <div class="mt-6 flex flex-col gap-3 rounded-2xl border border-border p-5">
    <h2 class="text-base font-semibold text-heading">Join the conversation</h2>
    <p class="text-sm text-muted-foreground">Sign in to comment or post, here on the web or in the app. Any LogIt account works, and it's free.</p>
    <div class="grid gap-2 sm:grid-cols-2">
      <a href={logIn(data.appPath)} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Sign in to comment</a>
      <a href={PLAY_URL} class="rounded-lg border border-border px-4 py-3 text-center font-semibold hover:bg-muted">Get the app</a>
    </div>
  </div>
</div>
