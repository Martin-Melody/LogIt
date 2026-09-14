<script lang="ts">
  import { curveNatural } from "d3-shape";
  import { scaleUtc } from "d3-scale";
  import { AreaChart } from "layerchart";
  import { page } from "$app/state";
  import * as Card from "$lib/components/ui/card";
  import * as Chart from "$lib/components/ui/chart";
  import * as Table from "$lib/components/ui/table";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Alert from "$lib/components/ui/alert";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Button } from "$lib/components/ui/button";
  import { getWebDeps } from "$lib/deps";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { getExerciseAnalytics, type ExerciseAnalyticsResult } from "@logit/core/usecases/progression/getExerciseAnalytics";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { getExerciseStats, type ExerciseStats } from "@logit/core/usecases/progression/getExerciseStats";
  import { getExerciseProgressStory, type ExerciseProgressStory } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import { dismissProgressionNudge } from "@logit/core/usecases/progression/dismissProgressionNudge";
  import { acceptRepRangeExperiment } from "@logit/core/usecases/progression/acceptRepRangeExperiment";
  import ExerciseStoryPanel from "$lib/features/exercise/components/ExerciseStoryPanel.svelte";
  import { RANGE_OPTIONS, filterByRangeMonths, type RangeMonths } from "$lib/features/exercise/rangeFilter";
  import { reveal, popIn } from "$lib/transitions";
  import { fade } from "svelte/transition";
  import type { AnalyticsSeries } from "@logit/core/domain/analytics";
  import type { ExerciseHistoryEntry } from "@logit/core/domain/progression";
  import type { Exercise } from "@logit/core/domain/exercise";

  const id = $derived(page.params.id!);

  let loading = $state(true);
  let error = $state<string | null>(null);
  let exercise = $state<Exercise | null>(null);
  let analyticsResult = $state<ExerciseAnalyticsResult | null>(null);
  let history = $state<ExerciseHistoryEntry[]>([]);
  let stats = $state<ExerciseStats | null>(null);
  let story = $state<ExerciseProgressStory | null>(null);
  let activeSeries = $state<string>("");
  let range = $state<RangeMonths>(null);

  const analytics = $derived(analyticsResult?.output ?? null);
  const metricDefs = $derived(analyticsResult?.metricDefinitions ?? []);
  const currentSeries = $derived<AnalyticsSeries | undefined>(
    analytics?.series.find((s) => s.metricId === activeSeries),
  );
  const chartData = $derived(
    filterByRangeMonths(
      currentSeries?.points.map((p) => ({ date: new Date(p.date), value: p.value })) ?? [],
      range,
    ),
  );
  const historyNewestFirst = $derived([...history].reverse());

  const chartConfig = {
    value: { label: "Value", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  // Desktop-only "hand this to a physio/trainer" export — a plain CSV of the full
  // session history, not gated by the range filter above (which is display-only).
  function exportCsv() {
    if (!exercise || history.length === 0) return;
    const rows = [["Date", "Set", "Weight (kg)", "Reps", "Type", "RPE"]];
    for (const entry of history) {
      const date = new Date(entry.performedAtMs).toISOString().slice(0, 10);
      entry.sets.forEach((set, i) => {
        rows.push([date, String(i + 1), String(set.weight), String(set.reps), set.setType, set.rpe != null ? String(set.rpe) : ""]);
      });
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exercise.name.toLowerCase().replace(/\s+/g, "-")}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let exerciseRef = $state<{ id?: string; name: string } | null>(null);

  async function refreshStory() {
    if (!exerciseRef) return;
    story = await getExerciseProgressStory(exerciseRef, getWebDeps(viewingClient.id ?? undefined)).catch(() => null);
  }

  async function handleDismissNudge(nudgeId: string) {
    if (!exerciseRef) return;
    await dismissProgressionNudge(exerciseRef, nudgeId, getWebDeps(viewingClient.id ?? undefined));
    await refreshStory();
  }

  async function handleAcceptNudge(nudgeId: string) {
    if (!exerciseRef) return;
    await acceptRepRangeExperiment(exerciseRef, nudgeId, getWebDeps(viewingClient.id ?? undefined));
    await refreshStory();
  }

  async function load(exerciseId: string, clientId: string | null) {
    loading = true;
    error = null;
    analyticsResult = null;
    story = null;
    try {
      const deps = getWebDeps(clientId ?? undefined);
      const found = await deps.exerciseRepo.getById(exerciseId);
      exercise = found;
      if (!found) {
        error = "Exercise not found.";
        return;
      }
      const ref = { id: found.id, name: found.name };
      exerciseRef = ref;
      const [analyticsRes, historyRes, statsRes] = await Promise.all([
        getExerciseAnalytics(ref, deps),
        getExerciseHistory(ref, deps),
        getExerciseStats(ref, deps),
      ]);
      analyticsResult = analyticsRes;
      activeSeries = analyticsRes?.output.series[0]?.metricId ?? "";
      history = historyRes.history;
      stats = statsRes;
      void refreshStory();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load exercise";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(id, viewingClient.id);
  });
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center justify-between">
    <div>
      <a href="/" class="text-xs text-muted-foreground hover:text-foreground">&larr; Overview</a>
      <h1 class="text-lg font-semibold mt-1">{exercise?.name ?? "Exercise"}</h1>
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Skeleton class="h-72 xl:col-span-2" />
      <Skeleton class="h-72" />
      <Skeleton class="h-40 xl:col-span-3" />
    </div>
  {:else if error}
    <Alert.Root variant="destructive">
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {:else}
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4" in:fade={{ duration: 160 }}>
      <!-- Chart + metrics -->
      <Card.Root class="xl:col-span-2">
        <Card.Header class="pb-2">
          <Card.Title>Progression</Card.Title>
        </Card.Header>
        <Card.Content class="pb-3">
          {#if !analytics}
            <p class="text-sm text-muted-foreground py-6 text-center">No history yet.</p>
          {:else}
            {#if story}
              <div class="mb-4" in:reveal>
                <ExerciseStoryPanel {story} onDismissNudge={handleDismissNudge} onAcceptNudge={handleAcceptNudge} />
              </div>
            {/if}

            <div class="grid gap-2 mb-4" style="grid-template-columns: repeat({Math.min(analytics.metrics.length, 4)}, 1fr)">
              {#each analytics.metrics as metric (metric.id)}
                {@const def = metricDefs.find((d) => d.id === metric.id)}
                <div class="text-center">
                  <p class="text-base font-semibold tabular-nums">{metric.formatted ?? metric.value}</p>
                  <p class="text-xs text-muted-foreground mt-0.5">{def?.label ?? metric.id}</p>
                </div>
              {/each}
            </div>

            {#if analytics.series.length > 1}
              <Tabs.Root value={activeSeries} onValueChange={(v) => (activeSeries = v)} class="mb-3">
                <Tabs.List>
                  {#each analytics.series as s (s.metricId)}
                    <Tabs.Trigger value={s.metricId}>{s.label}</Tabs.Trigger>
                  {/each}
                </Tabs.List>
              </Tabs.Root>
            {/if}

            {#if (currentSeries?.points.length ?? 0) >= 2}
              <div class="flex justify-end gap-1 text-xs mb-1" in:reveal>
                {#each RANGE_OPTIONS as opt (opt.label)}
                  <button
                    type="button"
                    class="px-2 py-0.5 rounded {range === opt.value ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}"
                    onclick={() => (range = opt.value)}
                  >{opt.label}</button>
                {/each}
              </div>
            {/if}
            {#if chartData.length >= 2}
              <Chart.Container config={chartConfig} class="max-h-72 w-full">
                <AreaChart
                  data={chartData}
                  x="date"
                  xScale={scaleUtc()}
                  series={[{ key: "value", label: currentSeries?.label ?? "", color: chartConfig.value.color }]}
                  axis="x"
                  props={{
                    area: { curve: curveNatural, fillOpacity: 0.3, line: { class: "stroke-1" }, motion: "tween" },
                    xAxis: { format: (v: Date) => v.toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
                  }}
                >
                  {#snippet tooltip()}
                    <Chart.Tooltip
                      labelFormatter={(v: Date) => v.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      indicator="line"
                    />
                  {/snippet}
                </AreaChart>
              </Chart.Container>
            {:else}
              <p class="text-xs text-muted-foreground text-center py-4">Not enough data to chart yet.</p>
            {/if}

            {#if analytics.insights && analytics.insights.length > 0}
              <div class="flex flex-wrap gap-1.5 mt-3">
                {#each analytics.insights as insight (insight)}
                  <span class="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{insight}</span>
                {/each}
              </div>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Stats -->
      <Card.Root>
        <Card.Header class="pb-2">
          <Card.Title>Stats</Card.Title>
        </Card.Header>
        <Card.Content class="pt-0 pb-3 flex flex-col gap-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Best set</span>
            <span class="tabular-nums">{stats?.bestSet ? `${stats.bestSet.weight}kg × ${stats.bestSet.reps}` : "—"}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Sessions</span>
            <span class="tabular-nums">{stats?.totalSessions ?? 0}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Last performed</span>
            <span class="tabular-nums">{stats?.lastPerformedMs ? formatDate(stats.lastPerformedMs) : "—"}</span>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Session history table -->
      <Card.Root class="xl:col-span-3">
        <Card.Header class="pb-2 flex flex-row items-center justify-between">
          <Card.Title>Session history</Card.Title>
          {#if historyNewestFirst.length > 0}
            <Button variant="outline" size="sm" onclick={exportCsv}>Export CSV</Button>
          {/if}
        </Card.Header>
        <Card.Content class="pt-0 pb-3">
          {#if historyNewestFirst.length === 0}
            <p class="text-sm text-muted-foreground py-2">No sessions yet.</p>
          {:else}
            <div class="overflow-x-auto">
              <Table.Root class="text-sm">
                <Table.Header>
                  <Table.Row class="text-xs text-muted-foreground">
                    <Table.Head>Date</Table.Head>
                    <Table.Head>Sets</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each historyNewestFirst as entry, i (entry.sessionId)}
                    {@const delay = Math.min(i * 20, 200)}
                    <Table.Row>
                      <Table.Cell class="align-top whitespace-nowrap tabular-nums">
                        <div in:popIn={{ duration: 200, delay }}>{formatDate(entry.performedAtMs)}</div>
                      </Table.Cell>
                      <Table.Cell>
                        <div class="flex flex-wrap gap-1.5" in:popIn={{ duration: 200, delay }}>
                          {#each entry.sets as set (set.id)}
                            <span class="text-xs px-1.5 py-0.5 rounded border border-border tabular-nums {set.setType !== 'normal' ? 'text-muted-foreground' : ''}">
                              {set.weight}kg × {set.reps}
                            </span>
                          {/each}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </div>
  {/if}
</div>
