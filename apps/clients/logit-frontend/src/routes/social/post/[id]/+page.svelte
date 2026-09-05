<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowLeft, Loader2, Send } from "lucide-svelte";
  import { socialApi, type ApiPost, type ApiComment } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import CommentList from "$lib/components/social/CommentList.svelte";

  const id = $derived(page.params.id ?? "");

  let post = $state<ApiPost | null>(null);
  let postError = $state<string | null>(null);
  let loading = $state(true);

  let comments = $state<ApiComment[]>([]);
  let commentsLoading = $state(true);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);

  let draft = $state("");
  let submitting = $state(false);

  onMount(() => {
    void loadPost();
    void loadComments();
  });

  async function loadPost() {
    loading = true;
    postError = null;
    try {
      post = await socialApi.getPost(id);
    } catch (e) {
      postError = e instanceof ApiError && e.status === 404 ? "This post isn't available." : "Couldn't load the post.";
    } finally {
      loading = false;
    }
  }

  async function loadComments(more = false) {
    if (more) loadingMore = true;
    else commentsLoading = true;
    try {
      const p = await socialApi.getComments(id, more ? nextCursor ?? undefined : undefined);
      comments = more ? [...comments, ...p.comments] : p.comments;
      nextCursor = p.nextCursor;
    } catch {
      // leave what we have
    } finally {
      commentsLoading = false;
      loadingMore = false;
    }
  }

  async function submit() {
    if (!draft.trim() || submitting) return;
    if (!authStore.isAuthenticated) { void goto("/auth?mode=login"); return; }
    submitting = true;
    const text = draft.trim();
    draft = "";
    try {
      const c = await socialApi.addComment(id, text);
      comments = [...comments, c];
      if (post) post = { ...post, commentCount: post.commentCount + 1 };
    } catch {
      draft = text;
    } finally {
      submitting = false;
    }
  }

</script>

<div class="flex flex-col min-h-full">
  <header class="flex items-center gap-2 px-3 h-12 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <button type="button" class="p-1 -ml-1 text-muted-foreground" aria-label="Back" onclick={() => history.back()}>
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-base font-semibold">Post</h1>
  </header>

  {#if loading}
    <div class="flex justify-center py-20"><Loader2 class="h-5 w-5 animate-spin text-muted-foreground" /></div>
  {:else if postError}
    <div class="flex flex-col items-center gap-3 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">{postError}</p>
      <button type="button" class="text-sm text-primary" onclick={loadPost}>Try again</button>
    </div>
  {:else if post}
    <div class="border-b border-border">
      <PostCard {post} href={false} onchange={(next) => { if (!next) history.back(); else post = next; }} />
    </div>

    <!-- Comments -->
    {#if commentsLoading}
      <div class="flex justify-center py-8"><Loader2 class="h-4 w-4 animate-spin text-muted-foreground" /></div>
    {:else}
      <CommentList
        bind:comments
        postId={id}
        oncountchange={(d) => { if (post) post = { ...post, commentCount: Math.max(0, post.commentCount + d) }; }}
      />
      {#if nextCursor}
        <button type="button" class="w-full text-xs text-muted-foreground py-3 disabled:opacity-50" disabled={loadingMore} onclick={() => loadComments(true)}>
          {loadingMore ? "Loading…" : "Load older comments"}
        </button>
      {/if}
    {/if}
  {/if}

  <div class="flex-1"></div>

  {#if post && authStore.isAuthenticated}
    <div class="sticky bottom-0 bg-background border-t border-border px-3 py-2 flex items-end gap-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <textarea
        bind:value={draft}
        rows={1}
        placeholder="Add a comment…"
        class="flex-1 resize-none rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-24"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
      ></textarea>
      <button type="button" class="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" disabled={!draft.trim() || submitting} onclick={submit} aria-label="Send">
        {#if submitting}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Send class="h-4 w-4" />{/if}
      </button>
    </div>
  {/if}
</div>
