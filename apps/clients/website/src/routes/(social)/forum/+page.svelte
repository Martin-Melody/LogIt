<!-- The Forum, signed out (canvas S2): Active, New or Top; New post opens the sign-in prompt. -->
<script lang="ts">
  import { SITE_URL } from "$lib/site";
  import ForumRow from "$lib/social/ForumRow.svelte";
  import { ask } from "$lib/social/prompt.svelte";

  const { data } = $props();
  const sorts = [["active", "Active"], ["new", "New"], ["top", "Top"]] as const;
</script>

<svelte:head>
  <title>Forum · LogIt</title>
  <meta name="description" content="Questions and threads about training, from people on LogIt: form checks, gyms, meet prep and more." />
  <link rel="canonical" href="{SITE_URL}/forum" />
</svelte:head>

<div class="border-b border-border px-4 py-4 sm:px-5">
  <h1 class="text-xl font-bold text-heading">Forum</h1>
  <p class="text-sm text-muted-foreground">Questions and threads from anyone on LogIt</p>
</div>
<div class="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
  {#each sorts as [v, label] (v)}
    <a href="?sort={v}" aria-current={data.sort === v ? "page" : undefined}
      class="flex h-10 items-center rounded-full px-4 text-sm {data.sort === v ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border hover:bg-muted'}">{label}</a>
  {/each}
  <button type="button" class="ml-auto flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" onclick={() => ask("post")}>New post</button>
</div>
{#if data.posts.length === 0}
  <p class="px-6 py-16 text-center text-sm text-muted-foreground">No forum posts yet. Ask the first question.</p>
{:else}
  <div class="flex flex-col">{#each data.posts as post (post.id)}<ForumRow {post} />{/each}</div>
  {#if data.posts.length === 30}<a href="?sort={data.sort}&skip={data.skip + 30}" class="mx-auto mt-4 flex h-10 w-fit items-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted">More posts</a>{/if}
{/if}
