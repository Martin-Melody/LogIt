<script lang="ts">
  import { onMount } from "svelte";
  import { curveNatural } from "d3-shape";
  import { scaleUtc } from "d3-scale";
  import { AreaChart } from "layerchart";
  import * as Card from "$lib/components/ui/card";
  import * as Chart from "$lib/components/ui/chart";
  import { getProgressData } from "$lib/usecases/progression/getProgressData";
  import { getExerciseAnalytics, type ExerciseAnalyticsResult } from "$lib/usecases/progression/getExerciseAnalytics";
  import type { ExerciseProgressData } from "$lib/usecases/progression/getProgressData";
  import type { AnalyticsSeries } from "$lib/domain/analytics";

  const chartConfig = {
    value: { label: "Value", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  const ui = $state({
    loading: true,
    detailLoading: false,
    error: null as string | null,
  });

  let exercises = $state<ExerciseProgressData[]>([]);
  let selected = $state<string | null>(null);
  let analyticsResult = $state<ExerciseAnalyticsResult | null>(null);
  let activeSeries = $state<string>("");

  const analytics = $derived(analyticsResult?.output ?? null);
  const metricDefs = $derived(analyticsResult?.metricDefinitions ?? []);

  const selectedExercise = $derived(
    exercises.find((e) => e.exerciseName === selected) ?? null,
  );

  const currentSeries = $derived<AnalyticsSeries | undefined>(
    analytics?.series.find((s) => s.metricId === activeSeries),
  );

  const chartData = $derived(
    currentSeries?.points.map((p) => ({
      date: new Date(p.date),
      value: p.value,
    })) ?? [],
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

  async function selectExercise(name: string) {
    selected = name;
    analyticsResult = null;
    activeSeries = "";
    ui.detailLoading = true;
    try {
      analyticsResult = await getExerciseAnalytics({ name });
      activeSeries = analyticsResult?.output.series[0]?.metricId ?? "";
    } finally {
      ui.detailLoading = false;
    }
  }

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      exercises = await getProgressData();
      if (exercises.length > 0) {
        await selectExercise(exercises[0].exerciseName);
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
            {#if analytics?.label}
              <span class="text-xs text-muted-foreground shrink-0 pt-0.5">{analytics.label}</span>
            {/if}
          </div>
        </Card.Header>

        <Card.Content class="flex flex-col gap-4">
          {#if ui.detailLoading}
            <p class="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          {:else if analytics}
            <!-- Metrics grid — rendered from whatever the algorithm returns -->
            <div class="grid gap-2" style="grid-template-columns: repeat({Math.min(analytics.metrics.length, 4)}, 1fr)">
              {#each analytics.metrics as metric (metric.id)}
                {@const def = metricDefs.find((d) => d.id === metric.id)}
                <div class="text-center">
                  <p class="text-base font-semibold tabular-nums">{metric.formatted ?? metric.value}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{def?.label ?? metric.id}</p>
                </div>
              {/each}
            </div>

            <!-- Series switcher — only shown when more than one series available -->
            {#if analytics.series.length > 1}
              <div class="flex rounded border overflow-hidden text-xs self-start">
                {#each analytics.series as s (s.metricId)}
                  <button
                    type="button"
                    class="px-3 py-1.5 transition-colors {activeSeries === s.metricId ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}"
                    onclick={() => (activeSeries = s.metricId)}
                  >
                    {s.label}
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Chart -->
            {#if chartData.length >= 2}
              <Chart.Container config={chartConfig} class="max-h-48 w-full">
                <AreaChart
                  data={chartData}
                  x="date"
                  xScale={scaleUtc()}
                  series={[{ key: "value", label: currentSeries?.label ?? "", color: chartConfig.value.color }]}
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
            {:else}
              <p class="text-xs text-muted-foreground text-center py-4">Not enough data to chart yet.</p>
            {/if}

            <!-- Insights -->
            {#if analytics.insights && analytics.insights.length > 0}
              <div class="flex flex-wrap gap-1.5">
                {#each analytics.insights as insight (insight)}
                  <span class="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{insight}</span>
                {/each}
              </div>
            {/if}
          {/if}
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
            onclick={() => void selectExercise(ex.exerciseName)}
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
