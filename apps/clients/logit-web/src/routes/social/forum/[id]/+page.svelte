<!-- A forum post on the web, signed in (design canvas Q7, F1–F6): read, upvote, comment and reply at any
     depth, as in the app. Reddit's nesting: replies under what they answer, three shown then
     "Show more", "Continue this thread" past six levels. Open to every account. -->
<script lang="ts">
  import RichText from "@logit/ui/RichText.svelte";
  import PageCrumbs from "$lib/components/PageCrumbs.svelte";
  import { page } from "$app/state";
  import ProfileHoverCard from "$lib/features/social/ProfileHoverCard.svelte";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { forumApi, type ForumComment, type ForumThread } from "@logit/core/api/forumApi";
  import { branch, buildTree, visibleRows } from "@logit/core/domain/commentTree";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ReportDialog from "$lib/features/social/ReportDialog.svelte";
  import MentionText from "$lib/features/social/MentionText.svelte";

  const id = $derived(page.params.id ?? "");
  const branchId = $derived(page.url.searchParams.get("branch"));
  let thread = $state<ForumThread | null>(null);
  let error = $state<string | null>(null);
  let draft = $state("");
  let replyTo = $state<ForumComment | null>(null);
  let replyDraft = $state("");
  let expanded = $state(new Set<string>());
  let folded = $state(new Set<string>());
  let reportOpen = $state(false);
  let report = $state<{ type: "GroupPost" | "GroupComment"; id: string; what: string }>({ type: "GroupPost", id: "", what: "post" });

  async function load() {
    try {
      thread = await forumApi.thread(id);
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This post doesn't exist, or it's in a group you can't see." : "Couldn't load the post.";
    }
  }
  $effect(() => { void id; void load(); });

  const post = $derived(thread?.post ?? null);
  const rows = $derived.by(() => {
    const all = buildTree(thread?.comments ?? []);
    return visibleRows(branchId ? branch(all, branchId) : all, expanded, folded);
  });
  const name = (c: { author: { displayName: string; username: string } | null }) => (c.author ? c.author.displayName || c.author.username : "Deleted account");
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

  async function send(body: string, parentId: string | null) {
    if (!post || !body.trim()) return;
    try {
      const c = await forumApi.comment(post.id, body.trim(), parentId);
      thread = { post: { ...post, commentCount: post.commentCount + 1 }, comments: [...thread!.comments, c] };
      if (parentId) expanded = new Set([...expanded, parentId]);
      if (parentId) { replyTo = null; replyDraft = ""; } else draft = "";
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't send it.");
    }
  }

  async function votePost() {
    if (!post) return;
    const up = !post.upvoted;
    thread = { ...thread!, post: { ...post, upvoted: up, upvotes: post.upvotes + (up ? 1 : -1) } };
    await forumApi.vote(post.id, up).catch(() => {});
  }
  async function voteComment(c: ForumComment) {
    const up = !c.upvoted;
    thread = { ...thread!, comments: thread!.comments.map((x) => (x.id === c.id ? { ...x, upvoted: up, upvotes: x.upvotes + (up ? 1 : -1) } : x)) };
    await forumApi.voteComment(c.id, up).catch(() => {});
  }
  async function removeComment(c: ForumComment) {
    await forumApi.removeComment(c.id).then(load).catch(() => toast.error("Couldn't do that."));
  }
  const toggle = (cid: string) => (folded = folded.has(cid) ? new Set([...folded].filter((x) => x !== cid)) : new Set([...folded, cid]));
</script>

