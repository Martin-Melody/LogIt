<!-- Forum posts on the web (design canvas F2, F4–F6): the Forum, one group's posts, one tag's or
     one person's, with sort buttons and New post (title, text, #tags, the group when there is one). -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
  import PinIcon from "@lucide/svelte/icons/pin";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { forumApi, MAX_TAGS, normalizeTag, SUGGESTED_TAGS, type ForumPost, type PostSort } from "@logit/core/api/forumApi";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";

  const {
    filter = {},
    group = null,
    tags: presetTags = [],
    sorts = ["active", "new", "top"],
    canPost = true,
    empty = "No posts yet.",
    top,
  }: {
    filter?: { group?: string; tag?: string; user?: string };
    group?: { id: string; name: string } | null;
    tags?: string[];
    sorts?: PostSort[];
    canPost?: boolean;
    empty?: string;
    top?: Snippet;
  } = $props();
  const labels: Record<PostSort, string> = { active: "Active", new: "New", top: "Top" };
  // svelte-ignore state_referenced_locally (a starting value)
  let sort = $state<PostSort>(sorts[0]!);
  let posts = $state<ForumPost[] | null>(null);
  let error = $state<string | null>(null);
  let more = $state(false);
  let writing = $state(false);
  let title = $state("");
  let body = $state("");
  // svelte-ignore state_referenced_locally (a starting value)
  let tagText = $state(presetTags.map((t) => `#${t}`).join(" "));
  let posting = $state(false);
  const tags = $derived([...new Set(tagText.split(/[\s,]+/).map(normalizeTag).filter((t): t is string => !!t))].slice(0, MAX_TAGS));

  async function load(reset = true) {
    try {
      const page = await forumApi.list({ ...filter, sort, skip: reset ? 0 : (posts?.length ?? 0) });
      posts = reset ? page : [...(posts ?? []), ...page];
      more = page.length === 30;
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "These posts aren't open to you." : "Couldn't load the posts.";
    }
  }
  $effect(() => {
    void sort;
    void load();
  });

  async function post() {
    posting = true;
    try {
      const p = await forumApi.create({ title: title.trim(), body: body.trim(), tags, groupId: group?.id ?? null });
      await goto(`/social/forum/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't post it. Try again.");
    } finally {
      posting = false;
    }
  }
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-2">
    <div class="flex gap-2" role="tablist" aria-label="Sort">
      {#each sorts as v (v)}
        <button type="button" role="tab" aria-selected={sort === v} onclick={() => (sort = v)} class="h-8 rounded-full px-3 text-[13px] {sort === v ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border'}">{labels[v]}</button>
      {/each}
    </div>
    {#if canPost}<Button class="ml-auto" onclick={() => (writing = !writing)}>New post</Button>{/if}
  </div>
  {#if writing}
    <form class="flex flex-col gap-3 rounded-xl border border-border p-4" onsubmit={(e) => { e.preventDefault(); void post(); }}>
      {#if group}<span class="text-sm text-muted-foreground">In {group.name}</span>{/if}
      <Input bind:value={title} maxlength={200} placeholder="Title" aria-label="Title" />
      <Textarea bind:value={body} rows={4} maxlength={10000} placeholder="Say more (optional)" aria-label="Post" />
      <Input bind:value={tagText} placeholder="#tags, e.g. #sligo #deadlift" aria-label="Tags" />
      <div class="flex flex-wrap items-center gap-1.5 text-[13px]">
        {#each tags as t (t)}<span class="rounded-full bg-muted px-2.5 py-0.5 text-sky-700 dark:text-sky-300">#{t}</span>{/each}
        {#each SUGGESTED_TAGS.filter((t) => !tags.includes(t)) as t (t)}
          <button type="button" class="rounded-full border border-dashed border-border px-2.5 py-0.5 text-muted-foreground" onclick={() => (tagText = `${tagText} #${t}`.trim())}>+ #{t}</button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">Anyone can read this, in LogIt and on getlogit.app, and find it by its tags.</p>
      <div class="flex justify-end gap-2"><Button variant="outline" type="button" onclick={() => (writing = false)}>Cancel</Button><Button type="submit" disabled={posting || !title.trim()}>Post</Button></div>
    </form>
  {/if}
  {@render top?.()}
  {#if error}
    <p class="py-12 text-center text-sm text-muted-foreground">{error}</p>
  {:else if !posts}
    <Skeleton class="h-40" />
  {:else if posts.length === 0}
    <p class="py-12 text-center text-sm text-muted-foreground">{empty}</p>
  {:else}
    <div class="overflow-hidden rounded-xl border border-border">
      {#each posts as p (p.id)}
        <a href="/social/forum/{p.id}" class="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40">
          {#if p.pinned || (p.group && !filter.group)}
            <span class="flex items-center gap-2 text-[11px] text-muted-foreground">{#if p.pinned}<PinIcon class="size-3" />Pinned{/if}{#if p.group && !filter.group}<span class="rounded border border-border px-1.5 py-0.5">{p.group.name}</span>{/if}</span>
          {/if}
          <span class="text-[15px] font-semibold">{p.deleted ? "Removed" : p.title}</span>
          {#if p.body}<span class="line-clamp-2 text-sm text-muted-foreground">{p.body}</span>{/if}
          {#if p.tags.length}<span class="text-[13px] text-sky-700 dark:text-sky-300">{p.tags.map((t) => `#${t}`).join(" ")}</span>{/if}
          <span class="flex items-center gap-3 text-xs text-muted-foreground"><span class="flex items-center gap-0.5"><ChevronUpIcon class="size-3.5" />{p.upvotes}</span><span class="flex items-center gap-1"><MessageCircleIcon class="size-3.5" />{p.commentCount}</span><span class="ml-auto">{p.author?.displayName || p.author?.username || "Deleted account"} · {ago(p.lastActivityAtMs)}</span></span>
        </a>
      {/each}
    </div>
    {#if more}<button type="button" onclick={() => load(false)} class="h-8 self-center rounded-[9px] border border-border px-3 text-xs">Show more</button>{/if}
  {/if}
</div>
