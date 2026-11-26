<!-- A group's posts on the web (design canvas Q1, Q7): Active / New / Top and New post. Open to
     every account; the group page itself (events, board, members) is in the app for now. -->
<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
  import PinIcon from "@lucide/svelte/icons/pin";
  import { toast } from "svelte-sonner";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { DEFAULT_POST_KINDS, groupPostsApi, type GroupPost, type PostSort } from "@logit/core/api/groupPostsApi";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";

  const id = $derived(page.params.id ?? "");
  let sort = $state<PostSort>("active");
  let posts = $state<GroupPost[] | null>(null);
  let error = $state<string | null>(null);
  let writing = $state(false);
  let title = $state("");
  let body = $state("");
  let kind = $state("Question");
  let kinds = $state<string[]>(DEFAULT_POST_KINDS);
  let posting = $state(false);
  const group = $derived(posts?.[0]?.group ?? null);

  $effect(() => {
    const g = id;
    void sort;
    groupPostsApi.list(g, sort).then((p) => (posts = p)).catch((e) => {
      error = e instanceof ApiError && e.status === 404 ? "This group's posts aren't open to you. Join it in the LogIt app." : "Couldn't load the posts.";
    });
    groupPostsApi.kinds(g).then((k) => (kinds = k)).catch(() => {});
  });

  async function post() {
    posting = true;
    try {
      const p = await groupPostsApi.create(id, { title: title.trim(), body: body.trim(), kind });
      await goto(`/groups/posts/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : "Couldn't post it. Try again.");
    } finally {
      posting = false;
    }
  }
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
</script>

<div class="mx-auto flex max-w-[760px] flex-col gap-4">
  <div class="flex items-center gap-3">
    {#if group}
      <span class="flex size-11 items-center justify-center overflow-hidden rounded-xl bg-muted text-sm font-bold">{#if group.photoUrl}<img src={photoSrc(group.photoUrl)} alt="" class="size-full object-cover" />{:else}{group.name.slice(0, 2).toUpperCase()}{/if}</span>
      <div class="flex min-w-0 flex-1 flex-col"><h1 class="truncate text-xl font-bold">{group.name}</h1><span class="text-sm text-muted-foreground">{[group.kind, group.place, `${group.members} members`].filter(Boolean).join(" · ")}</span></div>
    {:else}<h1 class="flex-1 text-xl font-bold">Posts</h1>{/if}
    <Button onclick={() => (writing = !writing)}>New post</Button>
  </div>
  {#if writing}
    <form class="flex flex-col gap-3 rounded-xl border border-border p-4" onsubmit={(e) => { e.preventDefault(); void post(); }}>
      <Input bind:value={title} maxlength={200} placeholder="Title" aria-label="Title" />
      <Textarea bind:value={body} rows={4} maxlength={10000} placeholder="Say more (optional)" aria-label="Post" />
      <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Kind">
        {#each kinds as k (k)}<button type="button" role="radio" aria-checked={kind === k} onclick={() => (kind = k)} class="h-8 rounded-full px-3 text-[13px] {kind === k ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border'}">{k}</button>{/each}
        <Input value={kinds.includes(kind) ? "" : kind} oninput={(e) => (kind = (e.currentTarget as HTMLInputElement).value || "Question")} maxlength={30} placeholder="Or your own" aria-label="Your own kind" class="h-8 w-40" />
      </div>
      <div class="flex justify-end gap-2"><Button variant="outline" type="button" onclick={() => (writing = false)}>Cancel</Button><Button type="submit" disabled={posting || !title.trim()}>Post</Button></div>
    </form>
  {/if}
  <div class="flex gap-2" role="tablist" aria-label="Sort">
    {#each [["active", "Active"], ["new", "New"], ["top", "Top"]] as [v, l] (v)}
      <button type="button" role="tab" aria-selected={sort === v} onclick={() => (sort = v as PostSort)} class="h-8 rounded-full px-3 text-[13px] {sort === v ? 'bg-primary font-semibold text-primary-foreground' : 'border border-border'}">{l}</button>
    {/each}
  </div>
  {#if error}
    <p class="py-12 text-center text-sm text-muted-foreground">{error}</p>
  {:else if !posts}
    <Skeleton class="h-40" />
  {:else if posts.length === 0}
    <p class="py-12 text-center text-sm text-muted-foreground">No posts yet.</p>
  {:else}
    <div class="overflow-hidden rounded-xl border border-border">
      {#each posts as p (p.id)}
        <a href="/groups/posts/{p.id}" class="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40">
          <span class="flex items-center gap-2 text-[11px] text-muted-foreground">{#if p.pinned}<PinIcon class="size-3" />Pinned ·{/if}<span class="rounded bg-muted px-1.5 py-0.5 font-semibold">{p.kind}</span></span>
          <span class="text-[15px] font-semibold">{p.deleted ? "Removed" : p.title}</span>
          {#if p.body}<span class="line-clamp-2 text-sm text-muted-foreground">{p.body}</span>{/if}
          <span class="flex items-center gap-3 text-xs text-muted-foreground"><span class="flex items-center gap-0.5"><ChevronUpIcon class="size-3.5" />{p.upvotes}</span><span class="flex items-center gap-1"><MessageCircleIcon class="size-3.5" />{p.commentCount}</span><span class="ml-auto">{p.author?.displayName ?? "Deleted account"} · {ago(p.lastActivityAtMs)}</span></span>
        </a>
      {/each}
    </div>
  {/if}
</div>