<div class="mx-auto flex max-w-[760px] flex-col gap-4">
  {#if post}<PageCrumbs crumbs={[{ label: "Social", href: "/social" }, post.group ? { label: post.group.name, href: `/groups/${post.group.id}` } : { label: "Forum", href: "/social?tab=forum" }, { label: post.title }]} />{/if}
  {#if error}
    <p class="py-16 text-center text-sm text-muted-foreground">{error}</p>
  {:else if !thread || !post}
    <Skeleton class="h-64" />
  {:else}
    {#if !branchId}
      <article class="flex flex-col gap-2">
        {#if post.deleted}<p class="italic text-muted-foreground">{post.removedByModerator ? "Removed by a moderator" : "Deleted by its author"}</p>{:else}
          <h1 class="text-2xl font-bold tracking-tight">{post.title}</h1>
          <span class="text-sm text-muted-foreground">{#if post.author}<ProfileHoverCard username={post.author.username} class="font-medium text-foreground hover:underline">{name(post)}</ProfileHoverCard>{:else}{name(post)}{/if}{post.authorRole ? ` · ${post.authorRole}` : ""}{post.group && !post.authorIsMember ? " · Not a member" : ""} · {ago(post.createdAtMs)}</span>
          {#if post.body}
            <RichText text={post.body} class="text-[15px] leading-relaxed" tagHref={(t) => `/social/tag/${encodeURIComponent(t)}`}>
              {#snippet mention(u)}<ProfileHoverCard username={u} class="font-medium text-sky-700 hover:underline dark:text-sky-300">@{u}</ProfileHoverCard>{/snippet}
            </RichText>
          {/if}
          {#if post.photoUrl}<img src={photoSrc(post.photoUrl)} alt="" class="max-h-[420px] w-fit rounded-xl border border-border" />{/if}
          {#if post.tags.length}<span class="flex flex-wrap gap-x-2 text-sm">{#each post.tags as t (t)}<a href="/social/tag/{encodeURIComponent(t)}" class="text-sky-700 hover:underline dark:text-sky-300">#{t}</a>{/each}</span>{/if}
        {/if}
        <div class="flex items-center gap-2">
          <Button size="sm" variant={post.upvoted ? "default" : "outline"} onclick={votePost} disabled={post.deleted}><ChevronUpIcon class="size-4" />{post.upvotes}</Button>
          <span class="text-sm text-muted-foreground">{post.commentCount} comments</span>
          {#if !post.mine && !post.deleted}<Button size="sm" variant="ghost" class="ml-auto text-muted-foreground" onclick={() => { report = { type: "GroupPost", id: post.id, what: "post" }; reportOpen = true; }}>Report</Button>{/if}
        </div>
      </article>
      {#if post.canComment}
        <form class="flex flex-col gap-2 rounded-xl border border-border p-3" onsubmit={(e) => { e.preventDefault(); void send(draft, null); }}>
          <Textarea bind:value={draft} rows={3} maxlength={5000} placeholder="Add a comment" aria-label="Comment" />
          <Button type="submit" size="sm" class="self-end" disabled={!draft.trim()}>Comment</Button>
        </form>
      {:else if post.whyNot}<p class="text-sm text-muted-foreground">{post.whyNot}</p>{/if}
    {:else}
      <a href="/social/forum/{post.id}" class="text-sm text-muted-foreground hover:text-foreground">← All comments on "{post.title}"</a>
    {/if}

    <div class="flex flex-col">
      {#each rows as row (row.type === "comment" ? row.node.comment.id : `${row.type}:${row.type === "more" ? row.parent.comment.id : row.node.comment.id}`)}
        {@const depth = row.type === "comment" ? row.node.depth : row.depth}
        <div class="relative" style="padding-left: {depth * 20}px">
          {#each Array(depth) as _, i (i)}<span class="absolute bottom-0 top-0 w-px bg-border" style="left: {i * 20 + 8}px"></span>{/each}
          {#if row.type === "comment"}
            {@const c = row.node.comment}
            <div class="flex flex-col gap-0.5 py-2 pl-2">
              <span class="flex flex-wrap items-center text-xs">
              {#if !c.deleted && c.author}<ProfileHoverCard username={c.author.username} class="font-semibold hover:underline">{name(c)}</ProfileHoverCard>{:else}<strong class="font-semibold">{c.deleted ? "Removed" : name(c)}</strong>{/if}
              <button type="button" class="text-left" onclick={() => toggle(c.id)} aria-expanded={!folded.has(c.id)}>{#if c.authorRole}{" · "}{c.authorRole}{/if}{#if !c.deleted && post.group && !c.authorIsMember}{" · Not a member"}{/if}<span class="text-muted-foreground">{" · "}{ago(c.createdAtMs)}{folded.has(c.id) ? " · folded" : ""}</span>
              </button>
              </span>
              {#if !folded.has(c.id)}
                {#if c.deleted}<span class="text-sm italic text-muted-foreground">{c.removedByModerator ? "Removed by a moderator" : "Deleted"}</span>{:else}
                  <MentionText text={c.body} class="text-sm" />
                  <span class="flex items-center gap-3 text-xs text-muted-foreground">
                    <button type="button" aria-pressed={c.upvoted} class="flex items-center {c.upvoted ? 'font-semibold text-foreground' : ''}" onclick={() => voteComment(c)}><ChevronUpIcon class="size-3.5" />{c.upvotes}</button>
                    {#if post.canComment}<button type="button" onclick={() => { replyTo = c; replyDraft = ""; }}>Reply</button>{/if}
                    {#if c.mine || post.canModerate}<button type="button" onclick={() => removeComment(c)}>{c.mine ? "Delete" : "Remove"}</button>{/if}
                    {#if !c.mine}<button type="button" onclick={() => { report = { type: "GroupComment", id: c.id, what: "comment" }; reportOpen = true; }}>Report</button>{/if}
                  </span>
                {/if}
                {#if replyTo?.id === c.id}
                  <form class="mt-1 flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); void send(replyDraft, c.id); }}>
                    <Textarea bind:value={replyDraft} rows={2} maxlength={5000} placeholder="Your reply to {name(c)}" aria-label="Reply" />
                    <span class="flex justify-end gap-2"><Button size="sm" variant="outline" type="button" onclick={() => (replyTo = null)}>Cancel</Button><Button size="sm" type="submit" disabled={!replyDraft.trim()}>Reply</Button></span>
                  </form>
                {/if}
              {/if}
            </div>
          {:else if row.type === "more"}
            {@const pid = row.parent.comment.id}
            <button type="button" class="py-1.5 pl-2 text-left text-sm font-semibold" onclick={() => (expanded = new Set([...expanded, pid]))}>Show {row.hidden} more {row.hidden === 1 ? "reply" : "replies"}</button>
          {:else}
            <a href="/social/forum/{post.id}?branch={row.node.comment.id}" class="block py-1.5 pl-2 text-sm font-semibold">Continue this thread →</a>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
{#if report.id}<ReportDialog bind:open={reportOpen} targetType={report.type} targetId={report.id} what={report.what} />{/if}
