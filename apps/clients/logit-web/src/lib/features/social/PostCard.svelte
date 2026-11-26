<script lang="ts">
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import ProfileHoverCard from "./ProfileHoverCard.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import RowMenuItems from "$lib/features/commands/RowMenuItems.svelte";
  import type { RowAction } from "$lib/features/commands/commands.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { toast } from "$lib/components/ui/sonner";
  import { ApiError } from "@logit/core/api/client";
  import { discoverApi, socialApi, type ApiPost, type FollowStatus } from "@logit/core/api/socialApi";
  import Avatar from "./Avatar.svelte";
  import MentionText from "./MentionText.svelte";
  import Attachment from "./Attachment.svelte";
  import AttachmentDetail from "./AttachmentDetail.svelte";
  import FollowButton from "./FollowButton.svelte";
  import QuoteDialog from "./QuoteDialog.svelte";
  import ReportDialog from "./ReportDialog.svelte";
  import { me, timeAgo } from "./socialData.svelte";

  let {
    post,
    reason = null,
    suggested = false,
    follow = false,
    onchange,
    onposted,
    full = false,
  }: {
    post: ApiPost;
    /** Why Discover picked it ("Popular this week"). */
    reason?: string | null;
    /** Shown under "You're all caught up": prefix the reason with "Suggested". */
    suggested?: boolean;
    /** Show a Follow button (posts from people you don't follow). */
    follow?: boolean;
    /** null: the post is gone from this list (deleted, author blocked, not interested). */
    onchange?: (next: ApiPost | null) => void;
    /** A quote or repost you just made, for lists that show your own posts. */
    onposted?: (created: ApiPost) => void;
    /** The post page: show everything the attachment carries, with Copy to mine. */
    full?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  let p = $state({ ...post });
  $effect(() => { p = { ...post }; });

  const self = me();
  const isOwn = $derived(self?.id === p.authorId);
  // A plain repost (no words of its own) shows the post it shares.
  const plainRepost = $derived(!!p.repostOf && !p.body);
  const shared = $derived(plainRepost ? p.repostOf! : null);
  const author = $derived(shared ?? p);
  const canRepost = $derived(!p.authorIsPrivate && !p.repostOf?.authorIsPrivate && !(shared?.unavailable));
  // A plain repost's likes and comments are the original's (the server routes them there),
  // so it opens the original and you can like it unless the original is yours.
  const link = $derived(`/social/post/${shared?.id ?? p.id}`);
  const ownContent = $derived(self?.id === author.authorId);

  let followStatus = $state<FollowStatus>("none");
  let liking = $state(false);
  let editing = $state(false);
  let draft = $state("");
  let saving = $state(false);
  let quoteOpen = $state(false);
  let reportOpen = $state(false);
  let confirmDelete = $state(false);
  let confirmBlock = $state(false);

  async function like() {
    if (liking || ownContent) return;
    liking = true;
    const was = p.isLikedByMe;
    p = { ...p, isLikedByMe: !was, likeCount: p.likeCount + (was ? -1 : 1) };
    try {
      if (was) await socialApi.unlikePost(p.id);
      else await socialApi.likePost(p.id);
      onchange?.(p);
    } catch {
      p = { ...p, isLikedByMe: was, likeCount: p.likeCount + (was ? 1 : -1) };
    } finally {
      liking = false;
    }
  }

  async function repost() {
    try {
      const created = await socialApi.repost(p.id);
      onposted?.(created);
      toast.success("Reposted to your profile");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast.info("You've already reposted this");
      else toast.error(e instanceof Error ? e.message : "Couldn't repost this");
    }
  }

  function copyLink() {
    const base = import.meta.env.VITE_MARKETING_URL || "https://getlogit.app";
    navigator.clipboard?.writeText(`${base}/p/${p.id}`).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy"),
    );
  }

  async function saveEdit() {
    if (!draft.trim() || saving) return;
    saving = true;
    try {
      p = await socialApi.editPost(p.id, draft.trim());
      onchange?.(p);
      editing = false;
    } catch {
      toast.error("Couldn't save the edit");
    } finally {
      saving = false;
    }
  }

  async function remove() {
    try {
      await socialApi.deletePost(p.id);
      onchange?.(null);
      toast.success("Post deleted");
    } catch {
      toast.error("Couldn't delete the post");
    }
  }

  async function block() {
    try {
      await socialApi.blockUser(author.authorUsername);
      onchange?.(null);
      toast.success(`Blocked @${author.authorUsername}`);
    } catch {
      toast.error("Couldn't block them");
    }
  }

  async function notInterested() {
    try {
      await discoverApi.notInterested(author.authorUsername);
      onchange?.(null);
      toast.success(`You won't see @${author.authorUsername} in Discover`, {
        action: { label: "Undo", onClick: () => void discoverApi.undoNotInterested(author.authorUsername) },
      });
    } catch {
      toast.error("Couldn't do that");
    }
  }
  // One list for the ⋯ and right-click on the post (canvas board 16).
  const actions = $derived<RowAction[]>([
    { id: "link", label: "Copy link", run: copyLink },
    ...(canRepost ? [{ id: "quote", label: "Quote", run: () => (quoteOpen = true) }] : []),
    ...(isOwn
      ? [
          ...(!plainRepost ? [{ id: "edit", label: "Edit", run: () => { draft = p.body ?? ""; editing = true; } }] : []),
          { id: "delete", label: plainRepost ? "Undo repost" : "Delete", danger: true, run: () => (confirmDelete = true) },
        ]
      : [
          ...(reason ? [{ id: "ni", label: "Not interested", run: notInterested }] : []),
          { id: "report", label: "Report post", run: () => (reportOpen = true) },
          { id: "block", label: `Block @${author.authorUsername}`, danger: true, run: () => (confirmBlock = true) },
        ]),
  ]);
