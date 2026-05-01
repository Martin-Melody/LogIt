<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import type { SplitDay } from "$lib/domain/WorkoutSplit";

  const { day = null, activeSplitId = null } = $props<{
    day?: SplitDay | null;
    activeSplitId?: string | null;
  }>();

  const blocksSorted = $derived(
    day ? [...day.blocks].sort((a, b) => a.orderIndex - b.orderIndex) : [],
  );

  function edit() {
    if (activeSplitId) void goto(`/splits/${activeSplitId}`);
    else void goto("/splits");
  }
</script>

<Card.Root class="w-full">
  <Card.Header class="flex flex-row items-start justify-between gap-4">
    <div>
      <Card.Title>Today’s plan</Card.Title>

      {#if day}
        <Card.Description>
          Day {day.orderIndex + 1}{day.name ? ` — ${day.name}` : ""}
        </Card.Description>
      {:else}
        <Card.Description>No plan yet.</Card.Description>
      {/if}
    </div>

    <Button variant="link" class="h-auto p-0 text-sm" onclick={edit}>
      Edit plan
    </Button>
  </Card.Header>

  <Card.Content class="flex flex-col gap-4">
    {#if day}
      <ul class="space-y-2">
        {#each blocksSorted.slice(0, 6) as block, i (block.id)}
          <li class="text-sm">
            <span class="text-muted-foreground">{i + 1}.</span>
            {block.type === "strength" ? block.exerciseName : block.activityName}
          </li>
        {/each}

        {#if blocksSorted.length > 6}
          <li class="text-xs text-muted-foreground">
            +{blocksSorted.length - 6} more…
          </li>
        {/if}
      </ul>
    {:else}
      <p class="text-sm text-muted-foreground">
        Add days and exercises to your split to see today’s plan here.
      </p>
    {/if}
  </Card.Content>
</Card.Root>
