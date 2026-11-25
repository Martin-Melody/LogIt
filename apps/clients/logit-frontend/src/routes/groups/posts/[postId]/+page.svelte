<!-- A post and its comments (design canvas Q2; Martin's notes 25 Nov), Reddit's way: every reply
     sits under the comment it answers with a line to follow; a comment shows three replies, then
     "Show N more replies"; tap a name to fold a branch; past six levels, "Continue this thread"
     (?branch=). Upvotes only. The post's ⋯: share, edit/delete (yours), report, and for
     moderators pin, lock, remove. Long-press a comment for copy, reply, delete, report. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { fade } from "svelte/transition";
  import { ChevronUp, Copy, Flag, Globe, Loader2, Lock, MessageCircle, MoreHorizontal, Pin, Send, Share2, Trash2, Unlock, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { Capacitor } from "@capacitor/core";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { groupPostsApi, postWebPath, type GroupComment, type GroupThread } from "@logit/core/api/groupPostsApi";
  import { branch, buildTree, countUnder, visibleRows } from "@logit/core/domain/commentTree";
  import { readCard } from "@logit/core/domain/messageCard";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ActionSheet from "$lib/components/ActionSheet.svelte";
  import ConfirmDialog from "$lib/components/Dialogs/ConfirmDialog.svelte";
  import ReportSheet from "$lib/components/social/ReportSheet.svelte";
  import PersonAvatar from "$lib/components/social/PersonAvatar.svelte";
  import MessageCard from "$lib/components/social/MessageCard.svelte";
  import MessagePhoto from "$lib/components/social/MessagePhoto.svelte";
  import { Textarea } from "$lib/components/ui/textarea";
  import { longpress } from "$lib/swipe";
  import { shortAgo } from "$lib/features/friends/dmTime";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.postId!);
  const branchId = $derived(page.url.searchParams.get("branch"));
  let thread = $state<GroupThread | null>(null);
  let error = $state<string | null>(null);
  let expanded = $state(new Set<string>());
  let folded = $state(new Set<string>());
  let draft = $state("");
  let replyTo = $state<GroupComment | null>(null);
  let sending = $state(false);
  let menuOpen = $state(false);
  let picked = $state<GroupComment | null>(null);
  let confirm = $state<{ kind: "post" | "comment" | "removePost" | "removeComment"; comment?: GroupComment } | null>(null);
  let reporting = $state<{ type: "GroupPost" | "GroupComment"; id: string } | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);

  async function load() {
    try {
      thread = await groupPostsApi.thread(id);
      error = null;
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This post doesn't exist, or you can't see it." : "Couldn't load the post.";
    }
  }
  onMount(load);

  const post = $derived(thread?.post ?? null);
  const roots = $derived.by(() => {
    const all = buildTree(thread?.comments ?? []);
    return branchId ? branch(all, branchId) : all;
  });
  const rows = $derived(visibleRows(roots, expanded, folded));
  const name = (c: { author: { displayName: string; username: string } | null }) => (c.author ? c.author.displayName || c.author.username : "Deleted account");

  async function votePost() {
    if (!post) return;
    const up = !post.upvoted;
    thread = { ...thread!, post: { ...post, upvoted: up, upvotes: post.upvotes + (up ? 1 : -1) } };
    await groupPostsApi.vote(post.id, up).catch(() => toast.error("Couldn't save that."));
  }

  async function voteComment(c: GroupComment) {
    const up = !c.upvoted;
    thread = { ...thread!, comments: thread!.comments.map((x) => (x.id === c.id ? { ...x, upvoted: up, upvotes: x.upvotes + (up ? 1 : -1) } : x)) };
    await groupPostsApi.voteComment(c.id, up).catch(() => toast.error("Couldn't save that."));
  }

  async function send() {
    const body = draft.trim();
    if (!body || !post) return;
    sending = true;
    try {
      const c = await groupPostsApi.comment(post.id, body, replyTo?.id ?? null);
      thread = { post: { ...post, commentCount: post.commentCount + 1 }, comments: [...thread!.comments, c] };
      if (replyTo) expanded = new Set([...expanded, replyTo.id]);
      draft = "";
      replyTo = null;
    } catch (e) {
      toast.error(e instanceof ApiError && e.status < 500 && e.message ? e.message : "Couldn't send it. Try again.");
    } finally {
      sending = false;
    }
  }

  function reply(c: GroupComment) {
    replyTo = c;
    inputEl?.focus();
  }

  const toggleFold = (cid: string) => (folded = folded.has(cid) ? new Set([...folded].filter((x) => x !== cid)) : new Set([...folded, cid]));

  async function share() {
    if (!post) return;
    const url = post.onWeb ? `https://getlogit.app${postWebPath(post.group.slug, post)}` : null;
    const text = url ? `${post.title}\n${url}` : `${post.title} · ${post.group.name} on LogIt`;
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: post.title, text });
      } else if (typeof navigator.share === "function") await navigator.share({ title: post.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied");
      }
    } catch {
      // Cancelled.
    }
  }

  async function act() {
    const c = confirm;
    confirm = null;
    if (!c || !post) return;
    try {
      if (c.kind === "post") {
        await groupPostsApi.remove(post.id);
        toast.success("Post deleted");
      } else if (c.kind === "removePost") {
        await groupPostsApi.moderate(post.id, { remove: true });
        toast.success("Post removed");
      } else if (c.comment) {
        await groupPostsApi.removeComment(c.comment.id);
        toast.success(c.kind === "comment" ? "Comment deleted" : "Comment removed");
      }
      await load();
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  async function moderate(m: { pinned?: boolean; locked?: boolean }) {
    if (!post) return;
    try {
      await groupPostsApi.moderate(post.id, m);
      await load();
      toast.success(m.pinned !== undefined ? (m.pinned ? "Pinned to the top" : "Unpinned") : m.locked ? "Comments locked" : "Comments open again");
    } catch {
      toast.error("Couldn't do that. Try again.");
    }
  }

  const postMenu = $derived(post ? [
    { icon: Share2, label: post.onWeb ? "Share the link" : "Share", onSelect: () => void share() },
    ...(post.canModerate && !post.deleted ? [
      { icon: Pin, label: post.pinned ? "Unpin" : "Pin to the top", onSelect: () => void moderate({ pinned: !post.pinned }) },
      { icon: post.locked ? Unlock : Lock, label: post.locked ? "Open comments again" : "Lock comments", onSelect: () => void moderate({ locked: !post.locked }) },
    ] : []),
    ...(post.mine && !post.deleted ? [{ icon: Trash2, label: "Delete post", destructive: true, onSelect: () => (confirm = { kind: "post" }) }] : []),
    ...(!post.mine && post.canModerate && !post.deleted ? [{ icon: Trash2, label: "Remove post", destructive: true, onSelect: () => (confirm = { kind: "removePost" }) }] : []),
    ...(!post.mine && !post.deleted ? [{ icon: Flag, label: "Report post", destructive: true, onSelect: () => (reporting = { type: "GroupPost", id: post.id }) }] : []),
  ] : []);

  const commentMenu = $derived.by(() => {
    const c = picked;
    if (!c || !post) return [];
    return [
      ...(post.canComment ? [{ icon: MessageCircle, label: "Reply", onSelect: () => reply(c) }] : []),
      { icon: Copy, label: "Copy text", onSelect: () => void navigator.clipboard?.writeText(c.body).then(() => toast.success("Copied")) },
      ...(c.mine ? [{ icon: Trash2, label: "Delete comment", destructive: true, onSelect: () => (confirm = { kind: "comment", comment: c }) }] : []),
      ...(!c.mine && post.canModerate ? [{ icon: Trash2, label: "Remove comment", destructive: true, onSelect: () => (confirm = { kind: "removeComment", comment: c }) }] : []),
      ...(!c.mine ? [{ icon: Flag, label: "Report comment", destructive: true, onSelect: () => (reporting = { type: "GroupComment", id: c.id }) }] : []),
    ];
  });
</script>

<div class="flex h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back(post ? `/groups/${post.group.id}?tab=posts` : "/messages")} />
    {#if post}<a href="/groups/{post.group.id}?tab=posts" class="min-w-0 flex-1 truncate text-[13px] text-muted-foreground no-underline">{post.group.name} · Posts</a>{:else}<span class="flex-1"></span>{/if}
    {#if post}<button type="button" aria-label="Post options" class="flex size-11 items-center justify-center text-muted-foreground" onclick={() => (menuOpen = true)}><MoreHorizontal class="size-5" /></button>{/if}
  </PageHeader>

  <div class="flex-1 overflow-y-auto pb-4">
    {#if error}
      <p class="px-6 py-14 text-center text-sm text-muted-foreground">{error}</p>
    {:else if !thread || !post}
      <div class="flex justify-center py-16"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
    {:else}
      {#if !branchId}
        <article class="flex flex-col gap-2 border-b border-border px-4 pb-3 pt-2">
          <span class="flex items-center gap-2">
            <span class="w-fit rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{post.kind}</span>
            {#if post.onWeb}<span class="flex items-center gap-1 text-[11px] text-muted-foreground"><Globe class="size-3" />On the web</span>{/if}
            {#if post.locked}<span class="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock class="size-3" />Locked</span>{/if}
          </span>
          {#if post.deleted}
            <p class="text-[15px] italic text-muted-foreground">{post.removedByModerator ? "Removed by a moderator" : "Deleted by its author"}</p>
          {:else}
            <h1 class="text-[20px] font-bold leading-tight tracking-tight">{post.title}</h1>
            <span class="flex items-center gap-2 text-[12px] text-muted-foreground">
              <PersonAvatar name={name(post)} src={post.author?.avatarUrl} size={22} />{name(post)}{post.authorRole ? ` · ${post.authorRole}` : ""}{post.authorIsMember ? "" : " · Not a member"} · {shortAgo(post.createdAtMs, Date.now())}{post.edited ? " · Edited" : ""}
            </span>
            {#if post.body}<p class="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.body}</p>{/if}
            {#if post.photoUrl}<MessagePhoto url={post.photoUrl} width={post.photoWidth} height={post.photoHeight} />{/if}
            {#if post.cardType && readCard(post.cardType, post.cardJson)}<MessageCard card={readCard(post.cardType, post.cardJson)!} mine={false} />{/if}
          {/if}
          <span class="mt-1 flex items-center gap-2">
            <button type="button" aria-pressed={post.upvoted} disabled={post.deleted} onclick={votePost}
              class="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold {post.upvoted ? 'bg-primary text-primary-foreground' : 'border border-border'}"><ChevronUp class="size-4" />{post.upvotes}</button>
            <span class="flex h-8 items-center gap-1 rounded-full border border-border px-2.5 text-[13px] font-semibold"><MessageCircle class="size-3.5" />{post.commentCount}</span>
          </span>
        </article>
      {:else}
        <a href="/groups/posts/{post.id}" class="flex min-h-11 items-center px-4 text-[13px] font-medium text-muted-foreground no-underline">← Back to all comments on "{post.title}"</a>
      {/if}

      {#each rows as row (row.type === "comment" ? row.node.comment.id : `${row.type}:${row.type === "more" ? row.parent.comment.id : row.node.comment.id}`)}
        {@const depth = row.type === "comment" ? row.node.depth : row.depth}
        <div class="relative" in:fade={{ duration: 120 }}>
          {#each Array(depth) as _, i (i)}<span class="absolute bottom-0 top-0 w-px bg-border" style="left: {16 + i * 14 + 6}px"></span>{/each}
          {#if row.type === "comment"}
            {@const c = row.node.comment}
            {@const isFolded = folded.has(c.id)}
            <div class="flex select-none gap-2 py-1.5 pr-3" style="padding-left: {16 + depth * 14}px" use:longpress={() => { if (!c.deleted) picked = c; }}>
              <button type="button" aria-label={isFolded ? "Show this branch" : "Fold this branch"} aria-expanded={!isFolded} class="shrink-0 self-start pt-0.5" onclick={() => toggleFold(c.id)}><PersonAvatar name={c.deleted ? null : name(c)} src={c.author?.avatarUrl} size={22} /></button>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <button type="button" class="flex flex-wrap items-center gap-x-1.5 text-left text-[12px]" onclick={() => toggleFold(c.id)}>
                  <span class="font-semibold">{c.deleted ? (c.removedByModerator ? "Removed" : "Deleted") : name(c)}</span>
                  {#if !c.deleted && c.authorRole}<span class="rounded border border-border px-1 text-[10px] text-muted-foreground">{c.authorRole}</span>{/if}
                  {#if !c.deleted && !c.authorIsMember}<span class="rounded border border-border px-1 text-[10px] text-muted-foreground">Not a member</span>{/if}
                  <span class="text-muted-foreground">· {shortAgo(c.createdAtMs, Date.now())}{c.edited ? " · edited" : ""}{isFolded ? ` · ${countUnder(row.node)} more` : ""}</span>
                </button>
                {#if !isFolded}
                  {#if c.deleted}
                    <span class="text-[14px] italic text-muted-foreground">{c.removedByModerator ? "Removed by a moderator" : "Deleted"}</span>
                  {:else}
                    <span class="whitespace-pre-wrap break-words text-[14px] leading-snug">{c.body}</span>
                    <span class="flex items-center gap-3 text-[12px] text-muted-foreground">
                      <button type="button" aria-pressed={c.upvoted} class="flex h-8 items-center gap-0.5 {c.upvoted ? 'font-semibold text-foreground' : ''}" onclick={() => voteComment(c)}><ChevronUp class="size-3.5" />{c.upvotes}</button>
                      {#if post.canComment}<button type="button" class="h-8" onclick={() => reply(c)}>Reply</button>{/if}
                    </span>
                  {/if}
                {/if}
              </span>
            </div>
          {:else if row.type === "more"}
            {@const parentId = row.parent.comment.id}
            <button type="button" class="min-h-10 text-left text-[13px] font-semibold" style="padding-left: {16 + depth * 14 + 30}px" onclick={() => (expanded = new Set([...expanded, parentId]))}>Show {row.hidden} more {row.hidden === 1 ? "reply" : "replies"}</button>
          {:else}
            <a href="/groups/posts/{post.id}?branch={row.node.comment.id}" class="flex min-h-10 items-center text-[13px] font-semibold text-inherit no-underline" style="padding-left: {16 + depth * 14 + 30}px">Continue this thread →</a>
          {/if}
        </div>
      {/each}
      {#if thread.comments.length === 0 && !post.deleted}<p class="px-6 py-8 text-center text-sm text-muted-foreground">No comments yet.</p>{/if}
    {/if}
  </div>

  {#if post && post.canComment}
    {#if replyTo}
      <div transition:fade={{ duration: 120 }} class="flex shrink-0 items-center gap-2 border-t border-border px-4 pt-2 text-[13px] text-muted-foreground">
        <span class="min-w-0 flex-1 truncate">Replying to {name(replyTo)}</span>
        <button type="button" aria-label="Stop replying" class="flex size-9 items-center justify-center" onclick={() => (replyTo = null)}><X class="size-4" /></button>
      </div>
    {/if}
    <form class="flex shrink-0 items-end gap-2 {replyTo ? '' : 'border-t'} border-border px-3 py-2" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <Textarea bind:ref={inputEl} bind:value={draft} rows={1} maxlength={5000} placeholder={replyTo ? "Your reply…" : "Add a comment…"} aria-label="Comment" class="max-h-32 min-h-11 flex-1 resize-none rounded-2xl" />
      <button type="submit" aria-label="Send" disabled={sending || !draft.trim()} class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Send class="size-[18px]" /></button>
    </form>
  {:else if post?.whyNot}
    <div class="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
      <span>{post.whyNot}</span>
      {#if post.whyNot.startsWith("Only members")}<button type="button" class="h-9 shrink-0 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground" onclick={() => goto(`/groups/join?id=${post!.group.id}`)}>Join</button>{/if}
    </div>
  {/if}
</div>

{#if post}
  <ActionSheet open={menuOpen} onOpenChange={(v) => (menuOpen = v)} title={post.title || "Post"} items={postMenu} />
  <ActionSheet open={!!picked} onOpenChange={(v) => { if (!v) picked = null; }} title={picked ? `${name(picked)}'s comment` : ""} items={commentMenu} />
  <ConfirmDialog open={!!confirm} onOpenChange={(v) => { if (!v) confirm = null; }}
    title={confirm?.kind === "post" ? "Delete your post?" : confirm?.kind === "removePost" ? "Remove this post?" : confirm?.kind === "comment" ? "Delete your comment?" : "Remove this comment?"}
    description={confirm?.kind === "post" || confirm?.kind === "comment" ? "Its words go for everyone; replies stay under it." : "It shows as removed by a moderator; replies stay."}
    confirmLabel={confirm?.kind === "post" || confirm?.kind === "comment" ? "Delete" : "Remove"} onConfirm={act} />
  {#if reporting}<ReportSheet open targetType={reporting.type} targetId={reporting.id} what={reporting.type === "GroupPost" ? "post" : "comment"} onclose={() => (reporting = null)} />{/if}
{/if}
