<!-- Search, signed out (canvas S3): Top shows a few of each; the tabs show one kind. -->
<script lang="ts">
  import SearchIcon from "@lucide/svelte/icons/search";
  import ForumRow from "$lib/social/ForumRow.svelte";
  import PublicPost from "$lib/social/PublicPost.svelte";
  import GroupCard from "$lib/social/GroupCard.svelte";
  import PersonRow from "$lib/social/PersonRow.svelte";

  const { data } = $props();
  const tabs = [["top", "Top"], ["forum", "Forum"], ["posts", "Posts"], ["people", "People"], ["groups", "Groups"]] as const;
  const f = $derived(data.found);
  const n = $derived(data.tab === "top" ? 3 : 20);
  const nothing = $derived(!!f && !f.tags.length && !f.people.length && !f.groups.length && !f.forum.length && !f.posts.length);
  // The chosen tab (not Top) found nothing, though other kinds did.
  const tabEmpty = $derived(!!f && data.tab !== "top" && f[data.tab as "forum" | "posts" | "people" | "groups"].length === 0);
  const href = (t: string) => `?q=${encodeURIComponent(data.q)}${t === "top" ? "" : `&tab=${t}`}`;
</script>

<svelte:head>
  <title>{data.q ? `${data.q} · ` : ""}Search · LogIt</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<form method="GET" action="/search" role="search" class="border-b border-border px-4 py-3 sm:px-5">
  <label class="flex h-11 items-center gap-2.5 rounded-full bg-muted px-4 focus-within:ring-2 focus-within:ring-ring">
    <SearchIcon class="size-[18px] text-muted-foreground" />
    <input name="q" value={data.q} placeholder="Search people, groups, the Forum, #tags" aria-label="Search" autocomplete="off" class="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
  </label>
</form>

{#if !f}
  <p class="px-6 py-16 text-center text-sm text-muted-foreground">Search for people, groups, forum posts or a #tag, like #sligo or #deadlift.</p>
{:else}
  <nav aria-label="Results" class="flex overflow-x-auto border-b border-border">
    {#each tabs as [t, label] (t)}
      <a href={href(t)} aria-current={data.tab === t ? "page" : undefined}
        class="flex h-11 min-w-20 flex-1 items-center justify-center px-3 text-sm {data.tab === t ? 'border-b-2 border-heading font-semibold text-heading' : 'text-muted-foreground hover:text-foreground'}">{label}</a>
    {/each}
  </nav>
  {#if nothing}
    <p class="px-6 py-16 text-center text-sm text-muted-foreground">Nothing found for "{data.q}".</p>
  {/if}
  {#if data.tab === "top" && f.tags.length}
    <h2 class="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Tags</h2>
    <div class="flex flex-wrap gap-2 border-b border-border px-4 pb-4 pt-2 sm:px-5">
      {#each f.tags as t (t.tag)}<a href="/t/{encodeURIComponent(t.tag)}" class="flex h-9 items-center rounded-full border border-border px-3 text-sm text-sky-300 hover:bg-muted">#{t.tag}</a>{/each}
    </div>
  {/if}
  {#if (data.tab === "top" || data.tab === "people") && f.people.length}
    {#if data.tab === "top"}<h2 class="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">People</h2>{/if}
    <div class="flex flex-col border-b border-border py-1">{#each f.people.slice(0, n) as p (p.username)}<PersonRow person={p} api={data.api} />{/each}</div>
  {/if}
  {#if (data.tab === "top" || data.tab === "groups") && f.groups.length}
    {#if data.tab === "top"}<h2 class="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Groups</h2>{/if}
    <div class="flex flex-col border-b border-border py-1">{#each f.groups.slice(0, n) as g (g.id)}<GroupCard group={g} api={data.api} />{/each}</div>
  {/if}
  {#if (data.tab === "top" || data.tab === "forum") && f.forum.length}
    {#if data.tab === "top"}<h2 class="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Forum</h2>{/if}
    <div class="flex flex-col border-b border-border">{#each f.forum.slice(0, n) as post (post.id)}<ForumRow {post} />{/each}</div>
  {/if}
  {#if (data.tab === "top" || data.tab === "posts") && f.posts.length}
    {#if data.tab === "top"}<h2 class="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-5">Posts</h2>{/if}
    <div class="flex flex-col px-4 sm:px-5">{#each f.posts.slice(0, n) as post (post.id)}<PublicPost {post} api={data.api} showAuthor href="/@{post.authorUsername}/p/{post.id}" />{/each}</div>
  {/if}
  {#if !nothing && tabEmpty}
    <p class="px-6 py-16 text-center text-sm text-muted-foreground">No {data.tab} found for "{data.q}".</p>
  {/if}
{/if}
