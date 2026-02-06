<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";

  const {
    hasDraft = false,
    hasPlan = false,
    isOffline = false,
    lastSyncLabel = "Last sync: never",
    showPrimaryStart = true,
    onStart = () => {},
    onStartUnplanned = undefined,
    onContinue = () => {},
  } = $props<{
    hasDraft?: boolean;
    hasPlan?: boolean;
    isOffline?: boolean;
    lastSyncLabel?: string;
    showPrimaryStart?: boolean;

    onStart?: () => void | Promise<void>;

    onStartUnplanned?: (() => void | Promise<void>) | undefined;

    onContinue?: () => void | Promise<void>;
  }>();
</script>

<Card.Root class="w-full">
  <Card.Header>
    <Card.Title
      >{hasDraft ? "Workout in progress" : "Ready to train?"}</Card.Title
    >

    <Card.Description>
      {#if hasDraft}
        Pick up where you left off.
      {:else if hasPlan}
        Start today’s planned session from your split.
      {:else}
        Log your workout in seconds.
      {/if}
    </Card.Description>
  </Card.Header>

  <Card.Content class="flex flex-col gap-3">
    {#if showPrimaryStart}
      <Button size="lg" class="w-full" onclick={() => void onStart()}>
        {#if hasDraft}
          Start new workout
        {:else if hasPlan}
          Start planned workout
        {:else}
          Start workout
        {/if}
      </Button>
    {/if}

    {#if !hasDraft && hasPlan && onStartUnplanned}
      <Button
        variant="outline"
        class="w-full"
        onclick={() => void onStartUnplanned()}
      >
        Start unplanned instead
      </Button>
    {/if}

    {#if hasDraft}
      <Button
        variant="outline"
        class="w-full"
        onclick={() => void onContinue()}
      >
        Continue last workout
      </Button>
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
