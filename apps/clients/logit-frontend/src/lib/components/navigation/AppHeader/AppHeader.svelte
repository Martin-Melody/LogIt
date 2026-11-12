<script lang="ts">
  import { headerSlot } from "./headerSlot.svelte";
  import NotificationsBell from "./NotificationsBell.svelte";
</script>

{#if headerSlot.current}
  {@const Content = headerSlot.current}
  <header class="page-header bg-background">
    {@render Content()}
    <NotificationsBell />
  </header>
{/if}
