<!-- A group's board (design canvas G4). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { boardsApi } from "@logit/core/api/boardsApi";
  import { groupsApi, type Group } from "@logit/core/api/groupsApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import BoardPage from "$lib/components/social/BoardPage.svelte";
  import { back } from "$lib/navigation";

  const id = $derived(page.params.id!);
  let group = $state<Group | null>(null);
  onMount(async () => (group = await groupsApi.get(id).catch(() => null)));
</script>

<PageHeader>
  <BackButton onclick={() => back(`/groups/${id}`)} />
  <span class="flex min-w-0 flex-col">
    <h1 class="page-title">Board</h1>
    {#if group}<span class="truncate text-[12px] text-muted-foreground">{group.name} · {group.members} {group.members === 1 ? "member" : "members"}</span>{/if}
  </span>
</PageHeader>
<div class="pb-24">
  <BoardPage load={(week) => boardsApi.group(id, week)} label="Member" empty="Nobody's on the board yet this week. It fills as members train."
    hiddenNote="You're not on this board: it's off in the group's Your settings, or Show me on boards is off in Settings › Privacy. You still see it." />
</div>
