<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    Heart, MessageCircle, MoreHorizontal, Loader2, Check, X,
    Link2, Flag, Ban, Pencil, Trash2,
  } from "lucide-svelte";
  import { socialApi, type ApiPost } from "@logit/core/api/socialApi";
  import { authStore } from "$lib/api/authStore.svelte";
  import { openOverlay, closeOverlay } from "$lib/stores/overlay.store";
  import { formatDistanceToNow } from "$lib/utils";
  import { MARKETING_URL } from "$lib/constants/urls";
  import { toast } from "svelte-sonner";
  import PostAttachment from "./PostAttachment.svelte";
  import ReportSheet from "./ReportSheet.svelte";
  import { copyAlgorithmToMine, copyWidgetToMine, type AlgorithmFamily } from "$lib/features/social/copyToMine";

  interface Props {
    post: ApiPost;
    /** Tapping the card navigates to the post detail page. Off on the detail page itself. */
    href?: boolean;
    onopencomments?: (post: ApiPost) => void;
    /** null = the post is gone (deleted or author blocked); a post = updated in place. */
    onchange?: (post: ApiPost | null) => void;
  }

  const { post, href = true, onopencomments, onchange }: Props = $props();

  // Local snapshot for optimistic like / edit; re-synced if the prop changes.
  let p = $state({ ...post });
  $effect(() => { p = { ...post }; });

  const isOwn = $derived(authStore.user?.id === p.authorId);

  let liking = $state(false);
  let menuOpen = $state(false);
  let reportOpen = $state(false);
  let confirmBlock = $state(false);
  let blocking = $state(false);
  let editing = $state(false);
  let editDraft = $state("");
  let savingEdit = $state(false);
  let confirmDelete = $state(false);
  let deleting = $state(false);
  let copying = $state(false);

  // "Copy to mine" — cheap tier (Algorithm/Widget, id-reference only). See
  // docs/architecture/profile-progress-redesign.md P3/P4 and copyToMine.ts.
  const copyable = $derived(p.type === "Algorithm" || p.type === "Widget");

  async function handleCopy() {
    if (copying || !p.payloadJson) return;
    copying = true;
    try {
      const payload = JSON.parse(p.payloadJson) as { id?: string; family?: string };
      if (!payload.id) throw new Error("missing id");
      if (p.type === "Algorithm") {
        await copyAlgorithmToMine(payload.id, (payload.family ?? "progression") as AlgorithmFamily);
        toast.success("Added to your settings");
      } else if (p.type === "Widget") {
        const applied = copyWidgetToMine(payload.id);
        toast[applied ? "success" : "error"](
          applied ? "Widget enabled on your profile" : "Couldn't copy — that widget isn't available on your device",
        );
      }
    } catch {
      toast.error("Couldn't copy this");
    } finally {
      copying = false;
    }
  }

  $effect(() => {
    if (menuOpen) { openOverlay(); return () => closeOverlay(); }
  });

  async function toggleLike(e: MouseEvent) {
    e.stopPropagation();
    if (liking) return;
    if (!authStore.isAuthenticated) { void goto("/auth?mode=login&redirect=/social"); return; }
    liking = true;
    const wasLiked = p.isLikedByMe;
    p = { ...p, isLikedByMe: !wasLiked, likeCount: p.likeCount + (wasLiked ? -1 : 1) };
    try {
      if (wasLiked) await socialApi.unlikePost(p.id);
      else await socialApi.likePost(p.id);
      onchange?.(p);
    } catch {
      p = { ...p, isLikedByMe: wasLiked, likeCount: p.likeCount + (wasLiked ? 1 : -1) };
    } finally {
      liking = false;
    }
  }

  function openCard() {
    if (href && !editing) void goto(`/social/post/${p.id}`);
  }

  function copyLink() {
    menuOpen = false;
    const url = `${MARKETING_URL}/p/${p.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  function startEdit() {
    menuOpen = false;
    editDraft = p.body ?? "";
    editing = true;
  }

  async function saveEdit() {
    if (!editDraft.trim() || savingEdit) return;
    savingEdit = true;
    try {
      const updated = await socialApi.editPost(p.id, editDraft.trim());
      p = { ...updated };
      onchange?.(updated);
      editing = false;
    } catch {
      toast.error("Couldn't save the edit");
    } finally {
      savingEdit = false;
    }
  }

  async function doDelete() {
    if (deleting) return;
    deleting = true;
    try {
      await socialApi.deletePost(p.id);
      onchange?.(null);
    } catch {
      toast.error("Couldn't delete the post");
      deleting = false;
      confirmDelete = false;
    }
  }

  async function doBlock() {
    if (blocking) return;
    blocking = true;
    try {
      await socialApi.blockUser(p.authorUsername);
      toast.success(`Blocked @${p.authorUsername}`);
      onchange?.(null);
    } catch {
      toast.error("Couldn't block this account");
    } finally {
      blocking = false;
      confirmBlock = false;
      menuOpen = false;
    }
  }
</script>

<article class="px-4 py-3 flex flex-col gap-2">
  <!-- Author row -->
  <div class="flex items-center gap-2.5">
    <button
      type="button"
      class="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden"
      onclick={() => void goto(`/social/${p.authorUsername}`)}
    >
      {#if p.authorAvatarUrl}
        <img src={p.authorAvatarUrl} alt={p.authorDisplayName} class="h-full w-full object-cover" />
      {:else}
        {p.authorDisplayName.charAt(0).toUpperCase()}
      {/if}
    </button>

    <button type="button" class="flex-1 min-w-0 text-left leading-tight" onclick={() => void goto(`/social/${p.authorUsername}`)}>
      <span class="text-sm font-semibold">{p.authorDisplayName}</span>
      <span class="text-xs text-muted-foreground"> @{p.authorUsername} · {formatDistanceToNow(new Date(p.createdAt))}</span>
      {#if p.editedAt}<span class="text-[10px] text-muted-foreground/60 italic"> · edited</span>{/if}
    </button>

    <button type="button" class="p-1 -mr-1 text-muted-foreground shrink-0" aria-label="More" onclick={(e) => { e.stopPropagation(); menuOpen = true; }}>
      <MoreHorizontal class="h-4 w-4" />
    </button>
  </div>

  <!-- Body -->
  {#if editing}
    <div class="flex flex-col gap-2">
      <textarea
        bind:value={editDraft}
        rows={3}
        class="resize-none rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      ></textarea>
      <div class="flex gap-2 justify-end">
        <button type="button" class="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1" onclick={() => (editing = false)}>
          <X class="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          type="button"
          class="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50"
          disabled={!editDraft.trim() || savingEdit}
          onclick={saveEdit}
        >
          {#if savingEdit}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Check class="h-3.5 w-3.5" />{/if} Save
        </button>
      </div>
    </div>
  {:else}
    <div
      class="flex flex-col gap-2 {href ? 'cursor-pointer' : ''}"
      role={href ? "link" : undefined}
      tabindex={href ? 0 : undefined}
      onclick={openCard}
      onkeydown={(e) => { if (href && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCard(); } }}
    >
      {#if p.body}
        <p class="text-sm whitespace-pre-wrap break-words">{p.body}</p>
      {/if}
      <PostAttachment post={p} oncopy={copyable ? handleCopy : undefined} {copying} />
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex items-center gap-4 pt-0.5">
    <button
      type="button"
      class="flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40 {p.isLikedByMe ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'}"
      disabled={liking}
      onclick={toggleLike}
    >
      <Heart class="h-4 w-4 {p.isLikedByMe ? 'fill-rose-500' : ''}" />
      {#if p.likeCount > 0}<span>{p.likeCount}</span>{/if}
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      onclick={(e) => { e.stopPropagation(); onopencomments ? onopencomments(p) : goto(`/social/post/${p.id}`); }}
    >
      <MessageCircle class="h-4 w-4" />
      {#if p.commentCount > 0}<span>{p.commentCount}</span>{/if}
    </button>
  </div>
</article>

<!-- Overflow menu -->
{#if menuOpen}
  <button type="button" class="fixed inset-0 bg-black/40 z-40" aria-label="Close" onclick={() => (menuOpen = false)}></button>
  <div class="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-background rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)]">
    <div class="py-1">
      <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-muted/50" onclick={copyLink}>
        <Link2 class="h-4 w-4 text-muted-foreground" /> Copy link
      </button>
      {#if isOwn}
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-muted/50" onclick={startEdit}>
          <Pencil class="h-4 w-4 text-muted-foreground" /> Edit post
        </button>
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm text-destructive hover:bg-muted/50" onclick={() => { menuOpen = false; confirmDelete = true; }}>
          <Trash2 class="h-4 w-4" /> Delete post
        </button>
      {:else}
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-muted/50" onclick={() => { menuOpen = false; reportOpen = true; }}>
          <Flag class="h-4 w-4 text-muted-foreground" /> Report post
        </button>
        <button type="button" class="w-full flex items-center gap-3 px-5 py-3.5 text-sm text-destructive hover:bg-muted/50" onclick={() => { menuOpen = false; confirmBlock = true; }}>
          <Ban class="h-4 w-4" /> Block @{p.authorUsername}
        </button>
      {/if}
    </div>
  </div>
{/if}

<ReportSheet
  open={reportOpen}
  targetType="Post"
  targetId={p.id}
  what="post"
  onclose={() => (reportOpen = false)}
/>

<!-- Block confirm -->
{#if confirmBlock}
  <button type="button" class="fixed inset-0 bg-black/50 z-50" aria-label="Cancel" onclick={() => (confirmBlock = false)}></button>
  <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(90vw,20rem)] rounded-xl border border-border bg-background p-5 flex flex-col gap-3">
    <p class="text-sm font-semibold">Block @{p.authorUsername}?</p>
    <p class="text-xs text-muted-foreground">
      You won't see each other's posts, comments, or profiles, and you'll both stop following each other.
      You can undo this from Settings.
    </p>
    <div class="flex gap-2 justify-end pt-1">
      <button type="button" class="text-xs text-muted-foreground px-3 py-1.5" onclick={() => (confirmBlock = false)}>Cancel</button>
      <button type="button" class="text-xs bg-destructive text-destructive-foreground rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50" disabled={blocking} onclick={doBlock}>
        {#if blocking}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if} Block
      </button>
    </div>
  </div>
{/if}

<!-- Delete confirm -->
{#if confirmDelete}
  <button type="button" class="fixed inset-0 bg-black/50 z-50" aria-label="Cancel" onclick={() => (confirmDelete = false)}></button>
  <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(90vw,20rem)] rounded-xl border border-border bg-background p-5 flex flex-col gap-3">
    <p class="text-sm font-semibold">Delete this post?</p>
    <p class="text-xs text-muted-foreground">This can't be undone.</p>
    <div class="flex gap-2 justify-end pt-1">
      <button type="button" class="text-xs text-muted-foreground px-3 py-1.5" onclick={() => (confirmDelete = false)}>Cancel</button>
      <button type="button" class="text-xs bg-destructive text-destructive-foreground rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50" disabled={deleting} onclick={doDelete}>
        {#if deleting}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if} Delete
      </button>
    </div>
  </div>
{/if}
