<!-- One post on the web, signed out (design canvas W2): the post and its comments (replies under
     what they answer), then Sign in to like, comment or follow, and more from them. -->
<script lang="ts">
  import { SITE_URL } from "$lib/site";
  import { logIn } from "$lib/social/prompt.svelte";
  import { attachmentSummary } from "@logit/core/domain/sharedContent";
  import ProfileHead from "$lib/social/ProfileHead.svelte";
  import PublicPost from "$lib/social/PublicPost.svelte";

  const { data } = $props();
  const p = $derived(data.profile);
  const post = $derived(data.post);
  const top = $derived(data.comments.filter((c) => !c.parentCommentId));
  const repliesTo = (id: string) => data.comments.filter((c) => c.parentCommentId === id);
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  const summary = $derived(attachmentSummary(post.type, post.payloadJson));
  const description = $derived((post.body || summary?.title || `A post by ${p.displayName}`).replace(/\s+/g, " ").slice(0, 155));
  const title = $derived(`${p.displayName} on LogIt: ${(post.body || summary?.title || "a post").replace(/\s+/g, " ").slice(0, 60)}`);
  const jsonLd = $derived(JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: title,
    text: post.body ?? summary?.title ?? "",
    datePublished: post.createdAt,
    author: { "@type": "Person", name: p.displayName, url: `${SITE_URL}/@${p.username}` },
    url: `${SITE_URL}/@${p.username}/p/${post.id}`,
    commentCount: post.commentCount,
  }).replace(/</g, "\\u003c"));
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}/@{p.username}/p/{post.id}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

{#snippet comment(c: (typeof data.comments)[number])}
  <span class="text-sm"><strong class="font-semibold text-heading">{c.authorDisplayName}</strong><span class="text-muted-foreground">{" · "}{when(c.createdAt)}</span></span>
  <p class="whitespace-pre-wrap text-[15px] leading-relaxed">{c.body}</p>
{/snippet}

<div class="flex flex-col gap-3 px-4 pb-10 pt-6 sm:px-5">
  <a href="/@{p.username}" class="no-underline"><ProfileHead profile={p} api={data.api} small /></a>
  <PublicPost {post} api={data.api} />
  {#if top.length}
    <ul class="flex flex-col gap-4">
      {#each top as c (c.id)}
        <li class="flex flex-col gap-1">
          {@render comment(c)}
          {#if repliesTo(c.id).length}
            <ul class="mt-2 flex flex-col gap-3 border-l border-border pl-4">{#each repliesTo(c.id) as r (r.id)}<li class="flex flex-col gap-1">{@render comment(r)}</li>{/each}</ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="mt-2 flex flex-col gap-3 rounded-2xl border border-border p-5 sm:flex-row sm:items-center">
    <p class="flex-1 text-sm text-muted-foreground">Sign in to like, comment or follow. Any LogIt account works, and it's free.</p>
    <span class="flex gap-2">
      <a href={logIn(data.appPath)} class="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Sign in</a>
      <a href="logit://u/{p.username}/p/{post.id}" class="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Open in LogIt</a>
    </span>
  </div>
  {#if data.more.length}
    <h2 class="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">More from {p.displayName}</h2>
    {#each data.more as m (m.id)}<PublicPost post={m} api={data.api} href="/@{p.username}/p/{m.id}" />{/each}
  {/if}
</div>
