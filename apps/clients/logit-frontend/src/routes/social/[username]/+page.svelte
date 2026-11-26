<script lang="ts">
  import { MoreHorizontal } from "lucide-svelte";
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { Button } from "$lib/components/ui/button";
  import { page } from "$app/state";
  import ProfileView from "$lib/components/social/ProfileView.svelte";

  const username = $derived(page.params.username ?? "");
  let menuOpen = $state(false);
</script>

<div class="flex flex-col min-h-full">
  <PageHeader>
    <BackButton onclick={() => history.back()} />
    <h1 class="page-title">@{username}</h1>
    <Button variant="ghost" size="icon" aria-label="Share, report or block" onclick={() => (menuOpen = true)}>
      <MoreHorizontal class="h-5 w-5" />
    </Button>
  </PageHeader>

  {#key username}
    <ProfileView {username} bind:menuOpen />
  {/key}
</div>
