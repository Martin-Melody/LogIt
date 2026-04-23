<script lang="ts">
  import { onMount } from "svelte";
  import { curveNatural } from "d3-shape";
  import { scaleUtc } from "d3-scale";
  import { AreaChart } from "layerchart";
  import * as Card from "$lib/components/ui/card";
  import * as Chart from "$lib/components/ui/chart";
  import { getProgressData } from "$lib/usecases/progression/getProgressData";
  import type { ExerciseProgressData } from "$lib/usecases/progression/getProgressData";

  const chartConfig = {
    maxWeight: { label: "Max weight (kg)", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  const ui = $state({
    loading: true,
    error: null as string | null,
  });

  let exercises = $state<ExerciseProgressData[]>([]);
  let selected = $state<string | null>(null);

  const selectedExercise = $derived(
    exercises.find((e) => e.exerciseName === selected) ?? null,
  );

  const chartData = $derived(
    selectedExercise?.dataPoints.map((p) => ({
      date: new Date(p.date),
      maxWeight: p.maxWeight,
    })) ?? [],
  );

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
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

  function trendLabel(data: ExerciseProgressData): string {
    const pts = data.dataPoints;
    if (pts.length < 2) return "";
    const diff = pts[pts.length - 1].maxWeight - pts[0].maxWeight;
    if (diff === 0) return "No change";
    return `${diff > 0 ? "+" : ""}${diff}kg over ${pts.length} sessions`;
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      exercises = await getProgressData();
      if (exercises.length > 0 && !selected) {
        selected = exercises[0].exerciseName;
      }
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load progress";
    } finally {
      ui.loading = false;
    }
  }

  onMount(() => {
    void load();
  });
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
          Complete at least 2 sessions with the same exercise to see your
          progress here.
        </Card.Description>
      </Card.Header>
    </Card.Root>
  {:else}
    <!-- Detail chart -->
    {#if selectedExercise}
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title class="text-base">{selectedExercise.exerciseName}</Card.Title>
          <Card.Description>{trendLabel(selectedExercise)}</Card.Description>
        </Card.Header>

        <Card.Content>
          <Chart.Container config={chartConfig} class="max-h-48 w-full">
            <AreaChart
              data={chartData}
              x="date"
              xScale={scaleUtc()}
              series={[{ key: "maxWeight", label: "Max weight", color: chartConfig.maxWeight.color }]}
              axis="x"
              props={{
                area: {
                  curve: curveNatural,
                  fillOpacity: 0.3,
                  line: { class: "stroke-1" },
                  motion: "tween",
                },
                xAxis: {
                  format: (v: Date) =>
                    v.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
                },
              }}
            >
              {#snippet tooltip()}
                <Chart.Tooltip
                  labelFormatter={(v: Date) =>
                    v.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  indicator="line"
                />
              {/snippet}
            </AreaChart>
          </Chart.Container>

          <div class="grid grid-cols-3 gap-2 mt-4">
            <div class="text-center">
              <p class="text-lg font-semibold">
                {selectedExercise.dataPoints[selectedExercise.dataPoints.length - 1].maxWeight}kg
              </p>
              <p class="text-xs text-muted-foreground">Current</p>
            </div>
            <div class="text-center">
              <p class="text-lg font-semibold">
                {Math.max(...selectedExercise.dataPoints.map((p) => p.maxWeight))}kg
              </p>
              <p class="text-xs text-muted-foreground">Best</p>
            </div>
            <div class="text-center">
              <p class="text-lg font-semibold">{selectedExercise.dataPoints.length}</p>
              <p class="text-xs text-muted-foreground">Sessions</p>
            </div>
          </div>
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
            onclick={() => (selected = ex.exerciseName)}
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
