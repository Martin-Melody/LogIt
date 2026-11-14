<script lang="ts">
  import { segment, segmentTrack } from "$lib/components/ui/choice";
  import { cn } from "$lib/utils.js";
  import { curveMonotoneX } from "d3-shape";
  import { scaleUtc } from "d3-scale";
  import { AreaChart } from "layerchart";
  import * as Chart from "$lib/components/ui/chart";
  import { getExerciseAnalytics, type ExerciseAnalyticsResult } from "@logit/core/usecases/progression/getExerciseAnalytics";
  import { getExerciseProgressStory, type ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import { dismissProgressionNudge } from "@logit/core/usecases/progression/dismissProgressionNudge";
  import { acceptRepRangeExperiment } from "@logit/core/usecases/progression/acceptRepRangeExperiment";
  import type { AnalyticsSeries } from "@logit/core/domain/analytics";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import ProgressStatusChip from "./ProgressStatusChip.svelte";
  import ReasoningDialog from "$lib/components/Dialogs/ReasoningDialog.svelte";
  import TrainingBlockTagDialog from "./TrainingBlockTagDialog.svelte";

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
    (currentSeries?.points ?? [])
      .map((p) => ({ date: new Date(p.date), value: p.value }))
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
  );

  const currentDef = $derived(metricDefs.find((d) => d.id === activeSeries));

  async function refreshStory() {
    story = await getExerciseProgressStory(exercise, getProgressionDeps()).catch(() => null);
  }

  async function handleDismissNudge(nudgeId: string) {
    await dismissProgressionNudge(exercise, nudgeId, getProgressionDeps());
    await refreshStory();
  }

  async function handleAcceptNudge(nudgeId: string) {
    await acceptRepRangeExperiment(exercise, nudgeId, getProgressionDeps());
    await refreshStory();
  }

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
    void refreshStory();
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
          <div class="flex items-center gap-2">
            <ProgressStatusChip status={story.status} />
            <ReasoningDialog reasoning={story.trendReasoning} />
          </div>
          <span class="text-xs text-muted-foreground">{story.statusDetail}</span>
        </div>
        {#if story.nextTarget}
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm">
              <span class="text-muted-foreground">Next session:</span>
              <span class="font-medium">{story.nextTarget}</span>
            </p>
            {#if story.suggestionReasoning}
              <ReasoningDialog reasoning={story.suggestionReasoning} />
            {/if}
          </div>
        {/if}
        {#if story.nextNote}
          <p class="text-xs text-warning">{story.nextNote}</p>
        {/if}
        {#if story.nudge}
          <div class="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 px-2 py-1.5">
            <p class="flex-1 text-xs text-info">{story.nudge.message}</p>
            <div class="flex shrink-0 items-center gap-2">
              {#if story.nudge.actionLabel}
                <button
                  type="button"
                  class="text-xs font-medium text-info underline underline-offset-2"
                  onclick={() => handleAcceptNudge(story!.nudge!.id)}
                >
                  {story.nudge.actionLabel}
                </button>
              {/if}
              <button
                type="button"
                class="text-xs text-info underline underline-offset-2"
                onclick={() => handleDismissNudge(story!.nudge!.id)}
              >
                {story.nudge.actionLabel ? "Not now" : "Got it"}
              </button>
            </div>
          </div>
        {/if}
        {#if story.lastPr}
          <p class="text-xs text-muted-foreground">
            Last PR {story.lastPr.value} ·
            {new Date(story.lastPr.whenMs).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </p>
        {/if}
        {#if story.plateauNextSteps}
          <!-- §10.3.2 — the rep-range ladder ran out of rungs with no real
               difference. Presents the remaining hypotheses as options, not
               a decision made for the user (Martin's call). -->
          <div class="rounded-md border border-border px-2 py-1.5">
            <p class="text-xs text-muted-foreground mb-1">
              Rep-range experiments didn't find a difference here. Worth checking next:
            </p>
            <div class="flex flex-wrap gap-3">
              {#if story.plateauNextSteps.muscleGroup}
                <a href="/progress?tab=muscles" class="text-xs font-medium text-info underline underline-offset-2">
                  {story.plateauNextSteps.muscleGroup} volume/frequency
                </a>
              {/if}
              <a href="/progress?tab=nutrition" class="text-xs font-medium text-info underline underline-offset-2">
                Nutrition timing
              </a>
            </div>
          </div>
        {/if}
        <div class="flex justify-end">
          <TrainingBlockTagDialog {exercise} triggerVariant="ghost" onSaved={refreshStory} />
        </div>
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
      <div class={cn(segmentTrack, "w-full")}>
        {#each analytics.series as s (s.metricId)}
          <button
            type="button"
            class={segment(activeSeries === s.metricId)} aria-pressed={activeSeries === s.metricId}
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
          yNice={4}
          padding={{ top: 8, right: 16, bottom: 24, left: 52 }}
          series={[{ key: "value", label: currentSeries?.label ?? "", color: chartConfig.value.color }]}
          props={{
            area: {
              // Monotone: smooth, but never above / below the points it joins or
              // backwards in time. curveNatural overshot on unevenly spaced sessions,
              // looping past the first / last point and out of the plot.
              curve: curveMonotoneX,
              fillOpacity: 0.3,
              line: { class: "stroke-1" },
              motion: "tween",
            },
            // Room for the "120 kg" labels on the left and the last date on the right (both
            // were cut off), and few enough dates on a phone that they don't run together.
            xAxis: {
              format: (v: Date) =>
                v.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
              ticks: 4,
            },
            // No rotated axis title: on a phone it overlapped the tick numbers, and the
            // toggle above already names the metric. The unit rides on the ticks.
            yAxis: {
              format: (v: number) => {
                const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
                return currentDef?.unit ? `${n} ${currentDef.unit}` : n;
              },
              ticks: 4,
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
