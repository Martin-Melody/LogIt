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
  import { getWebDeps } from "$lib/deps";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { getExerciseAnalytics, type ExerciseAnalyticsResult } from "@logit/core/usecases/progression/getExerciseAnalytics";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { getExerciseStats, type ExerciseStats } from "@logit/core/usecases/progression/getExerciseStats";
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
  let activeSeries = $state<string>("");

  const analytics = $derived(analyticsResult?.output ?? null);
  const metricDefs = $derived(analyticsResult?.metricDefinitions ?? []);
  const currentSeries = $derived<AnalyticsSeries | undefined>(
    analytics?.series.find((s) => s.metricId === activeSeries),
  );
  const chartData = $derived(
    currentSeries?.points.map((p) => ({ date: new Date(p.date), value: p.value })) ?? [],
  );
  const historyNewestFirst = $derived([...history].reverse());

  const chartConfig = {
    value: { label: "Value", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  async function load(exerciseId: string, clientId: string | null) {
    loading = true;
    error = null;
    analyticsResult = null;
    try {
      const deps = getWebDeps(clientId ?? undefined);
      const found = await deps.exerciseRepo.getById(exerciseId);
      exercise = found;
      if (!found) {
        error = "Exercise not found.";
        return;
      }
      const ref = { id: found.id, name: found.name };
      const [analyticsRes, historyRes, statsRes] = await Promise.all([
        getExerciseAnalytics(ref, deps),
        getExerciseHistory(ref, deps),
        getExerciseStats(ref, deps),
      ]);
      analyticsResult = analyticsRes;
      activeSeries = analyticsRes?.output.series[0]?.metricId ?? "";
      history = historyRes.history;
      stats = statsRes;
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
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <!-- Chart + metrics -->
      <Card.Root class="xl:col-span-2">
        <Card.Header class="pb-2">
          <Card.Title>Progression</Card.Title>
        </Card.Header>
        <Card.Content class="pb-3">
          {#if !analytics}
            <p class="text-sm text-muted-foreground py-6 text-center">No history yet.</p>
          {:else}
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
        <Card.Header class="pb-2">
          <Card.Title>Session history</Card.Title>
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
                  {#each historyNewestFirst as entry (entry.sessionId)}
                    <Table.Row>
                      <Table.Cell class="align-top whitespace-nowrap tabular-nums">{formatDate(entry.performedAtMs)}</Table.Cell>
                      <Table.Cell>
                        <div class="flex flex-wrap gap-1.5">
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
