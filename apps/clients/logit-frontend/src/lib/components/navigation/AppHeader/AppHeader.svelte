<script lang="ts">
  import { headerSlot } from "./headerSlot.svelte";
  import NotificationsBell from "./NotificationsBell.svelte";
</script>

{#if headerSlot.current}
  {@const { content: Content, bell } = headerSlot.current}
  <header class="page-header bg-background">
    {@render Content()}
    {#if bell}
      <NotificationsBell />
    {/if}
  </header>
{/if}
