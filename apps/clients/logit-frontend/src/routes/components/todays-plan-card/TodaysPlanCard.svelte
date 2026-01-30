<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";

  export type TodayPlan = {
    dayNumber: number;
    dayName?: string;
    exercises: { id: string; name: string }[];
  };

  const { plan = null, onEdit = () => {} } = $props<{
    plan?: TodayPlan | null;
    onEdit?: () => void | Promise<void>;
  }>();
</script>

<Card.Root class="w-full">
  <Card.Header class="flex flex-row items-start justify-between gap-4">
    <div>
      <Card.Title>Today’s plan</Card.Title>

      {#if plan}
        <Card.Description>
          Day {plan.dayNumber}{plan.dayName ? ` — ${plan.dayName}` : ""}
        </Card.Description>
      {:else}
        <Card.Description>No plan yet.</Card.Description>
      {/if}
    </div>

    <Button variant="link" class="h-auto p-0 text-sm" onclick={onEdit}>
      Edit plan
    </Button>
  </Card.Header>

  <Card.Content class="flex flex-col gap-4">
    {#if plan}
      <ul class="space-y-2">
        {#each plan.exercises.slice(0, 6) as ex, i (ex.id)}
          <li class="text-sm">
            <span class="text-muted-foreground">{i + 1}.</span>
            {ex.name}
          </li>
        {/each}

        {#if plan.exercises.length > 6}
          <li class="text-xs text-muted-foreground">
            +{plan.exercises.length - 6} more…
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
