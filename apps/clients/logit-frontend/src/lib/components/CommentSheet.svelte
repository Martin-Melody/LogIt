<script lang="ts">
  import { Loader2, Trash2, Send, X, Pencil, Check, Flag, Heart } from "lucide-svelte";
  import { authStore } from "$lib/api/authStore.svelte";
  import { socialApi, type ApiComment, type ApiPost } from "@logit/core/api/socialApi";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { formatDistanceToNow } from "$lib/utils";
  import ReportSheet from "./social/ReportSheet.svelte";

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
  let likingId = $state<string | null>(null);
  let body = $state("");

  // Instagram-style: tap a comment and hold to bring up Edit/Delete (yours) or Report
  // (someone else's) — no icons sitting inline on the row any more.
  let menuComment = $state<ApiComment | null>(null);
  let reportComment = $state<ApiComment | null>(null);

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

  async function toggleLike(comment: ApiComment) {
    if (!post || likingId === comment.id || comment.authorId === authStore.user?.id) return;
    const wasLiked = comment.isLikedByMe;
    likingId = comment.id;
    comments = comments.map((c) =>
      c.id === comment.id ? { ...c, isLikedByMe: !wasLiked, likeCount: c.likeCount + (wasLiked ? -1 : 1) } : c,
    );
    try {
      if (wasLiked) await socialApi.unlikeComment(post.id, comment.id);
      else await socialApi.likeComment(post.id, comment.id);
    } catch {
      comments = comments.map((c) =>
        c.id === comment.id ? { ...c, isLikedByMe: wasLiked, likeCount: c.likeCount + (wasLiked ? 1 : -1) } : c,
      );
    } finally {
      likingId = null;
    }
  }

  function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }

  /** Press-and-hold gesture — pointer events cover touch and mouse alike. Cancels if the
   * pointer moves more than a few px (a scroll) or is released/leaves before the threshold. */
  function longPress(node: HTMLElement, onLongPress: () => void) {
    const DURATION_MS = 500;
    const MOVE_TOLERANCE_PX = 10;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    let handler = onLongPress;

    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    function start(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      cancel();
      timer = setTimeout(() => { timer = null; handler(); }, DURATION_MS);
    }
    function move(e: PointerEvent) {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - startY) > MOVE_TOLERANCE_PX) cancel();
    }

    node.addEventListener("pointerdown", start);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", cancel);
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("pointerleave", cancel);

    return {
      update(next: () => void) { handler = next; },
      destroy() {
        cancel();
        node.removeEventListener("pointerdown", start);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", cancel);
        node.removeEventListener("pointercancel", cancel);
        node.removeEventListener("pointerleave", cancel);
      },
    };
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
            {@const isOwn = authStore.user?.id === comment.authorId}
            <li
              class="flex items-start gap-2.5 px-4 py-3 select-none"
              use:longPress={() => { if (editingId !== comment.id) menuComment = comment; }}
            >
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

              <!-- Like — never shown on your own comment, matches Instagram (long-press there
                   opens Edit/Delete instead; long-press on someone else's opens Report). -->
              {#if !isOwn && editingId !== comment.id}
                <button
                  type="button"
                  class="flex flex-col items-center gap-0.5 shrink-0 mt-0.5 disabled:opacity-50"
                  disabled={likingId === comment.id}
                  onpointerdown={(e) => e.stopPropagation()}
                  onclick={() => void toggleLike(comment)}
                  aria-label={comment.isLikedByMe ? "Unlike" : "Like"}
                >
                  <Heart class="h-3.5 w-3.5 transition-colors {comment.isLikedByMe ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground/50'}" />
                  {#if comment.likeCount > 0}
                    <span class="text-[10px] tabular-nums {comment.isLikedByMe ? 'text-rose-500' : 'text-muted-foreground'}">{comment.likeCount}</span>
                  {/if}
                </button>
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

<!-- Long-press action menu -->
{#if menuComment}
  {@const isOwn = authStore.user?.id === menuComment.authorId}
  <button type="button" class="fixed inset-0 bg-black/40 z-[60]" aria-label="Close" onclick={() => (menuComment = null)}></button>
  <div class="fixed bottom-0 left-0 right-0 z-[70] flex flex-col bg-background rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)]">
    <div class="py-1">
      {#if isOwn}
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-muted/50"
          onclick={() => { const c = menuComment!; menuComment = null; startEdit(c); }}>
          <Pencil class="h-4 w-4 text-muted-foreground" /> Edit comment
        </button>
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm text-destructive hover:bg-muted/50"
          onclick={() => { pendingDeleteId = menuComment!.id; menuComment = null; }}>
          <Trash2 class="h-4 w-4" /> Delete comment
        </button>
      {:else}
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-muted/50"
          onclick={() => { reportComment = menuComment; menuComment = null; }}>
          <Flag class="h-4 w-4 text-muted-foreground" /> Report comment
        </button>
      {/if}
    </div>
  </div>
{/if}

<!-- Delete confirm -->
{#if pendingDeleteId}
  {@const target = comments.find((c) => c.id === pendingDeleteId)}
  <button type="button" class="fixed inset-0 bg-black/50 z-[60]" aria-label="Cancel" onclick={() => (pendingDeleteId = null)}></button>
  <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[min(90vw,20rem)] rounded-xl border border-border bg-background p-5 flex flex-col gap-3">
    <p class="text-sm font-semibold">Delete this comment?</p>
    <p class="text-xs text-muted-foreground">This can't be undone.</p>
    <div class="flex gap-2 justify-end pt-1">
      <button type="button" class="text-xs text-muted-foreground px-3 py-1.5" onclick={() => (pendingDeleteId = null)}>Cancel</button>
      <button type="button"
        class="text-xs bg-destructive text-destructive-foreground rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
        disabled={!target || deletingId === target.id}
        onclick={() => target && void remove(target)}>
        {#if target && deletingId === target.id}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if} Delete
      </button>
    </div>
  </div>
{/if}

<ReportSheet
  open={!!reportComment}
  targetType="Comment"
  targetId={reportComment?.id ?? ""}
  what="comment"
  onclose={() => (reportComment = null)}
/>
