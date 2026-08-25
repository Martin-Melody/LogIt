<script lang="ts">
  import { curveNatural } from "d3-shape";
  import { scaleUtc } from "d3-scale";
  import { AreaChart } from "layerchart";
  import * as Card from "$lib/components/ui/card";
  import * as Chart from "$lib/components/ui/chart";
  import { getWebDeps } from "$lib/deps";
  import { viewingClient } from "$lib/viewingClient.svelte";
  import { getExercises } from "@logit/core/domain/workout";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { getProgressData, type ExerciseProgressData } from "@logit/core/usecases/progression/getProgressData";

  let loading = $state(true);
  let error = $state<string | null>(null);
  let sessions = $state<WorkoutSession[]>([]);
  let exercises = $state<ExerciseProgressData[]>([]);

  const today = new Date();
  const currentYear = today.getFullYear();

  function toKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function mondayOnOrBefore(d: Date): Date {
    const day = d.getDay();
    const diff = (day + 6) % 7;
    const m = new Date(d);
    m.setDate(d.getDate() - diff);
    m.setHours(0, 0, 0, 0);
    return m;
  }

  function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  const jan1 = new Date(currentYear, 0, 1);
  const gridStart = mondayOnOrBefore(jan1);
  const dec31 = new Date(currentYear, 11, 31);
  const gridEnd = addDays(dec31, (6 - (dec31.getDay() + 6) % 7));

  type DayCell = { date: Date; key: string; inYear: boolean; isFuture: boolean };
  const columns: DayCell[][] = [];
  {
    let cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const week: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(cursor);
        week.push({
          date,
          key: toKey(date),
          inYear: date.getFullYear() === currentYear,
          isFuture: date > today,
        });
        cursor = addDays(cursor, 1);
      }
      columns.push(week);
    }
  }

  const workedDays = $derived.by(() => {
    const keys = new Set<string>();
    for (const s of sessions) {
      if (!s.endedAtMs) continue;
      keys.add(toKey(new Date(s.endedAtMs)));
    }
    return keys;
  });

  const statsYear = $derived.by(() => {
    if (workedDays.size === 0) return { workouts: 0, currentStreak: 0 };
    const prefix = String(currentYear);
    const yearDays = [...workedDays].filter((k) => k.startsWith(prefix));
    let currentStreak = 0;
    let d = new Date(today);
    d.setHours(0, 0, 0, 0);
    while (workedDays.has(toKey(d))) {
      currentStreak++;
      d = addDays(d, -1);
    }
    return { workouts: yearDays.length, currentStreak };
  });

  // Session-level total volume (sum across all exercises trained that session),
  // for an all-exercises volume trend.
  const volumeSeries = $derived.by(() => {
    return sessions
      .filter((s) => s.endedAtMs)
      .map((s) => {
        let totalVolume = 0;
        for (const ex of getExercises(s)) {
          for (const set of ex.sets) {
            if (set.setType !== "normal" && set.setType) continue;
            totalVolume += set.weight * set.reps;
          }
        }
        return { date: new Date(s.endedAtMs!), value: totalVolume };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  });

  const personalRecords = $derived.by(() => {
    return exercises
      .map((ex) => {
        const best = ex.dataPoints.reduce((a, b) => (b.maxWeight > a.maxWeight ? b : a));
        return { exerciseName: ex.exerciseName, exerciseId: ex.exerciseId, weight: best.maxWeight, date: best.date };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
  });

  const chartConfig = {
    value: { label: "Volume", color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig;

  async function load(clientId: string | null) {
    loading = true;
    error = null;
    try {
      const deps = getWebDeps(clientId ?? undefined);
      const [allSessions, progressData] = await Promise.all([
        deps.workoutRepo.listAllSessions(),
        getProgressData(deps),
      ]);
      sessions = allSessions;
      exercises = progressData;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load(viewingClient.id);
  });
</script>

{#if loading}
  <p class="text-sm text-muted-foreground">Loading…</p>
{:else if error}
  <p class="text-sm text-destructive">{error}</p>
{:else}
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
    <!-- Stats + heatmap -->
    <Card.Root class="xl:col-span-2">
      <Card.Header class="flex flex-row items-center justify-between pb-2">
        <Card.Title>Activity — {currentYear}</Card.Title>
        <div class="flex gap-4 text-xs text-muted-foreground">
          <span><strong class="text-foreground">{statsYear.workouts}</strong> workouts</span>
          <span><strong class="text-foreground">{statsYear.currentStreak}</strong> day streak</span>
        </div>
      </Card.Header>
      <Card.Content class="pb-3">
        <div class="overflow-x-auto">
          <div class="inline-flex flex-col gap-1 min-w-max">
            <div class="flex gap-0.5 pl-5">
              {#each columns as _week, ci (ci)}
                <div class="w-3 text-[9px] text-muted-foreground leading-none"></div>
              {/each}
            </div>
            {#each [0, 1, 2, 3, 4, 5, 6] as rowIdx (rowIdx)}
              {@const dayInitial = ["M", "T", "W", "T", "F", "S", "S"][rowIdx]}
              <div class="flex items-center gap-1">
                <span class="w-4 text-[9px] text-muted-foreground text-right shrink-0 leading-none">
                  {rowIdx % 2 === 0 ? dayInitial : ""}
                </span>
                <div class="flex gap-0.5">
                  {#each columns as week, ci (ci)}
                    {@const cell = week[rowIdx]}
                    {#if cell && cell.inYear}
                      <div
                        class="w-3 h-3 rounded-[2px] {cell.isFuture ? 'bg-muted/40' : workedDays.has(cell.key) ? 'bg-primary' : 'bg-muted'}"
                        title={cell.key}
                      ></div>
                    {:else}
                      <div class="w-3 h-3"></div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Personal records -->
    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title>Personal records</Card.Title>
      </Card.Header>
      <Card.Content class="pt-0 pb-2">
        {#if personalRecords.length === 0}
          <p class="text-sm text-muted-foreground py-2">No data yet.</p>
        {:else}
          {#each personalRecords as pr (pr.exerciseId ?? pr.exerciseName)}
            <a
              href={pr.exerciseId ? `/exercises/${pr.exerciseId}` : "#"}
              class="flex items-center justify-between py-1.5 border-b last:border-0 border-border text-sm hover:text-primary"
            >
              <span class="truncate">{pr.exerciseName}</span>
              <span class="tabular-nums text-muted-foreground shrink-0 ml-2">{pr.weight}kg</span>
            </a>
          {/each}
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Volume trend -->
    <Card.Root class="xl:col-span-3">
      <Card.Header class="pb-2">
        <Card.Title>Volume — all exercises</Card.Title>
      </Card.Header>
      <Card.Content class="pb-3">
        {#if volumeSeries.length >= 2}
          <Chart.Container config={chartConfig} class="max-h-64 w-full">
            <AreaChart
              data={volumeSeries}
              x="date"
              xScale={scaleUtc()}
              series={[{ key: "value", label: "Volume", color: chartConfig.value.color }]}
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
          <p class="text-sm text-muted-foreground py-4">Not enough data to chart yet.</p>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- Exercise list -->
    <Card.Root class="xl:col-span-3">
      <Card.Header class="pb-2">
        <Card.Title>Exercises</Card.Title>
      </Card.Header>
      <Card.Content class="pt-0 pb-2">
        {#if exercises.length === 0}
          <p class="text-sm text-muted-foreground py-2">Complete at least 2 sessions with the same exercise to see it here.</p>
        {:else}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
            {#each exercises as ex (ex.exerciseId ?? ex.exerciseName)}
              <a
                href={ex.exerciseId ? `/exercises/${ex.exerciseId}` : "#"}
                class="flex items-center justify-between py-1.5 border-b border-border text-sm hover:text-primary"
              >
                <span class="truncate">{ex.exerciseName}</span>
                <span class="tabular-nums text-muted-foreground shrink-0 ml-2">{ex.dataPoints.length} sessions</span>
              </a>
            {/each}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
{/if}
