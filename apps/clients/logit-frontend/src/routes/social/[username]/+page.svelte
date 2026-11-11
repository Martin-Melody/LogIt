<script lang="ts">
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { page } from "$app/state";
  import ProfileView from "$lib/components/social/ProfileView.svelte";

  const username = $derived(page.params.username ?? "");
</script>

<div class="flex flex-col min-h-full">
  <header class="page-header sticky top-0 bg-background/95 backdrop-blur z-10">
    <BackButton onclick={() => history.back()} />
    <span class="text-base font-semibold truncate">@{username}</span>
  </header>

  {#key username}
    <ProfileView {username} />
  {/key}
</div>
