<!-- A group's Posts tab (design canvas Q1): Active / New / Top, New post, and the list. -->
<script lang="ts">
  import { Loader2, PenSquare } from "lucide-svelte";
  import { groupPostsApi, type GroupPost, type PostSort } from "@logit/core/api/groupPostsApi";
  import type { PostsGroup } from "@logit/core/api/groupsApi";
  import { chip } from "$lib/components/ui/choice";
  import PostRow from "./PostRow.svelte";
  import NewPostSheet from "./NewPostSheet.svelte";

  const { group }: { group: PostsGroup } = $props();
  let sort = $state<PostSort>("active");
  let posts = $state<GroupPost[] | null>(null);
  let more = $state(false);
  let writing = $state(false);
  const who = $derived(group.posts?.whoCanPost ?? "Members");
  const canPost = $derived(who === "Staff" ? !!group.me && group.me.role !== "Member" : who === "Anyone" || !!group.me);

  async function load(reset = true) {
    const page = await groupPostsApi.list(group.id, sort, reset ? 0 : (posts?.length ?? 0)).catch(() => []);
    posts = reset ? page : [...(posts ?? []), ...page];
    more = page.length === 30;
  }
  $effect(() => {
    void sort;
    void load();
  });
</script>

<div class="flex items-center gap-2 px-4 py-2.5">
  {#each [["active", "Active"], ["new", "New"], ["top", "Top"]] as [v, label] (v)}
    <button type="button" class={chip(sort === v)} aria-pressed={sort === v} onclick={() => (sort = v as PostSort)}>{label}</button>
  {/each}
  <span class="flex-1"></span>
  {#if canPost}<button type="button" class="flex h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground" onclick={() => (writing = true)}><PenSquare class="size-4" />New post</button>{/if}
</div>
{#if posts === null}
  <div class="flex justify-center py-10"><Loader2 class="size-5 animate-spin text-muted-foreground" /></div>
{:else if posts.length === 0}
  <p class="px-6 py-10 text-center text-sm text-muted-foreground">No posts yet. Ask a question, share a form check, or post what's on.</p>
{:else}
  <div class="border-t border-border">{#each posts as p (p.id)}<PostRow post={p} />{/each}</div>
  {#if more}<button type="button" class="mx-auto my-3 h-10 rounded-full border border-border px-4 text-[13px] font-medium" onclick={() => load(false)}>More posts</button>{/if}
{/if}

{#if writing}<NewPostSheet {group} onclose={() => (writing = false)} onposted={() => { sort = "new"; void load(); }} />{/if}
