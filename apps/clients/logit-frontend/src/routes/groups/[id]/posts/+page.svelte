<!-- A group's posts seen from outside (canvas F6): the Forum filtered to posts labelled with the
     group, New post picks it, and Join at the top. Members go to their Posts tab. -->
<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  
  import { ApiError } from "@logit/core/api/client";
  import { groupsApi, type GroupPreview } from "@logit/core/api/groupsApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import GroupAvatar from "$lib/components/social/GroupAvatar.svelte";
  import ForumList from "$lib/components/social/ForumList.svelte";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id ?? "");
  let preview = $state<GroupPreview | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      preview = await groupsApi.about(id);
      if (preview.member) await goto(`/groups/${id}?tab=posts`, { replaceState: true });
      else if (preview.access === "InviteOnly") error = "This group's posts are for members only.";
    } catch (e) {
      error = e instanceof ApiError && e.status === 404 ? "This group's posts are for members only." : "Couldn't load the posts. Try again in a moment.";
    }
  });
</script>

<div class="flex h-full flex-col">
  <PageHeader>
    <BackButton onclick={() => back("/social")} />
    <span class="flex-1"></span>
  </PageHeader>
  <div class="flex-1 overflow-y-auto pb-6">
    {#if error}
      <p class="px-6 py-14 text-center text-sm text-muted-foreground">{error}</p>
    {:else if !preview || preview.member}
      <div class="flex justify-center py-16"><Spinner class="size-5 text-muted-foreground" /></div>
    {:else}
      <div class="flex items-center gap-3 px-4 pb-2 pt-1">
        <GroupAvatar name={preview.name} src={preview.photoUrl} size={48} />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[17px] font-semibold">{preview.name}</span>
          <span class="truncate text-[13px] text-muted-foreground">{[preview.kind, preview.place, `${preview.members} ${preview.members === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}</span>
        </span>
        <a href="/groups/join?id={preview.id}" class="flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-[13px] font-semibold text-inherit no-underline">{preview.requested ? "Requested" : preview.access === "Request" ? "Ask to join" : "Join"}</a>
      </div>
      <ForumList filter={{ group: preview.id }} group={{ id: preview.id, name: preview.name, access: preview.access }} sorts={["active", "new"]} />
    {/if}
  </div>
</div>
