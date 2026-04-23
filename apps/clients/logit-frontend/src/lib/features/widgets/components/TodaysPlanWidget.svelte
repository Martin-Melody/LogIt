<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { getTodaySplitDay } from "$lib/domain/todaySplitDay";

  const day = $derived($activeSplit ? getTodaySplitDay($activeSplit) : null);
  const exercises = $derived(
    day ? [...day.exercises].sort((a, b) => a.orderIndex - b.orderIndex) : [],
  );

  function edit() {
    if ($activeSplit) void goto(`/splits/${$activeSplit.id}`);
    else void goto("/splits");
  }
</script>

<Card.Root data-tour="todays-plan">
  <Card.Header>
    <div class="flex items-center justify-between gap-2">
      <div>
        <Card.Title>Today's plan</Card.Title>
        {#if day}
          <Card.Description>
            Day {day.orderIndex + 1}{day.name ? ` — ${day.name}` : ""}
          </Card.Description>
        {/if}
      </div>
      <Button variant="ghost" class="h-7 px-2 text-xs shrink-0" onclick={edit}>
        Edit
      </Button>
    </div>
  </Card.Header>

  <Card.Content>
    {#if exercises.length === 0}
      <p class="text-sm text-muted-foreground">
        {#if $activeSplit}
          No exercises planned for today.
        {:else}
          Set up a split to see your plan here.
        {/if}
      </p>
    {:else}
      <ol class="flex flex-col gap-1">
        {#each exercises.slice(0, 7) as ex, i (ex.id)}
          <li class="text-sm flex items-center gap-2">
            <span class="text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
            <span>{ex.exerciseName}</span>
          </li>
        {/each}
        {#if exercises.length > 7}
          <li class="text-xs text-muted-foreground pl-6">+{exercises.length - 7} more</li>
        {/if}
      </ol>
    {/if}
  </Card.Content>
</Card.Root>
