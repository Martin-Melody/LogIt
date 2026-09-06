<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import ExerciseProgressionPanel from "$lib/features/exercise/components/ExerciseProgressionPanel.svelte";
  import ProgressStatusChip from "$lib/features/exercise/components/ProgressStatusChip.svelte";
  import Sparkline from "$lib/features/exercise/components/Sparkline.svelte";
  import { getProgressData } from "@logit/core/usecases/progression/getProgressData";
  import type { ExerciseProgressData } from "@logit/core/usecases/progression/getProgressData";
  import { classifyTrend, type ProgressStatus } from "@logit/core/domain/progression";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";

  const ui = $state({ loading: true, error: null as string | null });

  let exercises = $state<ExerciseProgressData[]>([]);
  let selected = $state<string | null>(null);

  const selectedExercise = $derived(
    exercises.find((e) => e.exerciseName === selected) ?? null,
  );

  // Attention rank — stuck / declining lifts float to the top of the list.
  const STATUS_RANK: Record<ProgressStatus, number> = {
    regressing: 0, plateaued: 1, detraining: 2, progressing: 3, new: 4,
  };

  type Row = ExerciseProgressData & {
    status: ProgressStatus;
    detail: string;
    spark: number[];
    lastMs: number;
    headline: string;
  };

  const rows = $derived.by<Row[]>(() => {
    const now = Date.now();
    return exercises
      .map((ex) => {
        const spark = ex.dataPoints.map((p) => p.maxWeight);
        const lastMs = ex.dataPoints[ex.dataPoints.length - 1]?.date ?? 0;
        const t = classifyTrend({ values: spark, lastTrainedMs: lastMs, nowMs: now });
        const detail =
          t.status === "progressing"
            ? t.sessionsSincePr <= 1 ? "New best last session" : `≈ +${t.slopePctPerSession.toFixed(1)}% / session`
            : t.status === "regressing"
              ? `≈ ${t.slopePctPerSession.toFixed(1)}% / session`
              : t.status === "plateaued"
                ? `No new best in ${t.sessionsSincePr} sessions`
                : t.status === "detraining"
                  ? `${Math.round((now - lastMs) / 86_400_000)} days since`
                  : `${ex.dataPoints.length} sessions`;
        return {
          ...ex,
          status: t.status,
          detail,
          spark,
          lastMs,
          headline: `${spark[spark.length - 1]}kg`,
        };
      })
      .sort((a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.lastMs - a.lastMs,
      );
  });

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      exercises = await getProgressData(getProgressionDeps());
      if (exercises.length > 0 && !selected) selected = rows[0]?.exerciseName ?? exercises[0].exerciseName;
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
    <Card.Root><Card.Content class="pt-6"><p class="text-sm text-muted-foreground">Loading…</p></Card.Content></Card.Root>
  {:else if ui.error}
    <Card.Root><Card.Content class="pt-6"><p class="text-sm text-destructive">{ui.error}</p></Card.Content></Card.Root>
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
              <a href="/exercises/{selectedExercise.exerciseId}" class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0 pt-0.5">
                View details
              </a>
            {/if}
          </div>
        </Card.Header>
        <Card.Content>
          <ExerciseProgressionPanel exercise={{ id: selectedExercise.exerciseId, name: selectedExercise.exerciseName }} />
        </Card.Content>
      </Card.Root>
    {/if}

    <Card.Root>
      <Card.Header class="pb-2"><Card.Title>Exercises</Card.Title></Card.Header>
      <Card.Content class="pt-0">
        {#each rows as ex (ex.exerciseName)}
          {@const isSelected = selected === ex.exerciseName}
          <button
            type="button"
            class="flex items-center gap-3 w-full py-3 border-b last:border-0 border-border text-left transition-opacity {isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-100'}"
            onclick={() => (selected = ex.exerciseName)}
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{ex.exerciseName}</p>
              <div class="flex items-center gap-2 mt-1">
                <ProgressStatusChip status={ex.status} />
                <span class="text-xs text-muted-foreground truncate">{ex.detail}</span>
              </div>
            </div>
            <Sparkline values={ex.spark} class="shrink-0" />
            <span class="text-sm font-semibold tabular-nums shrink-0 w-14 text-right">{ex.headline}</span>
          </button>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
