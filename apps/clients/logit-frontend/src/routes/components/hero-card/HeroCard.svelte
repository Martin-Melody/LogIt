<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";

  export let hasDraft = false;
  export let isOffline = false;
  export let lastSyncLabel = "Last sync: 2 days ago";
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title>Ready to train?</Card.Title>
    <Card.Description>Log your workout in seconds.</Card.Description>
  </Card.Header>

  <Card.Content class="flex flex-col gap-3">
    <Button size="lg" class="w-full">Start Workout</Button>

    {#if hasDraft}
      <Button variant="outline" class="w-full">Continue last workout</Button>
    {/if}
  </Card.Content>

  <Card.Footer class="pt-2">
    <p class="text-xs text-muted-foreground">
      {#if isOffline}
        Offline • {lastSyncLabel}
      {:else}
        Synced • {lastSyncLabel}
      {/if}
    </p>
  </Card.Footer>
</Card.Root>
