<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { getNutritionInsights } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import type { NutritionInsightsView } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { profile } from "$lib/stores/profile.store";

  const ui = $state({ loading: true, error: null as string | null, range: 30 });
  let view = $state<NutritionInsightsView | null>(null);

  async function load() {
    ui.loading = true;
    ui.error = null;
    try {
      const fallbackKg =
        $profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null;
      view = await getNutritionInsights(getNutritionDeps(), {
        rangeDays: ui.range,
        fallbackWeightKg: fallbackKg,
      });
    } catch (e) {
      ui.error = e instanceof Error ? e.message : "Failed to load insights";
    } finally {
      ui.loading = false;
    }
  }

  function setRange(days: number) {
    ui.range = days;
    void load();
  }

  const defsById = $derived(
    Object.fromEntries((view?.plugin?.metricDefinitions ?? []).map((d) => [d.id, d])),
  );
  const kcalSeries = $derived(view?.output?.series.find((s) => s.metricId === "kcal") ?? null);

  function sparkline(points: { date: number; value: number }[]): string {
    if (points.length < 2) return "";
    const xs = points.map((p) => p.date);
    const ys = points.map((p) => p.value);
    const minX = Math.min(...xs);
    const spanX = Math.max(...xs) - minX || 1;
    const minY = Math.min(...ys);
    const spanY = Math.max(...ys) - minY || 1;
    return points
      .map((p, i) => {
        const x = 4 + ((p.date - minX) / spanX) * 312;
        const y = 4 + (1 - (p.value - minY) / spanY) * 72;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Insights</h1>
    <div class="ml-auto flex gap-1 text-xs">
      {#each [7, 30] as d (d)}
        <button
          type="button"
          class="px-2 py-1 rounded {ui.range === d ? 'bg-muted font-medium' : 'text-muted-foreground'}"
          onclick={() => setRange(d)}
        >{d}d</button>
      {/each}
    </div>
  </div>

  {#if ui.error}<p class="px-3 py-2 text-sm text-destructive">{ui.error}</p>{/if}

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else if !view?.output}
    <p class="px-3 py-6 text-sm text-muted-foreground">
      No insights plugin available. Log a few days of food and weight to get started.
    </p>
  {:else}
    {#if view.plugin}
      <p class="px-3 pt-2 text-[11px] text-muted-foreground">{view.plugin.name} · last {ui.range} days</p>
    {/if}

    <!-- Metrics -->
    <div class="grid grid-cols-2 gap-px bg-border border-y border-border mt-2">
      {#each view.output.metrics as m (m.id)}
        <div class="bg-background px-3 py-2.5">
          <div class="text-[11px] text-muted-foreground">{defsById[m.id]?.label ?? m.id}</div>
          <div class="text-sm font-semibold tabular-nums">{m.formatted ?? m.value}</div>
        </div>
      {/each}
    </div>

    <!-- Calorie trend -->
    {#if kcalSeries && kcalSeries.points.length >= 2}
      <div class="px-3 py-3 border-b border-border">
        <div class="text-xs text-muted-foreground mb-1">{kcalSeries.label}</div>
        <svg viewBox="0 0 320 80" class="w-full" role="img" aria-label="Calorie trend">
          <path d={sparkline(kcalSeries.points)} fill="none" class="stroke-primary" stroke-width="1.75" stroke-linejoin="round" />
        </svg>
      </div>
    {/if}

    <!-- Insights -->
    {#if view.output.insights?.length}
      <ul class="px-3 py-3 flex flex-col gap-2">
        {#each view.output.insights as text (text)}
          <li class="text-xs text-muted-foreground leading-relaxed">{text}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
