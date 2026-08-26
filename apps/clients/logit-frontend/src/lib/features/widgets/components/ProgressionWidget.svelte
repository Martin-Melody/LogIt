<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { getProgressionRepo } from "$lib/data/repoProvider";
  import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import type { ProgressionOutput } from "@logit/core/domain/progression";
  import type { ExerciseProgressionState } from "@logit/core/domain/progression";

  type Row = ExerciseProgressionState & { output: ProgressionOutput | null };

  let rows = $state<Row[]>([]);
  let loading = $state(true);

  onMount(async () => {
    const repo = getProgressionRepo();
    const states = await repo.listExerciseStates();
    const sorted = [...states].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 4);

    const resolved = await Promise.all(
      sorted.map(async (s) => {
        const output = await getSuggestion({ id: s.exerciseId, name: s.exerciseName }, getProgressionDeps()).catch(() => null);
        return { ...s, output };
      }),
    );

    rows = resolved;
    loading = false;
  });

  function formatTarget(output: ProgressionOutput): string {
    const first = output.sets[0];
    if (!first) return output.label ?? "—";

    const repsStr = Array.isArray(first.reps)
      ? `${first.reps[0]}–${first.reps[1]}`
      : String(first.reps);

    return `${output.sets.length}×${repsStr} @ ${first.weight}kg`;
  }
</script>

<Card.Root>
  <Card.Header>
    <div class="flex items-center justify-between gap-2">
      <Card.Title>Progression</Card.Title>
      <Button variant="ghost" class="h-7 px-2 text-xs shrink-0" onclick={() => void goto("/progress")}>
        Details
      </Button>
    </div>
  </Card.Header>

  <Card.Content>
    {#if loading}
      <p class="text-sm text-muted-foreground">Loading…</p>
    {:else if rows.length === 0}
      <p class="text-sm text-muted-foreground">
        Complete a session and enable an algorithm in Profile to see targets here.
      </p>
    {:else}
      <ul class="flex flex-col divide-y divide-border">
        {#each rows as row (row.key)}
          <li class="py-2 flex items-center justify-between gap-2">
            <span class="text-sm truncate">{row.exerciseName}</span>
            <span class="text-xs text-muted-foreground shrink-0">
              {row.output ? formatTarget(row.output) : "—"}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
