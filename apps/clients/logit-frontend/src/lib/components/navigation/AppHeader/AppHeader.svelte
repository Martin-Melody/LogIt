<script lang="ts">
  import { headerSlot } from "./headerSlot.svelte";
  import NotificationsBell from "./NotificationsBell.svelte";
  import MessagesButton from "./MessagesButton.svelte";
  import SyncIndicator from "$lib/sync/SyncIndicator.svelte";
</script>

{#if headerSlot.current}
  {@const { content: Content, bell } = headerSlot.current}
  <header class="page-header relative bg-background">
    {@render Content()}
    {#if bell}
      <SyncIndicator />
      <MessagesButton />
      <NotificationsBell />
    {/if}
  </header>
{/if}
