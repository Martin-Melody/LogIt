<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import ExerciseProgressionPanel from "$lib/features/exercise/components/ExerciseProgressionPanel.svelte";
  import { getProgressData } from "$lib/usecases/progression/getProgressData";
  import type { ExerciseProgressData } from "$lib/usecases/progression/getProgressData";

  const ui = $state({
    loading: true,
    error: null as string | null,
  });

  let exercises = $state<ExerciseProgressData[]>([]);
  let selected = $state<string | null>(null);

  const selectedExercise = $derived(
    exercises.find((e) => e.exerciseName === selected) ?? null,
  );

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function trend(data: ExerciseProgressData): "up" | "down" | "flat" {
    const pts = data.dataPoints;
    if (pts.length < 2) return "flat";
    const first = pts[0].maxWeight;
    const last = pts[pts.length - 1].maxWeight;
    if (last > first) return "up";
    if (last < first) return "down";
    return "flat";
  }

  function selectExercise(name: string) {
    selected = name;
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      exercises = await getProgressData();
      if (exercises.length > 0) {
        selectExercise(exercises[0].exerciseName);
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load progress";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => { void load(); });
</script>

<div class="p-3 flex flex-col gap-3 pb-32">
  {#if ui.loading}
    <Card.Root>
      <Card.Content class="pt-6">
        <p class="text-sm text-muted-foreground">Loading…</p>
      </Card.Content>
    </Card.Root>

  {:else if ui.error}
    <Card.Root>
      <Card.Content class="pt-6">
        <p class="text-sm text-destructive">{ui.error}</p>
      </Card.Content>
    </Card.Root>

  {:else if exercises.length === 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>Progress</Card.Title>
        <Card.Description>
          Complete at least 2 sessions with the same exercise to see your progress here.
        </Card.Description>
      </Card.Header>
    </Card.Root>

  {:else}
    <!-- Detail panel -->
    {#if selectedExercise}
      <Card.Root>
        <Card.Header class="pb-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <Card.Title class="text-base truncate">{selectedExercise.exerciseName}</Card.Title>
              <Card.Description>
                Last trained {formatDate(selectedExercise.dataPoints[selectedExercise.dataPoints.length - 1].date)}
              </Card.Description>
            </div>
            {#if selectedExercise.exerciseId}
              <a
                href="/exercises/{selectedExercise.exerciseId}"
                class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0 pt-0.5"
              >
                View details
              </a>
            {/if}
          </div>
        </Card.Header>

        <Card.Content>
          <ExerciseProgressionPanel
            exercise={{ id: selectedExercise.exerciseId, name: selectedExercise.exerciseName }}
          />
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Exercise list -->
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>Exercises</Card.Title>
      </Card.Header>
      <Card.Content class="pt-0">
        {#each exercises as ex (ex.exerciseName)}
          {@const t = trend(ex)}
          {@const isSelected = selected === ex.exerciseName}
          <button
            type="button"
            class="flex items-center justify-between w-full py-3 border-b last:border-0 border-border text-left transition-opacity {isSelected ? 'opacity-100' : 'opacity-60'}"
            onclick={() => selectExercise(ex.exerciseName)}
          >
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{ex.exerciseName}</p>
              <p class="text-xs text-muted-foreground">
                {ex.dataPoints[ex.dataPoints.length - 1].maxWeight}kg · {ex.dataPoints.length} sessions
              </p>
            </div>
            <span class="text-xs shrink-0 ml-3 {t === 'up' ? 'text-chart-1' : t === 'down' ? 'text-destructive' : 'text-muted-foreground'}">
              {#if t === "up"}↑{:else if t === "down"}↓{:else}—{/if}
              {formatDate(ex.dataPoints[ex.dataPoints.length - 1].date)}
            </span>
          </button>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
