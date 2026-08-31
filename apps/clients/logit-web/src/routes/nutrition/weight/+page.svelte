<script lang="ts">
  import { onMount } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { createWeightEntry, localDateIso, type WeightEntry } from "@logit/core/domain/nutrition";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import { getOwnNutritionDeps, getOwnProfile } from "$lib/deps";
  import WeightTrendChart from "$lib/components/nutrition/WeightTrendChart.svelte";
  import { displayToKg, kgToDisplay, fmtWeight, type WeightUnit } from "$lib/nutrition";

  const repo = getOwnNutritionDeps().nutritionRepo;

  let loading = $state(true);
  let error = $state<string | null>(null);
  let entries = $state<WeightEntry[]>([]);
  let unit = $state<WeightUnit>("kg");
  let value = $state("");
  let dateIso = $state(localDateIso());

  const live = $derived(entries.filter((e) => !e.deletedAtMs).slice().sort((a, b) => a.dateIso.localeCompare(b.dateIso)));
  const trend = $derived(smoothWeightSeries(entries));

  async function load() {
    loading = true;
    error = null;
    try {
      const [list, profile] = await Promise.all([repo.listWeightEntries(), getOwnProfile()]);
      unit = (profile?.weightUnit ?? "kg") as WeightUnit;
      entries = list;
      const last = [...live].pop();
      if (last) value = kgToDisplay(last.weightKg, unit).toFixed(1);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  async function save() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return;
    const existing = entries.find((e) => e.dateIso === dateIso && !e.deletedAtMs);
    const entry: WeightEntry = existing
      ? { ...existing, weightKg: displayToKg(v, unit), updatedAtMs: Date.now() }
      : createWeightEntry(dateIso, displayToKg(v, unit));
    try {
      await repo.saveWeightEntry(entry);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    }
  }

  async function remove(id: string) {
    try {
      await repo.deleteWeightEntry(id);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete";
    }
  }

  onMount(load);
</script>

<div class="flex flex-col gap-4 max-w-2xl">
  <div>
    <a href="/nutrition" class="text-xs text-muted-foreground hover:text-foreground">&larr; Nutrition</a>
    <h1 class="text-lg font-semibold mt-1">Weight</h1>
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <div class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="size-4" /> Loading…</div>
  {:else}
    <Card.Root>
      <Card.Content class="pt-4 flex items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Weight ({unit})</span>
          <input class="h-8 w-28 rounded border border-border bg-background px-2 text-sm" inputmode="decimal" bind:value={value} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Date</span>
          <input type="date" max={localDateIso()} class="h-8 rounded border border-border bg-background px-2 text-sm" bind:value={dateIso} />
        </label>
        <Button size="sm" class="h-8" onclick={save}>Log</Button>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2 flex-row items-center justify-between">
        <Card.Title class="text-sm">Trend</Card.Title>
        <span class="text-xs tabular-nums">
          {fmtWeight(trend.currentKg, unit)}
          {#if Math.abs(trend.weeklyRateKg) >= 0.05}
            <span class="text-muted-foreground">
              · {trend.weeklyRateKg > 0 ? "+" : ""}{(unit === "lbs" ? trend.weeklyRateKg * 2.2046 : trend.weeklyRateKg).toFixed(2)} {unit}/wk
            </span>
          {/if}
        </span>
      </Card.Header>
      <Card.Content class="pt-0">
        <WeightTrendChart trend={trend} unit={unit} />
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2"><Card.Title class="text-sm">History</Card.Title></Card.Header>
      <Card.Content class="pt-0">
        {#if live.length === 0}
          <p class="text-sm text-muted-foreground">No entries yet.</p>
        {:else}
          <ul class="flex flex-col divide-y divide-border text-sm">
            {#each [...live].reverse() as e (e.id)}
              <li class="flex items-center gap-2 py-1.5">
                <span class="text-muted-foreground text-xs w-24 tabular-nums">{e.dateIso}</span>
                <span class="flex-1 tabular-nums">{kgToDisplay(e.weightKg, unit).toFixed(1)} {unit}</span>
                <button type="button" class="text-xs text-destructive" onclick={() => remove(e.id)}>Delete</button>
              </li>
            {/each}
          </ul>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
