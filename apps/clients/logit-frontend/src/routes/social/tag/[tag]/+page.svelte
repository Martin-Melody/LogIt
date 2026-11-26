<!-- A tag's page (design canvas F4): forum posts with the tag (Top or New), then regular posts with
     it. Also on the web at getlogit.app/t/{tag}. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { page } from "$app/state";
  import { Hash, Share2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { Capacitor } from "@capacitor/core";
  import { normalizeTag, tagsApi, type TagInfo } from "@logit/core/api/forumApi";
  import type { ApiPost } from "@logit/core/api/socialApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import ForumList from "$lib/components/social/ForumList.svelte";
  import PostCard from "$lib/components/social/PostCard.svelte";
  import CommentSheet from "$lib/components/CommentSheet.svelte";
  import { back } from "$lib/navigation";

  const tag = $derived(normalizeTag((page.params as { tag?: string }).tag ?? "") ?? "");
  let info = $state<TagInfo | null>(null);
  let view = $state<"forum" | "posts">("forum");
  let posts = $state<ApiPost[] | null>(null);
  let cursor = $state<string | null>(null);
  let loadingMore = $state(false);
  let commentPost = $state<ApiPost | null>(null);

  $effect(() => {
    const t = tag;
    info = null;
    posts = null;
    void tagsApi.about(t).then((i) => (info = i)).catch(() => (info = { tag: t, forumPosts: 0, posts: 0 }));
  });

  async function loadPosts(more = false) {
    loadingMore = more;
    try {
      const r = await tagsApi.posts(tag, more ? cursor : null);
      posts = more ? [...(posts ?? []), ...r.posts] : r.posts;
      cursor = r.nextCursor;
    } catch {
      posts ??= [];
    } finally {
      loadingMore = false;
    }
  }
  $effect(() => {
    if (view === "posts" && posts === null) void loadPosts();
  });

  async function share() {
    const text = `#${tag} on LogIt\nhttps://getlogit.app/t/${encodeURIComponent(tag)}`;
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ title: `#${tag}`, text });
      } else if (typeof navigator.share === "function") await navigator.share({ title: `#${tag}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied");
      }
    } catch {
      // Cancelled.
    }
  }
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
</script>

<div class="flex min-h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back("/social?tab=forum")} />
    <span class="flex-1"></span>
    <button type="button" aria-label="Share" class="flex size-11 items-center justify-center text-muted-foreground" onclick={share}><Share2 class="size-5" /></button>
  </PageHeader>

  <div class="flex items-center gap-3.5 px-4 pb-3 pt-1">
    <span class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-sky-700 dark:text-sky-300"><Hash class="size-7" /></span>
    <span class="flex min-w-0 flex-col gap-0.5">
      <h1 class="truncate text-[22px] font-bold">#{tag}</h1>
      <span class="text-[13px] text-muted-foreground">{info ? `${count(info.forumPosts, "forum post")} · ${count(info.posts, "post")}` : " "}</span>
    </span>
  </div>

  <div role="tablist" aria-label="#{tag}" class="mx-4 flex border-b border-border">
    {#each [["forum", "Forum"], ["posts", "Posts"]] as [v, label] (v)}
      <button type="button" role="tab" aria-selected={view === v} class="h-11 flex-1 text-[14px] {view === v ? 'border-b-2 border-foreground font-semibold' : 'font-medium text-muted-foreground'}" onclick={() => (view = v as "forum" | "posts")}>{label}</button>
    {/each}
  </div>

  {#if view === "forum"}
    {#key tag}<ForumList filter={{ tag }} tags={[tag]} sorts={["top", "new"]} empty="No forum posts with #{tag} yet. Ask the first one." />{/key}
  {:else if posts === null}
    <div class="flex justify-center py-10"><Spinner class="size-5 text-muted-foreground" /></div>
  {:else if posts.length === 0}
    <p class="px-6 py-10 text-center text-sm text-muted-foreground">No posts with #{tag} yet. Add it to a post's text and it shows here.</p>
  {:else}
    <div class="divide-y divide-border">
      {#each posts as post (post.id)}
        <PostCard {post} onopencomments={(p) => (commentPost = p)} onchange={(next) => (posts = next ? posts!.map((p) => (p.id === post.id ? next : p)) : posts!.filter((p) => p.id !== post.id))} />
      {/each}
    </div>
    {#if cursor}<button type="button" disabled={loadingMore} class="mx-auto my-3 flex h-11 items-center rounded-full border border-border px-4 text-[13px] font-medium" onclick={() => loadPosts(true)}>More posts</button>{/if}
  {/if}
</div>

<CommentSheet post={commentPost} onclose={() => (commentPost = null)}
  oncommentcountchange={(id, delta) => (posts = (posts ?? []).map((p) => (p.id === id ? { ...p, commentCount: p.commentCount + delta } : p)))} />
