<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { socialApi, type ApiComment } from "@logit/core/api/socialApi";
  import Avatar from "./Avatar.svelte";
  import MentionText from "./MentionText.svelte";
  import ReportDialog from "./ReportDialog.svelte";
  import { me, timeAgo } from "./socialData.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { removedByDelete, repliesStartFolded, replyDraft, threadComments, threadIdFor } from "@logit/core/domain/commentThreads";

  let { postId, postAuthorId, count = $bindable(0) }: { postId: string; postAuthorId: string; count?: number } = $props();

  const self = me();
  let comments = $state<ApiComment[] | null>(null);
  let next = $state<string | null>(null);
  let draft = $state("");
  let sending = $state(false);
  let editingId = $state<string | null>(null);
  let editDraft = $state("");
  let reportId = $state<string | null>(null);
  let reportOpen = $state(false);
  let deleteId = $state<string | null>(null);
  let deleteOpen = $state(false);
  let replyTo = $state<ApiComment | null>(null);
  let justSent = $state<string | null>(null);

  // Instagram-style threads: replies under their comment, folded behind "View N replies" when
  // there are more than 3. Threads you open (or reply in) stay open.
  const threads = $derived(threadComments(comments ?? []));
  const opened = new SvelteSet<string>();

  async function load(more = false) {
    try {
      const page = await socialApi.getComments(postId, more ? next ?? undefined : undefined);
      comments = more ? [...(comments ?? []), ...page.comments] : page.comments;
      next = page.nextCursor;
    } catch {
      comments ??= [];
    }
  }
  $effect(() => { void load(); });

  async function send() {
    if (!draft.trim() || sending) return;
    sending = true;
    try {
      const c = await socialApi.addComment(postId, draft.trim(), replyTo?.id);
      comments = [...(comments ?? []), c];
      count += 1;
      draft = "";
      if (replyTo) {
        opened.add(threadIdFor(replyTo));
        justSent = c.id;
      }
      replyTo = null;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post the comment");
    } finally {
      sending = false;
    }
  }

  async function like(c: ApiComment) {
    if (c.authorId === self?.id) return;
    const was = c.isLikedByMe;
    comments = (comments ?? []).map((x) => (x.id === c.id ? { ...x, isLikedByMe: !was, likeCount: x.likeCount + (was ? -1 : 1) } : x));
    try {
      if (was) await socialApi.unlikeComment(postId, c.id);
      else await socialApi.likeComment(postId, c.id);
    } catch {
      comments = (comments ?? []).map((x) => (x.id === c.id ? c : x));
    }
  }

  async function saveEdit(c: ApiComment) {
    if (!editDraft.trim()) return;
    try {
      const updated = await socialApi.editComment(postId, c.id, editDraft.trim());
      comments = (comments ?? []).map((x) => (x.id === c.id ? updated : x));
      editingId = null;
    } catch {
      toast.error("Couldn't save the edit");
    }
  }

  async function remove() {
    if (!deleteId) return;
    try {
      await socialApi.deleteComment(postId, deleteId);
      const gone = new Set(removedByDelete(comments ?? [], deleteId));
      comments = (comments ?? []).filter((x) => !gone.has(x.id));
      count = Math.max(0, count - gone.size);
      if (replyTo && gone.has(replyTo.id)) replyTo = null;
    } catch {
      toast.error("Couldn't delete the comment");
    }
  }

  function reply(c: ApiComment) {
    replyTo = c;
    draft = replyDraft(c, draft);
    document.getElementById("new-comment")?.focus();
  }

  function cancelReply() {
    if (replyTo && draft.trim().toLowerCase() === `@${replyTo.authorUsername}`.toLowerCase()) draft = "";
    replyTo = null;
  }
</script>

