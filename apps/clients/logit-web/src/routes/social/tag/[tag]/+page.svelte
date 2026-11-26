<!-- A tag's page on the web (design canvas F4): forum posts with the tag (Top or New), then
     regular posts with it. Signed out, getlogit.app/t/{tag} shows the same. -->
<script lang="ts">
  import { page } from "$app/state";
  import HashIcon from "@lucide/svelte/icons/hash";
  import { normalizeTag, tagsApi, type TagInfo } from "@logit/core/api/forumApi";
  import type { ApiPost } from "@logit/core/api/socialApi";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ForumPosts from "$lib/features/social/ForumPosts.svelte";
  import PostCard from "$lib/features/social/PostCard.svelte";

  const tag = $derived(normalizeTag((page.params as { tag?: string }).tag ?? "") ?? "");
  let info = $state<TagInfo | null>(null);
  let view = $state<"forum" | "posts">("forum");
  let posts = $state<ApiPost[] | null>(null);
  let cursor = $state<string | null>(null);

  $effect(() => {
    const t = tag;
    info = null;
    posts = null;
    void tagsApi.about(t).then((i) => (info = i)).catch(() => (info = { tag: t, forumPosts: 0, posts: 0 }));
  });
  async function loadPosts(more = false) {
    const r = await tagsApi.posts(tag, more ? cursor : null).catch(() => ({ posts: [], nextCursor: null }));
    posts = more ? [...(posts ?? []), ...r.posts] : r.posts;
    cursor = r.nextCursor;
  }
  $effect(() => {
    if (view === "posts" && posts === null) void loadPosts();
  });
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
</script>

<div class="mx-auto flex max-w-[760px] flex-col gap-4">
  <div class="flex items-center gap-3.5">
    <span class="flex size-14 items-center justify-center rounded-2xl bg-muted text-sky-700 dark:text-sky-300"><HashIcon class="size-6" /></span>
    <div class="flex flex-col"><h1 class="text-2xl font-bold">#{tag}</h1><span class="text-sm text-muted-foreground">{info ? `${count(info.forumPosts, "forum post")} · ${count(info.posts, "post")}` : " "}</span></div>
  </div>
  <div role="tablist" aria-label="#{tag}" class="flex gap-1 border-b border-border">
    {#each [["forum", "Forum"], ["posts", "Posts"]] as [v, label] (v)}
      <button type="button" role="tab" aria-selected={view === v} onclick={() => (view = v as "forum" | "posts")}
        class="-mb-px h-9 border-b-2 px-3 text-[13px] {view === v ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}">{label}</button>
    {/each}
  </div>
  {#if view === "forum"}
    {#key tag}<ForumPosts filter={{ tag }} tags={[tag]} sorts={["top", "new"]} empty="No forum posts with #{tag} yet. Ask the first one." />{/key}
  {:else if posts === null}
    <Skeleton class="h-40" />
  {:else if posts.length === 0}
    <p class="py-12 text-center text-sm text-muted-foreground">No posts with #{tag} yet. Add it to a post's text and it shows here.</p>
  {:else}
    {#each posts as post (post.id)}
      <PostCard {post} onchange={(n) => (posts = n ? posts!.map((p) => (p.id === post.id ? n : p)) : posts!.filter((p) => p.id !== post.id))} />
    {/each}
    {#if cursor}<button type="button" onclick={() => loadPosts(true)} class="h-8 self-center rounded-[9px] border border-border px-3 text-xs">Show more</button>{/if}
  {/if}
</div>
