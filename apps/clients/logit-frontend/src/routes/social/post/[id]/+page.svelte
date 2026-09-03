<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { ArrowLeft, Loader2, Send, Trash2, Pencil, Check, X, Flag } from "lucide-svelte";
  import { socialApi, type ApiPost, type ApiComment } from "@logit/core/api/socialApi";
  import { ApiError } from "@logit/core/api/client";
  import { authStore } from "$lib/api/authStore.svelte";
  import { formatDistanceToNow } from "$lib/utils";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import ReportSheet from "$lib/components/social/ReportSheet.svelte";

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
  let editingId = $state<string | null>(null);
  let editDraft = $state("");
  let savingEditId = $state<string | null>(null);
  let pendingDeleteId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let reportComment = $state<ApiComment | null>(null);

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

  async function saveEdit(c: ApiComment) {
    if (!editDraft.trim() || savingEditId === c.id) return;
    savingEditId = c.id;
    try {
      const updated = await socialApi.editComment(id, c.id, editDraft.trim());
      comments = comments.map((x) => (x.id === c.id ? updated : x));
      editingId = null;
    } catch {
      // keep open
    } finally {
      savingEditId = null;
    }
  }

  async function remove(c: ApiComment) {
    if (deletingId === c.id) return;
    deletingId = c.id;
    try {
      await socialApi.deleteComment(id, c.id);
      comments = comments.filter((x) => x.id !== c.id);
      if (post) post = { ...post, commentCount: Math.max(0, post.commentCount - 1) };
      pendingDeleteId = null;
    } catch {
      // ignore
    } finally {
      deletingId = null;
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
    {:else if comments.length === 0}
      <p class="text-sm text-muted-foreground text-center py-8">No comments yet. Be the first.</p>
    {:else}
      <ul class="divide-y divide-border">
        {#each comments as c (c.id)}
          <li class="px-4 py-3 flex gap-2.5">
            <button
              type="button"
              class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden"
              onclick={() => goto(`/social/${c.authorUsername}`)}
            >
              {#if c.authorAvatarUrl}
                <img src={c.authorAvatarUrl} alt={c.authorDisplayName} class="h-full w-full object-cover" />
              {:else}
                {c.authorDisplayName.charAt(0).toUpperCase()}
              {/if}
            </button>
            <div class="min-w-0 flex-1">
              <p class="text-xs">
                <span class="font-semibold">{c.authorDisplayName}</span>
                <span class="text-muted-foreground"> @{c.authorUsername} · {formatDistanceToNow(new Date(c.createdAt))}</span>
                {#if c.editedAt}<span class="text-[10px] text-muted-foreground/60 italic"> · edited</span>{/if}
              </p>

              {#if editingId === c.id}
                <div class="flex items-end gap-2 mt-1">
                  <textarea
                    bind:value={editDraft}
                    rows={2}
                    class="flex-1 resize-none rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  ></textarea>
                  <button type="button" class="h-8 w-8 flex items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-50" disabled={!editDraft.trim() || savingEditId === c.id} onclick={() => saveEdit(c)}>
                    {#if savingEditId === c.id}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Check class="h-3.5 w-3.5" />{/if}
                  </button>
                  <button type="button" class="h-8 w-8 flex items-center justify-center rounded border border-border text-muted-foreground" onclick={() => (editingId = null)}>
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              {:else}
                <p class="text-sm whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                <div class="flex items-center gap-3 mt-1">
                  {#if c.authorId === authStore.user?.id}
                    <button type="button" class="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" onclick={() => { editingId = c.id; editDraft = c.body; }}>
                      <Pencil class="h-3 w-3" /> Edit
                    </button>
                    {#if pendingDeleteId === c.id}
                      <button type="button" class="text-[11px] text-destructive font-medium" disabled={deletingId === c.id} onclick={() => remove(c)}>
                        {#if deletingId === c.id}<Loader2 class="h-3 w-3 animate-spin" />{:else}Confirm delete{/if}
                      </button>
                      <button type="button" class="text-[11px] text-muted-foreground" onclick={() => (pendingDeleteId = null)}>Cancel</button>
                    {:else}
                      <button type="button" class="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1" onclick={() => (pendingDeleteId = c.id)}>
                        <Trash2 class="h-3 w-3" /> Delete
                      </button>
                    {/if}
                  {:else}
                    <button type="button" class="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1" onclick={() => (reportComment = c)}>
                      <Flag class="h-3 w-3" /> Report
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
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

<ReportSheet
  open={reportComment !== null}
  targetType="Comment"
  targetId={reportComment?.id ?? ""}
  what="comment"
  onclose={() => (reportComment = null)}
/>