<div class="flex flex-col gap-3.5">
  <h2 class="text-sm font-semibold">Comments{count ? ` · ${count}` : ""}</h2>
  {#if comments === null}
    <p class="text-xs text-muted-foreground">Loading…</p>
  {:else if comments.length === 0}
    <p class="text-xs text-muted-foreground">No comments yet.</p>
  {/if}
  {#snippet comment(c: ApiComment, isReply: boolean)}
    <div class="flex gap-2.5 {isReply ? 'ml-10' : ''} {c.id === justSent ? 'rounded-lg bg-sky-500/10 ring-[6px] ring-sky-500/10' : ''}">
      <a href="/social/{c.authorUsername}"><Avatar name={c.authorDisplayName} url={c.authorAvatarUrl} size={isReply ? 24 : 30} /></a>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-xs font-semibold"><a href="/social/{c.authorUsername}" class="hover:underline">{c.authorId === self?.id ? "You" : c.authorDisplayName}</a> <span class="font-normal text-muted-foreground">· {timeAgo(c.createdAt)}{c.authorId === postAuthorId ? " · author" : ""}{c.editedAt ? " · edited" : ""}</span></span>
        {#if editingId === c.id}
          <label for="edit-c-{c.id}" class="sr-only">Edit comment</label>
          <textarea id="edit-c-{c.id}" bind:value={editDraft} rows="2" class="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px]"></textarea>
          <span class="flex gap-3 text-xs"><button type="button" onclick={() => saveEdit(c)} class="font-semibold">Save</button><button type="button" onclick={() => (editingId = null)} class="text-muted-foreground">Cancel</button></span>
        {:else}
          <MentionText text={c.body} class="text-[13px] leading-snug" />
          <span class="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {#if c.authorId !== self?.id}
              <button type="button" onclick={() => like(c)} aria-pressed={c.isLikedByMe} class="py-1 hover:text-foreground {c.isLikedByMe ? 'font-semibold text-rose-600 dark:text-rose-300' : ''}">{c.isLikedByMe ? "Liked" : "Like"}{c.likeCount ? ` · ${c.likeCount}` : ""}</button>
              <button type="button" onclick={() => reply(c)} class="py-1 hover:text-foreground">Reply</button>
              <button type="button" onclick={() => { reportId = c.id; reportOpen = true; }} class="py-1 hover:text-foreground">Report</button>
              <!-- Your post: you may remove anyone's comment on it (bug hunt 5.12). -->
              {#if self?.id === postAuthorId}
                <button type="button" onclick={() => { deleteId = c.id; deleteOpen = true; }} class="py-1 hover:text-foreground">Remove</button>
              {/if}
            {:else}
              {#if c.likeCount}<span class="py-1">{c.likeCount} like{c.likeCount === 1 ? "" : "s"}</span>{/if}
              <button type="button" onclick={() => { editingId = c.id; editDraft = c.body; }} class="py-1 hover:text-foreground">Edit</button>
              <button type="button" onclick={() => { deleteId = c.id; deleteOpen = true; }} class="py-1 hover:text-foreground">Delete</button>
            {/if}
          </span>
        {/if}
      </div>
    </div>
  {/snippet}
  {#each threads as t (t.comment.id)}
    {@const foldable = repliesStartFolded(t.replies.length)}
    {@const folded = foldable && !opened.has(t.comment.id)}
    {@render comment(t.comment, false)}
    {#if !folded}
      {#each t.replies as r (r.id)}{@render comment(r, true)}{/each}
    {/if}
    {#if foldable}
      <button type="button" aria-expanded={!folded}
        onclick={() => (folded ? opened.add(t.comment.id) : opened.delete(t.comment.id))}
        class="-my-1 ml-10 flex items-center gap-2.5 self-start py-1.5 text-xs font-semibold text-muted-foreground before:h-px before:w-6 before:bg-muted-foreground/50 before:content-[''] hover:text-foreground">
        {folded ? `View ${t.replies.length} replies` : "Hide replies"}
      </button>
    {/if}
  {/each}
  {#if next}
    <button type="button" onclick={() => load(true)} class="h-8 self-start rounded-[9px] border border-border px-3 text-xs">Show more</button>
  {/if}
  <div class="flex flex-col gap-2 border-t border-border pt-3">
  {#if replyTo}
    <div class="flex items-center justify-between text-xs text-muted-foreground">
      <span>Replying to <strong class="font-semibold text-foreground">{replyTo.authorDisplayName}</strong></span>
      <button type="button" onclick={cancelReply} class="py-1 hover:text-foreground">Cancel</button>
    </div>
  {/if}
  <div class="flex gap-2">
    <label for="new-comment" class="sr-only">{replyTo ? `Reply to ${replyTo.authorDisplayName}` : "Add a comment"}</label>
    <input id="new-comment" bind:value={draft} maxlength="1000" placeholder={replyTo ? `Reply to ${replyTo.authorDisplayName}` : "Add a comment, @ to mention"}
      onkeydown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
        if (e.key === "Escape" && replyTo) cancelReply();
      }}
      class="h-9 min-w-0 flex-1 rounded-[9px] border bg-background px-3 text-[13px] {replyTo ? 'border-sky-500/50' : 'border-border'}" />
    <button type="button" disabled={!draft.trim() || sending} onclick={send} class="h-9 rounded-[9px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Send</button>
  </div>
  </div>
</div>

{#if reportId}<ReportDialog bind:open={reportOpen} targetType="Comment" targetId={reportId} what="comment" />{/if}

<AlertDialog.Root bind:open={deleteOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this comment?</AlertDialog.Title>
      <AlertDialog.Description>It's removed for everyone.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={remove}>Delete</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
