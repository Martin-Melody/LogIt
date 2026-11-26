<!-- A tag on the web, signed out (design canvas F4): its top forum posts, then the latest posts
     from public accounts, then Sign in. -->
<script lang="ts">
  import { PLAY_URL, SITE_URL } from "$lib/site";
  import { logIn } from "$lib/social/prompt.svelte";
  import ForumRow from "$lib/social/ForumRow.svelte";
  import PublicPost from "$lib/social/PublicPost.svelte";

  const { data } = $props();
  const t = $derived(data.tag.tag);
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const description = $derived(`#${t} on LogIt: ${count(data.tag.forumPosts, "forum post")} and ${count(data.tag.posts, "post")} about ${t}.`);
</script>

<svelte:head>
  <title>#{t} · LogIt</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}/t/{encodeURIComponent(t)}" />
  <meta property="og:title" content="#{t} on LogIt" />
  <meta property="og:description" content={description} />
</svelte:head>

<div class="flex flex-col pb-10">
  <div class="flex flex-col gap-1 border-b border-border px-4 py-5 sm:px-5">
    <h1 class="text-3xl font-bold text-heading">#{t}</h1>
    <p class="text-sm text-muted-foreground">{count(data.tag.forumPosts, "forum post")} · {count(data.tag.posts, "post")}</p>
  </div>
  {#if data.forum.length}
    <h2 class="px-4 pt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Forum</h2>
    <div class="flex flex-col">{#each data.forum as post (post.id)}<ForumRow {post} />{/each}</div>
  {/if}
  {#if data.posts.length}
    <h2 class="px-4 pt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Posts</h2>
    <div class="flex flex-col px-4 sm:px-5">{#each data.posts as post (post.id)}<PublicPost {post} api={data.api} showAuthor href="/@{post.authorUsername}/p/{post.id}" />{/each}</div>
  {/if}
  <div class="mx-4 mt-6 flex flex-col gap-3 rounded-2xl border border-border p-5 sm:mx-5">
    <h2 class="text-base font-semibold text-heading">Ask about #{t}</h2>
    <p class="text-sm text-muted-foreground">Sign in to post, comment and follow people, here on the web or in the app. Any LogIt account works, and it's free.</p>
    <div class="grid gap-2 sm:grid-cols-2">
      <a href={logIn(data.appPath)} class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Sign in</a>
      <a href={PLAY_URL} class="rounded-lg border border-border px-4 py-3 text-center font-semibold hover:bg-muted">Get the app</a>
    </div>
  </div>
</div>
