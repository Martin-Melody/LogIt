<!-- The friends board (design canvas B2): you and the people you follow who follow you back. -->
<script lang="ts">
  import { boardsApi } from "@logit/core/api/boardsApi";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import BoardPage from "$lib/components/social/BoardPage.svelte";
  import { back } from "$lib/navigation";
</script>

<PageHeader>
  <BackButton onclick={() => back("/social")} />
  <span class="flex min-w-0 flex-col">
    <h1 class="page-title">Friends board</h1>
    <span class="truncate text-[12px] text-muted-foreground">People you follow who follow you back</span>
  </span>
</PageHeader>
<div class="pb-24">
  <BoardPage load={(week) => boardsApi.friends(week)} label="Friend" empty="No friends on it yet this week. Friends are people you follow who follow you back."
    hiddenNote="You're not on the boards: Show me on boards is off in Settings › Privacy. You still see them." />
</div>
