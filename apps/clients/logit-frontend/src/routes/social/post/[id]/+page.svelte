<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Button } from "$lib/components/ui/button";
  import { back } from "$lib/navigation";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Send } from "lucide-svelte";
  import { socialApi, type ApiPost, type ApiComment } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import CommentList from "$lib/components/social/CommentList.svelte";
  import ReplyingTo from "$lib/components/social/ReplyingTo.svelte";
  import { replyDraft } from "@logit/core/domain/commentThreads";

  const id = $derived(page.params.id ?? "");

  let post = $state<ApiPost | null>(null);
  let postError = $state<string | null>(null);
  // Gone for good (removed, or private): trying again can't bring it back (bug hunt 5.13).
  let postGone = $state(false);
  let loading = $state(true);

  let comments = $state<ApiComment[]>([]);
  let commentsLoading = $state(true);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);

  let draft = $state("");
  let submitting = $state(false);
  let replyTo = $state<ApiComment | null>(null);
  let justSent = $state<ApiComment | null>(null);
  let input = $state<HTMLTextAreaElement | null>(null);

  function startReply(c: ApiComment) {
    replyTo = c;
    draft = replyDraft(c, draft);
    input?.focus();
  }

  function cancelReply() {
    if (replyTo && draft.trim().toLowerCase() === `@${replyTo.authorUsername}`.toLowerCase()) draft = "";
    replyTo = null;
  }

  onMount(() => {
    void loadPost();
    void loadComments();
  });

  async function loadPost() {
    loading = true;
    postError = null;
    postGone = false;
    try {
      post = await socialApi.getPost(id);
    } catch (e) {
      postGone = e instanceof ApiError && e.status === 404;
      postError = postGone ? "This post was removed, or it's from a private account you don't follow." : "Couldn't load the post.";
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
      const c = await socialApi.addComment(id, text, replyTo?.id);
      comments = [...comments, c];
      justSent = replyTo ? c : null;
      replyTo = null;
      if (post) post = { ...post, commentCount: post.commentCount + 1 };
    } catch {
      draft = text;
    } finally {
      submitting = false;
    }
  }

</script>

<div class="flex flex-col min-h-full">
  <PageHeader>
    <BackButton onclick={() => history.back()} />
    <h1 class="page-title">Post</h1>
  </PageHeader>

  {#if loading}
    <div class="flex justify-center py-20"><Spinner class="h-5 w-5 text-muted-foreground" /></div>
  {:else if postError}
    <div class="flex flex-col items-center gap-3 py-20 text-center px-6">
      <p class="text-sm text-muted-foreground">{postError}</p>
      {#if postGone}
        <Button variant="outline" class="h-11" onclick={() => back("/social")}>Back to Social</Button>
      {:else}
        <Button variant="outline" class="h-11" onclick={loadPost}>Try again</Button>
      {/if}
    </div>
  {:else if post}
    <div class="border-b border-border">
      <PostCard {post} href={false} onchange={(next) => { if (!next) history.back(); else post = next; }} />
    </div>

    <!-- Comments -->
    {#if commentsLoading}
      <div class="flex justify-center py-8"><Spinner class="h-4 w-4 text-muted-foreground" /></div>
    {:else}
      <CommentList
        bind:comments
        postId={id}
        oncountchange={(d) => { if (post) post = { ...post, commentCount: Math.max(0, post.commentCount + d) }; }}
        onreply={startReply}
        {justSent}
        postAuthorId={post?.repostOf && !post.body ? post.repostOf.authorId : post?.authorId}
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
    <div class="sticky bottom-0 bg-background border-t border-border">
    {#if replyTo}<ReplyingTo comment={replyTo} oncancel={cancelReply} />{/if}
    <div class="px-3 py-2 flex items-end gap-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <textarea
        bind:this={input}
        bind:value={draft}
        rows={1}
        placeholder={replyTo ? `Reply to ${replyTo.authorDisplayName}…` : "Add a comment…"}
        class="flex-1 resize-none rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-24"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
      ></textarea>
      <button type="button" class="h-11 w-11 shrink-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" disabled={!draft.trim() || submitting} onclick={submit} aria-label="Send">
        {#if submitting}<Spinner class="h-4 w-4" />{:else}<Send class="h-4 w-4" />{/if}
      </button>
    </div>
    </div>
  {/if}
</div>
