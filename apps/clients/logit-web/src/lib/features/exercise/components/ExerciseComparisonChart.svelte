<script lang="ts">
  // Desktop-only depth: overlay several exercises' progression on one chart.
  // Different exercises have wildly different absolute weights (a 60kg bench vs
  // a 140kg deadlift), so raw values would make the overlay unreadable — each
  // series is normalized to "% change from its first point in range" instead,
  // indexed to 0 at the start. Uses layerchart's per-series `data` override
  // (one independent {date,value} array per series) rather than resampling
  // everyone onto a shared date grid, since exercises are rarely trained on
  // the same days.
  import { scaleUtc } from "d3-scale";
  import { curveNatural } from "d3-shape";
  import { LineChart } from "layerchart";
  import * as Chart from "$lib/components/ui/chart";
  import { getExerciseAnalytics } from "@logit/core/usecases/progression/getExerciseAnalytics";
  import { pickPrimarySeries } from "@logit/core/usecases/progression/getExerciseProgressStory";
  import type { AnalyticsDataPoint } from "@logit/core/domain/analytics";
  import { getWebDeps } from "$lib/deps";
  import { RANGE_OPTIONS, filterByRangeMonths, type RangeMonths } from "../rangeFilter";
  import { popIn } from "$lib/transitions";

  const { exercises, clientId }: { exercises: { id?: string; name: string }[]; clientId?: string } = $props();

  const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  let loading = $state(true);
  let range = $state<RangeMonths>(null);
  let seriesByExercise = $state<{ name: string; points: AnalyticsDataPoint[] }[]>([]);

  async function load(list: { id?: string; name: string }[]) {
    loading = true;
    const deps = getWebDeps(clientId);
    const results = await Promise.all(
      list.map(async (ex) => {
        const analytics = await getExerciseAnalytics(ex, deps).catch(() => null);
        const primary = analytics ? pickPrimarySeries(analytics.output.series) : undefined;
        return { name: ex.name, points: primary?.points ?? [] };
      }),
    );
    seriesByExercise = results;
    loading = false;
  }

  $effect(() => {
    void load(exercises);
  });

  // Each series independently: filter to range, then index to 0% at its own
  // first point in that range — comparing *rate of change*, not absolute level.
  const normalized = $derived(
    seriesByExercise.map((s, i) => {
      const dated = s.points.map((p) => ({ date: new Date(p.date), value: p.value }));
      const windowed = filterByRangeMonths(dated, range);
      const base = windowed[0]?.value;
      const data = base
        ? windowed.map((p) => ({ date: p.date, value: Math.round(((p.value - base) / base) * 1000) / 10 }))
        : [];
      return { key: `s${i}`, name: s.name, data, color: COLORS[i % COLORS.length] };
    }),
  );

  const hasEnoughData = $derived(normalized.some((s) => s.data.length >= 2));

  const chartConfig = $derived(
    Object.fromEntries(normalized.map((s) => [s.key, { label: s.name, color: s.color }])),
  );
</script>

{#if loading}
  <p class="text-sm text-muted-foreground py-6 text-center">Loading…</p>
{:else if !hasEnoughData}
  <p class="text-sm text-muted-foreground py-6 text-center">Not enough overlapping history to compare yet.</p>
{:else}
  <div class="flex flex-col gap-2" in:popIn={{ duration: 200 }}>
    <div class="flex items-center justify-between">
      <div class="flex flex-wrap gap-3">
        {#each normalized as s (s.key)}
          <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span class="size-2 rounded-full" style="background-color: {s.color}"></span>
            {s.name}
          </span>
        {/each}
      </div>
      <div class="flex gap-1 text-xs">
        {#each RANGE_OPTIONS as opt (opt.label)}
          <button
            type="button"
            class="px-2 py-0.5 rounded {range === opt.value ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => (range = opt.value)}
          >{opt.label}</button>
        {/each}
      </div>
    </div>

    <Chart.Container config={chartConfig} class="max-h-64 w-full">
      <LineChart
        data={[]}
        x="date"
        y="value"
        xScale={scaleUtc()}
        series={normalized.filter((s) => s.data.length >= 2).map((s) => ({
          key: s.key,
          label: s.name,
          color: s.color,
          data: s.data,
        }))}
        props={{
          spline: { curve: curveNatural, motion: "tween" },
          xAxis: { format: (v: Date) => v.toLocaleDateString(undefined, { day: "numeric", month: "short" }) },
          yAxis: { format: (v: number) => `${v >= 0 ? "+" : ""}${v}%`, ticks: 4 },
        }}
      >
        {#snippet tooltip()}
          <Chart.Tooltip
            labelFormatter={(v: Date) => v.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            indicator="line"
          />
        {/snippet}
      </LineChart>
    </Chart.Container>
    <p class="text-xs text-muted-foreground">
      % change from each exercise's own first session in range — not absolute weight, since exercises differ wildly in load.
    </p>
  </div>
{/if}
