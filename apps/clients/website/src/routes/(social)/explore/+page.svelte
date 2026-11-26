<!-- Explore, signed out (canvas S1): posts from public accounts in Discover. -->
<script lang="ts">
  import { SITE_URL } from "$lib/site";
  import PublicPost from "$lib/social/PublicPost.svelte";

  const { data } = $props();
</script>

<svelte:head>
  <title>Explore · LogIt</title>
  <meta name="description" content="Workouts, records and posts from people training with LogIt." />
  <link rel="canonical" href="{SITE_URL}/explore" />
</svelte:head>

<div class="border-b border-border px-4 py-4 sm:px-5">
  <h1 class="text-xl font-bold text-heading">Explore</h1>
  <p class="text-sm text-muted-foreground">Posts from people on LogIt</p>
</div>
{#if data.page.posts.length === 0}
  <p class="px-6 py-16 text-center text-sm text-muted-foreground">Nothing here yet. As people post, it shows up here.</p>
{:else}
  <div class="flex flex-col px-4 sm:px-5">
    {#each data.page.posts as post (post.id)}<PublicPost {post} api={data.api} showAuthor href="/@{post.authorUsername}/p/{post.id}" />{/each}
  </div>
  {#if data.page.nextCursor}<a href="?cursor={encodeURIComponent(data.page.nextCursor)}" class="mx-auto mt-4 flex h-10 w-fit items-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted">More posts</a>{/if}
{/if}
