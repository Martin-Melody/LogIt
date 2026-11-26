<!-- A public profile, signed out (design canvas W1, W3, F5): the profile, the latest posts and
     forum posts, then Sign in. Follow and Open in LogIt go to the app (or the web app). -->
<script lang="ts">
  import { DASHBOARD_URL, PLAY_URL, SITE_URL } from "$lib/site";
  import ProfileHead from "$lib/social/ProfileHead.svelte";
  import PublicPost from "$lib/social/PublicPost.svelte";
  import ForumRow from "$lib/social/ForumRow.svelte";

  const { data } = $props();
  const p = $derived(data.profile);
  const description = $derived((p.bio || `${p.displayName} trains with LogIt.`).replace(/\s+/g, " ").slice(0, 155));
</script>

<svelte:head>
  <title>{p.displayName} (@{p.username}) · LogIt</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="{SITE_URL}/@{p.username}" />
  <meta property="og:title" content="{p.displayName} (@{p.username})" />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="profile" />
</svelte:head>

<div class="mx-auto flex max-w-[600px] flex-col gap-4 px-4 pb-24 pt-8 sm:px-6">
  <ProfileHead profile={p} api={data.api} />
  <div class="grid grid-cols-2 gap-2">
    <a href="{DASHBOARD_URL}/social/{p.username}" class="rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground hover:bg-primary/90">Follow in LogIt</a>
    <a href="logit://u/{p.username}" class="rounded-lg border border-border px-4 py-3 text-center font-semibold hover:bg-muted">Open in the app</a>
  </div>
  {#if data.posts.length === 0 && data.forum.length === 0}
    <p class="py-10 text-center text-sm text-muted-foreground">No posts yet.</p>
  {:else if data.posts.length}
    <div class="flex flex-col">
      {#each data.posts as post (post.id)}<PublicPost {post} api={data.api} href="/@{p.username}/p/{post.id}" />{/each}
    </div>
  {/if}
  {#if data.forum.length}
    <h2 class="mt-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Forum</h2>
    <div class="flex flex-col">{#each data.forum as post (post.id)}<ForumRow {post} />{/each}</div>
  {/if}
  <div class="mt-2 flex flex-col gap-3 rounded-2xl border border-border p-5 sm:flex-row sm:items-center">
    <p class="flex-1 text-sm text-muted-foreground">Sign in to see more of {p.displayName}'s posts, like and comment. Any LogIt account works, and it's free.</p>
    <span class="flex gap-2">
      <a href="{DASHBOARD_URL}/social/{p.username}" class="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Sign in</a>
      <a href={PLAY_URL} class="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Get the app</a>
    </span>
  </div>
</div>