</script>

<ContextMenu.Root>
<ContextMenu.Trigger>
{#snippet child({ props })}
<article {...props} class="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
  {#if reason}
    <p class="text-xs text-muted-foreground">{#if suggested}<span class="font-semibold text-foreground/80">Suggested</span>{" · "}{/if}{reason}</p>
  {/if}
  {#if plainRepost}
    <p class="text-xs text-muted-foreground">{#if isOwn}You reposted{:else}<ProfileHoverCard username={p.authorUsername} class="hover:underline">{p.authorDisplayName}</ProfileHoverCard>{" reposted"}{/if}</p>
  {/if}

  <div class="flex items-center gap-2.5">
    <a href="/social/{author.authorUsername}" class="shrink-0"><Avatar name={author.authorDisplayName} url={author.authorAvatarUrl} /></a>
    <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">
      {#if ownContent}
        <a href="/social/{author.authorUsername}" class="hover:underline">You</a>
        <span class="font-normal text-muted-foreground">{"· "}<a href={link} class="hover:underline">{timeAgo(author.createdAt)}</a>{p.editedAt && !plainRepost ? " · edited" : ""}</span>
      {:else}
        <ProfileHoverCard username={author.authorUsername} class="hover:underline">{author.authorDisplayName}</ProfileHoverCard>
        <span class="font-normal text-muted-foreground">@{author.authorUsername} · <a href={link} class="hover:underline">{timeAgo(author.createdAt)}</a>{p.editedAt && !plainRepost ? " · edited" : ""}</span>
      {/if}
    </span>
    {#if follow && !isOwn}
      <FollowButton username={author.authorUsername} bind:status={followStatus} isPrivate={!!p.authorIsPrivate} />
    {/if}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button {...props} type="button" aria-label="More" class="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><MoreHorizontalIcon class="size-4" /></button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="min-w-48"><RowMenuItems {actions} kind="dropdown" /></DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  {#if editing}
    <label for="edit-{p.id}" class="sr-only">Edit post</label>
    <textarea id="edit-{p.id}" bind:value={draft} rows="3" class="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"></textarea>
    <div class="flex justify-end gap-2">
      <button type="button" onclick={() => (editing = false)} class="h-8 rounded-[9px] border border-border px-3 text-xs">Cancel</button>
      <button type="button" disabled={!draft.trim() || saving} onclick={saveEdit} class="h-8 rounded-[9px] bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">Save</button>
    </div>
  {:else if shared}
    {#if shared.deleted}
      <p class="rounded-lg bg-muted/60 px-3.5 py-3 text-[13px] text-muted-foreground">{shared.unavailable ? "This post is unavailable." : "This post was deleted."}</p>
    {:else}
      {#if shared.body}<MentionText text={shared.body} class="text-sm leading-relaxed" />{/if}
      {#if full}
        <AttachmentDetail type={shared.type} payloadJson={shared.payloadJson} authorName={shared.authorDisplayName} isOwn={shared.authorId === self?.id} />
      {:else}
        <Attachment type={shared.type} payloadJson={shared.payloadJson} href="/social/post/{shared.id}" />
      {/if}
    {/if}
  {:else}
    {#if p.body}<MentionText text={p.body} class="{full ? 'text-[15px]' : 'text-sm'} leading-relaxed" />{/if}
    {#if full}
      <AttachmentDetail type={p.type} payloadJson={p.payloadJson} authorName={p.authorDisplayName} {isOwn} />
    {:else}
      <Attachment type={p.type} payloadJson={p.payloadJson} href={link} />
    {/if}
    {#if p.repostOf}
      {@const q = p.repostOf}
      {#if q.deleted}
        <p class="rounded-lg border border-border px-3.5 py-3 text-[13px] text-muted-foreground">{q.unavailable ? "This post is unavailable." : "This post was deleted."}</p>
      {:else}
        <a href="/social/post/{q.id}" class="flex flex-col gap-1.5 rounded-lg border border-border px-3.5 py-3 hover:bg-muted/40">
          <span class="text-xs font-semibold">{q.authorDisplayName} <span class="font-normal text-muted-foreground">@{q.authorUsername} · {timeAgo(q.createdAt)}</span></span>
          {#if q.body}<span class="line-clamp-4 text-[13px]">{q.body}</span>{/if}
          <Attachment type={q.type} payloadJson={q.payloadJson} href="/social/post/{q.id}" />
        </a>
      {/if}
    {/if}
  {/if}

  <div class="flex flex-wrap gap-x-5 text-xs text-muted-foreground">
    <button type="button" onclick={like} disabled={ownContent} aria-pressed={p.isLikedByMe}
      title={ownContent ? "You can't like your own post" : undefined}
      class="py-1.5 hover:text-foreground disabled:hover:text-muted-foreground {p.isLikedByMe ? 'font-semibold text-rose-600 dark:text-rose-300' : ''}">{p.isLikedByMe ? "Liked" : "Like"}{p.likeCount ? ` · ${p.likeCount}` : ""}</button>
    <a href={link} class="py-1.5 hover:text-foreground">Comment{p.commentCount ? ` · ${p.commentCount}` : ""}</a>
    {#if !isOwn}
      <button type="button" onclick={repost} disabled={!canRepost}
        title={canRepost ? undefined : "Posts from private accounts can't be reposted"}
        class="py-1.5 hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground">Repost</button>
    {/if}
  </div>
</article>
{/snippet}
</ContextMenu.Trigger>
<ContextMenu.Content class="min-w-48"><RowMenuItems {actions} kind="context" /></ContextMenu.Content>
</ContextMenu.Root>

<QuoteDialog bind:open={quoteOpen} post={p} {onposted} />
<ReportDialog bind:open={reportOpen} targetType="Post" targetId={p.id} what="post" />

<AlertDialog.Root bind:open={confirmDelete}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{plainRepost ? "Undo this repost?" : "Delete this post?"}</AlertDialog.Title>
      <AlertDialog.Description>{plainRepost ? "It comes off your profile and your followers' feeds." : "It's gone for everyone, with its comments and likes."}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={remove}>{plainRepost ? "Undo repost" : "Delete"}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={confirmBlock}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Block @{author.authorUsername}?</AlertDialog.Title>
      <AlertDialog.Description>You won't see each other's posts, comments or profiles, and neither of you follows the other any more. They aren't told.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={block}>Block</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
