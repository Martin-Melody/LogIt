<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { Spinner } from "$lib/components/ui/spinner";
  import { getNutritionInsights } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import type { NutritionInsightsView } from "@logit/core/usecases/nutrition/getNutritionInsights";
  import { getOwnNutritionDeps, getOwnProfile } from "$lib/deps";

  const deps = getOwnNutritionDeps();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let range = $state(30);
  let view = $state<NutritionInsightsView | null>(null);

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
        const x = 4 + ((p.date - minX) / spanX) * 472;
        const y = 4 + (1 - (p.value - minY) / spanY) * 92;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const profile = await getOwnProfile();
      const fallbackKg = profile?.weight != null && profile.weightUnit === "kg" ? profile.weight : null;
      view = await getNutritionInsights(deps, { rangeDays: range, fallbackWeightKg: fallbackKg });
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load insights";
    } finally {
      loading = false;
    }
  }

  function setRange(days: number) {
    range = days;
    void load();
  }

  onMount(load);
</script>

<div class="flex flex-col gap-4 max-w-2xl">
  <div class="flex items-center justify-between">
    <div>
      <a href="/nutrition" class="text-xs text-muted-foreground hover:text-foreground">&larr; Nutrition</a>
      <h1 class="text-lg font-semibold mt-1">Insights</h1>
    </div>
    <div class="flex gap-1 text-xs">
      {#each [7, 30, 90] as d (d)}
        <button
          type="button"
          class="px-2 py-1 rounded {range === d ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => setRange(d)}
        >{d}d</button>
      {/each}
    </div>
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <div class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="size-4" /> Loading…</div>
  {:else if !view?.output}
    <p class="text-sm text-muted-foreground">
      No insights available yet. Log a few days of food and weight to get started.
    </p>
  {:else}
    {#if view.plugin}
      <p class="text-xs text-muted-foreground -mt-2">{view.plugin.name} · last {range} days</p>
    {/if}

    <Card.Root>
      <Card.Content class="pt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        {#each view.output.metrics as m (m.id)}
          <div>
            <div class="text-xs text-muted-foreground">{defsById[m.id]?.label ?? m.id}</div>
            <div class="text-lg font-semibold tabular-nums">{m.formatted ?? m.value}</div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>

    {#if kcalSeries && kcalSeries.points.length >= 2}
      <Card.Root>
        <Card.Header class="pb-2"><Card.Title class="text-sm">{kcalSeries.label}</Card.Title></Card.Header>
        <Card.Content class="pt-0">
          <svg viewBox="0 0 480 100" class="w-full max-h-28" role="img" aria-label="Calorie trend">
            <path d={sparkline(kcalSeries.points)} fill="none" class="stroke-primary" stroke-width="2" stroke-linejoin="round" />
          </svg>
        </Card.Content>
      </Card.Root>
    {/if}

    {#if view.output.insights?.length}
      <Card.Root>
        <Card.Header class="pb-2"><Card.Title class="text-sm">Notes</Card.Title></Card.Header>
        <Card.Content class="pt-0">
          <ul class="flex flex-col gap-2">
            {#each view.output.insights as text (text)}
              <li class="text-sm text-muted-foreground leading-relaxed">{text}</li>
            {/each}
          </ul>
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}
</div>
