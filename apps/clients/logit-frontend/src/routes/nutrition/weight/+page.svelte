<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, Trash2 } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import {
    createWeightEntry,
    localDateIso,
    type WeightEntry,
  } from "@logit/core/domain/nutrition";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushWeightEntry } from "$lib/sync/syncService";
  import { profile } from "$lib/stores/profile.store";
  import WeightTrendChart from "$lib/features/nutrition/WeightTrendChart.svelte";
  import {
    displayToKg,
    kgToDisplay,
    fmtWeight,
    latestWeight,
    type WeightUnit,
  } from "$lib/features/nutrition/nutrition";

  const ui = $state({ loading: true, value: "", dateIso: localDateIso() });
  let entries = $state<WeightEntry[]>([]);

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const trend = $derived(smoothWeightSeries(entries));

  async function load() {
    entries = await getNutritionRepo().listWeightEntries();
    const last = latestWeight(entries);
    if (last) ui.value = kgToDisplay(last.weightKg, unit).toFixed(1);
    ui.loading = false;
  }

  async function save() {
    const v = Number(ui.value);
    if (!Number.isFinite(v) || v <= 0) return;
    const repo = getNutritionRepo();
    const existingForDate = entries.find((e) => e.dateIso === ui.dateIso && !e.deletedAtMs);
    const entry: WeightEntry = existingForDate
      ? { ...existingForDate, weightKg: displayToKg(v, unit), updatedAtMs: Date.now() }
      : createWeightEntry(ui.dateIso, displayToKg(v, unit));
    await repo.saveWeightEntry(entry);
    pushWeightEntry(entry);
    await syncGoalWeightSnapshot();
    await load();
  }

  async function remove(id: string) {
    const repo = getNutritionRepo();
    await repo.deleteWeightEntry(id);
    const gone = await repo.getWeightEntry(id);
    if (!gone) {
      const tombstoned = entries.find((e) => e.id === id);
      if (tombstoned) pushWeightEntry({ ...tombstoned, deletedAtMs: Date.now(), updatedAtMs: Date.now() });
    }
    await load();
  }

  /** Keep the profile weight roughly in step so other screens show something sane. */
  async function syncGoalWeightSnapshot() {
    if ($profile.weightUnit === unit) {
      const latest = latestWeight(await getNutritionRepo().listWeightEntries());
      if (latest) {
        profile.save({ weight: Math.round(kgToDisplay(latest.weightKg, unit) * 10) / 10 });
      }
    }
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Weight</h1>
  </div>

  <div class="px-3 py-3 border-b border-border flex items-end gap-2">
    <label class="flex-1 flex flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Weight ({unit})</span>
      <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={ui.value} />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Date</span>
      <input type="date" class="bg-muted rounded px-2 py-1.5 text-sm outline-none" bind:value={ui.dateIso} max={localDateIso()} />
    </label>
    <Button size="sm" onclick={() => void save()}>Log</Button>
  </div>

  <div class="px-3 py-3 border-b border-border">
    <div class="flex items-center justify-between mb-1 text-xs">
      <span class="text-muted-foreground">Trend</span>
      <span class="tabular-nums">
        {fmtWeight(trend.currentKg, unit)}
        {#if Math.abs(trend.weeklyRateKg) >= 0.05}
          <span class="text-muted-foreground">
            · {trend.weeklyRateKg > 0 ? "+" : ""}{(unit === "lbs" ? trend.weeklyRateKg * 2.2046 : trend.weeklyRateKg).toFixed(2)}/wk
          </span>
        {/if}
      </span>
    </div>
    <WeightTrendChart trend={trend} unit={unit} />
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    <ul class="divide-y divide-border">
      {#each entries.filter((e) => !e.deletedAtMs).slice().reverse() as e (e.id)}
        <li class="flex items-center gap-2 px-3 py-2 text-sm">
          <span class="text-muted-foreground text-xs w-24">{e.dateIso}</span>
          <span class="flex-1 tabular-nums">{kgToDisplay(e.weightKg, unit).toFixed(1)} {unit}</span>
          <button type="button" class="h-6 w-6 flex items-center justify-center text-muted-foreground" onclick={() => void remove(e.id)} aria-label="Delete">
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
