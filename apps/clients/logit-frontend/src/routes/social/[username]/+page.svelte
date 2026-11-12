<script lang="ts">
  import PageHeader from "$lib/components/navigation/PageHeader.svelte";
  import BackButton from "$lib/components/navigation/BackButton.svelte";
  import { page } from "$app/state";
  import ProfileView from "$lib/components/social/ProfileView.svelte";

  const username = $derived(page.params.username ?? "");
</script>

<div class="flex flex-col min-h-full">
  <PageHeader>
    <BackButton onclick={() => history.back()} />
    <span class="text-base font-semibold truncate">@{username}</span>
  </PageHeader>

  {#key username}
    <ProfileView {username} />
  {/key}
</div>
