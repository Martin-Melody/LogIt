<!-- A list of forum posts (design canvas F2, F4–F6): the Forum, one group's posts, one tag's or one
     person's. Sort chips, New post, and the rows; `skip` pages on. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import type { Snippet } from "svelte";
  import { PenSquare } from "lucide-svelte";
  import { forumApi, type ForumPost, type PostSort } from "@logit/core/api/forumApi";
  import { chip } from "$lib/components/ui/choice";
  import PostRow from "./PostRow.svelte";
  import NewPostSheet from "./NewPostSheet.svelte";

  const {
    filter = {},
    group = null,
    tags = [],
    sorts = ["active", "new", "top"],
    canPost = true,
    empty = "No posts yet. Ask a question, share a form check, or post what's on.",
    top,
  }: {
    filter?: { group?: string; tag?: string; user?: string };
    /** New post picks this group (F6). */
    group?: { id: string; name: string; access?: import("@logit/core/api/groupsApi").GroupAccess } | null;
    /** New post starts with these tags (a tag's page). */
    tags?: string[];
    sorts?: PostSort[];
    canPost?: boolean;
    empty?: string;
    /** Under the sort row (the Forum's trending tags). */
    top?: Snippet;
  } = $props();
  const labels: Record<PostSort, string> = { active: "Active", new: "New", top: "Top" };
  // svelte-ignore state_referenced_locally (a starting value)
  let sort = $state<PostSort>(sorts[0]!);
  let posts = $state<ForumPost[] | null>(null);
  let more = $state(false);
  let writing = $state(false);

  async function load(reset = true) {
    const page = await forumApi.list({ ...filter, sort, skip: reset ? 0 : (posts?.length ?? 0) }).catch(() => []);
    posts = reset ? page : [...(posts ?? []), ...page];
    more = page.length === 30;
  }
  $effect(() => {
    void sort;
    void load();
  });
</script>

<div class="flex items-center gap-2 px-4 py-2.5">
  {#each sorts as v (v)}
    <button type="button" class={chip(sort === v)} aria-pressed={sort === v} onclick={() => (sort = v)}>{labels[v]}</button>
  {/each}
  <span class="flex-1"></span>
  {#if canPost}<button type="button" class="flex h-11 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground" onclick={() => (writing = true)}><PenSquare class="size-4" />New post</button>{/if}
</div>
{@render top?.()}
{#if posts === null}
  <div class="flex justify-center py-10"><Spinner class="size-5 text-muted-foreground" /></div>
{:else if posts.length === 0}
  <p class="px-6 py-10 text-center text-sm text-muted-foreground">{empty}</p>
{:else}
  <div class="border-t border-border">{#each posts as p (p.id)}<PostRow post={p} showGroup={!filter.group} />{/each}</div>
  {#if more}<button type="button" class="mx-auto my-3 flex h-11 items-center rounded-full border border-border px-4 text-[13px] font-medium" onclick={() => load(false)}>More posts</button>{/if}
{/if}

{#if writing}<NewPostSheet {group} {tags} onclose={() => (writing = false)} />{/if}
