<script lang="ts">
  import { Loader2, Trash2, Send, X, Pencil, Check } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiComment, type ApiPost } from "@logit/core/api/socialApi";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { formatDistanceToNow } from "$lib/utils";

  interface Props {
    post: ApiPost | null;
    onclose: () => void;
    oncommentcountchange?: (postId: string, delta: number) => void;
  }

  const { post, onclose, oncommentcountchange }: Props = $props();

  let comments = $state<ApiComment[]>([]);
  let loading = $state(false);
  let submitting = $state(false);
  let deletingId = $state<string | null>(null);
  let pendingDeleteId = $state<string | null>(null);
  let editingId = $state<string | null>(null);
  let editDraft = $state("");
  let savingEditId = $state<string | null>(null);
  let body = $state("");

  $effect(() => {
    if (post) {
      openOverlay();
      return () => closeOverlay();
    }
  });

  $effect(() => {
    if (post) {
      comments = [];
      loading = true;
      socialApi.getComments(post.id).then((page) => {
        comments = page.comments;
        loading = false;
      }).catch(() => {
        loading = false;
      });
    }
  });

  async function submit() {
    if (!post || !body.trim() || submitting) return;
    submitting = true;
    const text = body.trim();
    body = "";
    try {
      const comment = await socialApi.addComment(post.id, text);
      comments = [...comments, comment];
      oncommentcountchange?.(post.id, 1);
    } catch {
      body = text;
    } finally {
      submitting = false;
    }
  }

  function startEdit(comment: ApiComment) {
    editingId = comment.id;
    editDraft = comment.body;
  }

  function cancelEdit() {
    editingId = null;
    editDraft = "";
  }

  async function saveEdit(comment: ApiComment) {
    if (!post || !editDraft.trim() || savingEditId === comment.id) return;
    savingEditId = comment.id;
    try {
      const updated = await socialApi.editComment(post.id, comment.id, editDraft.trim());
      comments = comments.map((c) => c.id === comment.id ? updated : c);
      editingId = null;
    } catch {
      // keep edit open
    } finally {
      savingEditId = null;
    }
  }

  async function remove(comment: ApiComment) {
    if (!post || deletingId === comment.id) return;
    deletingId = comment.id;
    try {
      await socialApi.deleteComment(post.id, comment.id);
      comments = comments.filter((c) => c.id !== comment.id);
      oncommentcountchange?.(post.id, -1);
      pendingDeleteId = null;
    } catch {
      // ignore
    } finally {
      deletingId = null;
    }
  }

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }
</script>

{#if post}
  <!-- Backdrop -->
  <button
    type="button"
    class="fixed inset-0 bg-black/40 z-40"
    onclick={onclose}
    aria-label="Close"
  ></button>

  <!-- Sheet -->
  <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-xl border-t border-border max-h-[80dvh]">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
      <p class="text-sm font-semibold">Comments</p>
      <button type="button" class="p-1 text-muted-foreground" onclick={onclose}>
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Comment list -->
    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="flex justify-center py-10">
          <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      {:else if comments.length === 0}
        <p class="text-sm text-muted-foreground text-center py-10">No comments yet. Be the first!</p>
      {:else}
        <ul class="flex flex-col divide-y divide-border">
          {#each comments as comment (comment.id)}
            <li class="flex items-start gap-2.5 px-4 py-3">
              <!-- Avatar -->
              <div class="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 overflow-hidden">
                {#if comment.authorAvatarUrl}
                  <img src={comment.authorAvatarUrl} alt={comment.authorDisplayName} class="h-full w-full object-cover" />
                {:else}
                  {initials(comment.authorDisplayName)}
                {/if}
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-1.5 flex-wrap">
                  <span class="text-xs font-medium">{comment.authorDisplayName}</span>
                  <span class="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(comment.createdAt))}</span>
                  {#if comment.editedAt}
                    <span class="text-[10px] text-muted-foreground/60 italic">edited</span>
                  {/if}
                </div>

                {#if editingId === comment.id}
                  <div class="flex items-end gap-1.5 mt-1.5">
                    <textarea
                      bind:value={editDraft}
                      rows={2}
                      class="flex-1 resize-none rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(comment); } if (e.key === "Escape") cancelEdit(); }}
                    ></textarea>
                    <div class="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        class="flex items-center justify-center h-7 w-7 rounded bg-primary text-primary-foreground disabled:opacity-50"
                        disabled={!editDraft.trim() || savingEditId === comment.id}
                        onclick={() => void saveEdit(comment)}
                      >
                        {#if savingEditId === comment.id}
                          <Loader2 class="h-3 w-3 animate-spin" />
                        {:else}
                          <Check class="h-3 w-3" />
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="flex items-center justify-center h-7 w-7 rounded border border-border text-muted-foreground"
                        onclick={cancelEdit}
                      >
                        <X class="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                {:else}
                  <p class="text-sm mt-0.5 break-words">{comment.body}</p>
                {/if}
              </div>

              {#if authStore.user?.id === comment.authorId && editingId !== comment.id}
                <div class="flex items-center gap-1 shrink-0 mt-0.5">
                  {#if pendingDeleteId === comment.id}
                    <span class="text-[11px] text-muted-foreground">Delete?</span>
                    <button type="button"
                      class="text-[11px] text-destructive font-medium disabled:opacity-40"
                      disabled={deletingId === comment.id}
                      onclick={() => void remove(comment)}>
                      {#if deletingId === comment.id}<Loader2 class="h-3 w-3 animate-spin" />{:else}Yes{/if}
                    </button>
                    <button type="button" class="text-[11px] text-muted-foreground"
                      onclick={() => (pendingDeleteId = null)}>No</button>
                  {:else}
                    <button type="button"
                      class="text-muted-foreground/50 hover:text-foreground transition-colors"
                      onclick={() => startEdit(comment)}>
                      <Pencil class="h-3.5 w-3.5" />
                    </button>
                    <button type="button"
                      class="text-muted-foreground/50 hover:text-destructive transition-colors"
                      onclick={() => (pendingDeleteId = comment.id)}>
                      <Trash2 class="h-3.5 w-3.5" />
                    </button>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Compose -->
    {#if authStore.isAuthenticated}
      <div class="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <textarea
          bind:value={body}
          rows={1}
          placeholder="Add a comment…"
          class="flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[38px] max-h-32"
          onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        ></textarea>
        <button
          type="button"
          class="h-[38px] w-[38px] flex items-center justify-center rounded bg-primary text-primary-foreground shrink-0 disabled:opacity-50"
          disabled={!body.trim() || submitting}
          onclick={() => void submit()}
        >
          {#if submitting}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Send class="h-4 w-4" />
          {/if}
        </button>
      </div>
    {:else}
      <p class="text-xs text-muted-foreground text-center py-3 border-t border-border shrink-0">
        Sign in to leave a comment.
      </p>
    {/if}
  </div>
{/if}
