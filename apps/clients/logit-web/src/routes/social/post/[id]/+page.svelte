<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ApiError } from "@logit/core/api/client";
  import { socialApi, type ApiPost } from "@logit/core/api/socialApi";
  import PostCard from "$lib/features/social/PostCard.svelte";
  import Comments from "$lib/features/social/Comments.svelte";

  // One post: everything its attachment carries (and Copy to mine), with the comments beside it.
  const id = $derived(page.params.id ?? "");
  let post = $state<ApiPost | null>(null);
  let error = $state<string | null>(null);
  let gone = $state(false);

  $effect(() => {
    const want = id;
    post = null;
    error = null;
    gone = false;
    socialApi.getPost(want).then((p) => {
      if (want !== id) return;
      // A plain repost has nothing of its own: show the post it shares.
      if (p.repostOf && !p.body && !p.repostOf.deleted) { void goto(`/social/post/${p.repostOf.id}`, { replaceState: true }); return; }
      post = p;
    }).catch((e) => {
      if (want !== id) return;
      error = e instanceof ApiError && e.status === 404 ? "This post was removed, or it's from a private account you don't follow." : "Couldn't load this post.";
    });
  });
</script>

<div class="mx-auto flex max-w-[1060px] flex-col gap-3.5">
  <a href="/social" class="text-[13px] text-muted-foreground hover:text-foreground">‹ Social</a>
  {#if error}
    <p class="py-16 text-center text-sm text-muted-foreground">{error}</p>
  {:else if gone}
    <p class="py-16 text-center text-sm text-muted-foreground">This post is gone. <a href="/social" class="underline">Back to Social</a></p>
  {:else if !post}
    <div class="flex flex-wrap gap-5"><Skeleton class="h-96 flex-[999_1_520px]" /><Skeleton class="h-72 flex-[1_1_320px]" /></div>
  {:else}
    <div class="flex flex-wrap items-start gap-5">
      <div class="min-w-0 flex-[999_1_520px]">
        <PostCard {post} full onchange={(n) => { if (n) post = n; else gone = true; }} />
      </div>
      <aside class="min-w-0 flex-[1_1_320px] rounded-[10px] border border-border bg-card px-[18px] py-4">
        <Comments postId={post.id} postAuthorId={post.authorId} bind:count={post.commentCount} />
      </aside>
    </div>
  {/if}
</div>
