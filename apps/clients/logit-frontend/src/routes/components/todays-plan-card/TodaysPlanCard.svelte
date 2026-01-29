<script context="module">
  export type TodayPlan = {
    dayNumber: number;
    dayName?: string; // "Push"
    exercises: { id: string; name: string }[];
  };
</script>

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";

  export let plan: TodayPlan | null = null;

  const onStart = () => {};
  export let onEdit: () => void | Promise<void> = () => {};
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
        <Card.Description>No split selected yet.</Card.Description>
      {/if}
    </div>

    {#if plan}
      <Button variant="link" class="h-auto p-0 text-sm" onclick={onEdit}>
        Edit plan
      </Button>
    {/if}
  </Card.Header>

  <Card.Content class="flex flex-col gap-4">
    {#if plan}
      <ul class="space-y-2">
        {#each plan.exercises.slice(0, 6) as ex, i (ex.id)}
          <li class="flex items-center justify-between">
            <span class="text-sm">
              <span class="text-muted-foreground">{i + 1}.</span>
              {ex.name}
            </span>
          </li>
        {/each}

        {#if plan.exercises.length > 6}
          <li class="text-xs text-muted-foreground">
            +{plan.exercises.length - 6} more…
          </li>
        {/if}
      </ul>

      <Button class="w-full" size="lg" onclick={onStart}>
        Start planned workout
      </Button>
    {:else}
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">
          Create a split to see your planned workouts here.
        </p>
        <Button class="w-full" variant="outline" onclick={onEdit}>
          Create a split
        </Button>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
