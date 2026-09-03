<script lang="ts">
  import { page } from "$app/state";
  import { ArrowLeft } from "lucide-svelte";
  import ProfileView from "$lib/components/social/ProfileView.svelte";

  const username = $derived(page.params.username ?? "");
</script>

<div class="flex flex-col min-h-full">
  <header class="flex items-center gap-2 px-3 h-12 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
    <button type="button" class="p-1 -ml-1 text-muted-foreground" aria-label="Back" onclick={() => history.back()}>
      <ArrowLeft class="h-5 w-5" />
    </button>
    <span class="text-sm font-semibold truncate">@{username}</span>
  </header>

  {#key username}
    <ProfileView {username} />
  {/key}
</div>
