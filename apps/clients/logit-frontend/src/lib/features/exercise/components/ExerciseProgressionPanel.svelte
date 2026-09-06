<script lang="ts">
  import { curveNatural } from "d3-shape";
  import { scaleUtc } from "d3-scale";
  import { AreaChart } from "layerchart";
  import * as Chart from "$lib/components/ui/chart";
  import { getExerciseAnalytics, type ExerciseAnalyticsResult } from "@logit/core/usecases/progression/getExerciseAnalytics";
  import { getExerciseProgressStory, type ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import type { AnalyticsSeries } from "@logit/core/domain/analytics";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import ProgressStatusChip from "./ProgressStatusChip.svelte";

  const { exercise }: { exercise: { id?: string; name: string } } = $props();

  const chartConfig = {
    value: { label: "Value", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  let loading = $state(true);
  let analyticsResult = $state<ExerciseAnalyticsResult | null>(null);
  let story = $state<ExerciseProgressStory | null>(null);
  let activeSeries = $state<string>("");

  const analytics = $derived(analyticsResult?.output ?? null);
  const metricDefs = $derived(analyticsResult?.metricDefinitions ?? []);

  const currentSeries = $derived<AnalyticsSeries | undefined>(
    analytics?.series.find((s) => s.metricId === activeSeries),
  );

  const chartData = $derived(
    currentSeries?.points.map((p) => ({
      date: new Date(p.date),
      value: p.value,
    })) ?? [],
  );

  $effect(() => {
    const key = exercise.id ?? exercise.name;
    void key;
    loading = true;
    analyticsResult = null;
    story = null;
    activeSeries = "";
    const deps = getProgressionDeps();
    void getExerciseAnalytics(exercise, deps).then((result) => {
      analyticsResult = result;
      activeSeries = result?.output.series[0]?.metricId ?? "";
      loading = false;
    });
    void getExerciseProgressStory(exercise, deps).then((s) => (story = s)).catch(() => {});
  });
</script>

<div class="flex flex-col gap-4">
  {#if loading}
    <p class="text-sm text-muted-foreground py-6 text-center">Loading…</p>
  {:else if !analytics}
    <p class="text-sm text-muted-foreground py-6 text-center">No history yet — log a set to see progression.</p>
  {:else}
    <!-- Progress story — status + the actual next-session decision -->
    {#if story}
      <div class="flex flex-col gap-2 rounded-lg border border-border px-3 py-3">
        <div class="flex items-center justify-between gap-2">
          <ProgressStatusChip status={story.status} />
          <span class="text-xs text-muted-foreground">{story.statusDetail}</span>
        </div>
        {#if story.nextTarget}
          <p class="text-sm">
            <span class="text-muted-foreground">Next session:</span>
            <span class="font-medium">{story.nextTarget}</span>
          </p>
        {/if}
        {#if story.nextNote}
          <p class="text-xs text-amber-600 dark:text-amber-400">{story.nextNote}</p>
        {/if}
        {#if story.lastPr}
          <p class="text-xs text-muted-foreground">
            Last PR {story.lastPr.value} ·
            {new Date(story.lastPr.whenMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </p>
        {/if}
      </div>
    {/if}

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
</div>
