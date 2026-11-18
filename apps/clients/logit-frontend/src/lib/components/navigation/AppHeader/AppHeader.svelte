<script lang="ts">
  import { headerSlot } from "./headerSlot.svelte";
  import NotificationsBell from "./NotificationsBell.svelte";
  import SyncIndicator from "$lib/sync/SyncIndicator.svelte";
</script>

{#if headerSlot.current}
  {@const { content: Content, bell } = headerSlot.current}
  <header class="page-header bg-background">
    {@render Content()}
    {#if bell}
      <SyncIndicator />
      <NotificationsBell />
    {/if}
  </header>
{/if}
