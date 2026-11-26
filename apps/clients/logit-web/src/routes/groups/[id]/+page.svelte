<!-- A group's posts on the web (design canvas F6): the Forum filtered to posts labelled with the
     group; New post picks it. The group page itself (events, board, members) is in the app for now. -->
<script lang="ts">
  import { page } from "$app/state";
  import { ApiError } from "@logit/core/api/client";
  import { photoSrc } from "@logit/core/api/photosApi";
  import { groupsApi, type GroupPreview } from "@logit/core/api/groupsApi";
  import ForumPosts from "$lib/features/social/ForumPosts.svelte";

  const id = $derived(page.params.id ?? "");
  let group = $state<GroupPreview | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    void groupsApi.about(id).then((g) => (group = g)).catch((e) => {
      error = e instanceof ApiError && e.status === 404 ? "This group's posts aren't open to you. Join it in the LogIt app." : "Couldn't load the group.";
    });
  });
</script>

<div class="mx-auto flex max-w-[760px] flex-col gap-4">
  {#if error}
    <p class="py-12 text-center text-sm text-muted-foreground">{error}</p>
  {:else if group}
    <div class="flex items-center gap-3">
      <span class="flex size-11 items-center justify-center overflow-hidden rounded-xl bg-muted text-sm font-bold">{#if group.photoUrl}<img src={photoSrc(group.photoUrl)} alt="" class="size-full object-cover" />{:else}{group.name.slice(0, 2).toUpperCase()}{/if}</span>
      <div class="flex min-w-0 flex-1 flex-col"><h1 class="truncate text-xl font-bold">{group.name}</h1><span class="text-sm text-muted-foreground">{[group.kind, group.place, `${group.members} members`].filter(Boolean).join(" · ")}</span></div>
    </div>
    {#key id}<ForumPosts filter={{ group: id }} group={{ id, name: group.name }} sorts={["active", "new"]} empty="No posts in this group yet." />{/key}
  {/if}
</div>
