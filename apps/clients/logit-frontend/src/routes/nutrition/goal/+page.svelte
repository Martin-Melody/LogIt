<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import {
    defaultNutritionGoal,
    touchGoal,
    type ActivityLevel,
    type GoalType,
    type NutritionGoal,
    type Sex,
  } from "@logit/core/domain/nutrition";
  import { computeTargets } from "@logit/core/nutrition/targets";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { pushNutritionGoal } from "$lib/sync/syncService";
  import { profile } from "$lib/stores/profile.store";
  import {
    displayToKg,
    kgToDisplay,
    fmtKcal,
    fmtGrams,
    type WeightUnit,
  } from "$lib/features/nutrition/nutrition";

  const ACTIVITY: { value: ActivityLevel; label: string }[] = [
    { value: "sedentary", label: "Sedentary — desk job, little exercise" },
    { value: "light", label: "Light — 1–3 workouts/week" },
    { value: "moderate", label: "Moderate — 3–5 workouts/week" },
    { value: "very", label: "Very active — 6–7 workouts/week" },
    { value: "extra", label: "Extra — hard training or physical job" },
  ];

  const ui = $state({ loading: true, saved: false });
  let goal = $state<NutritionGoal>(defaultNutritionGoal());
  let currentWeightKg = $state<number | null>(null);

  const weightUnit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const heightUnit = $derived(($profile.heightUnit ?? "cm") as "cm" | "in");

  // Rate is edited in display units; stored as kg/week.
  let rateDisplay = $state("0.5");
  let targetWeightDisplay = $state("");
  let heightDisplay = $state("");

  const preview = $derived.by(() => {
    const g: NutritionGoal = {
      ...goal,
      heightCm: heightUnit === "in" ? (Number(heightDisplay) || 0) * 2.54 : Number(heightDisplay) || undefined,
      targetRateKgPerWeek:
        goal.goalType === "maintain" ? 0 : displayToKg(Number(rateDisplay) || 0, weightUnit),
      targetWeightKg: targetWeightDisplay ? displayToKg(Number(targetWeightDisplay), weightUnit) : undefined,
    };
    return computeTargets(g, { weightKg: currentWeightKg ?? undefined });
  });

  async function load() {
    const repo = getNutritionRepo();
    const [existing, weights] = await Promise.all([repo.getGoal(), repo.listWeightEntries()]);
    const trend = smoothWeightSeries(weights);
    currentWeightKg =
      trend.currentKg ?? ($profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null);

    if (existing) {
      goal = existing;
      if (goal.goalType !== "maintain") rateDisplay = String(kgToDisplay(goal.targetRateKgPerWeek, weightUnit).toFixed(2));
      if (goal.targetWeightKg) targetWeightDisplay = String(kgToDisplay(goal.targetWeightKg, weightUnit).toFixed(1));
      if (goal.heightCm) heightDisplay = String(heightUnit === "in" ? (goal.heightCm / 2.54).toFixed(1) : Math.round(goal.heightCm));
    } else if ($profile.height != null && $profile.heightUnit === heightUnit) {
      heightDisplay = String($profile.height);
    }
    ui.loading = false;
  }

  async function save() {
    const next = touchGoal({
      ...goal,
      heightCm: heightDisplay
        ? heightUnit === "in"
          ? Number(heightDisplay) * 2.54
          : Number(heightDisplay)
        : undefined,
      targetRateKgPerWeek:
        goal.goalType === "maintain" ? 0 : Math.abs(displayToKg(Number(rateDisplay) || 0, weightUnit)),
      targetWeightKg: targetWeightDisplay ? displayToKg(Number(targetWeightDisplay), weightUnit) : undefined,
      manualCalorieTarget: goal.manualCalorieTarget || undefined,
    });
    goal = next;
    await getNutritionRepo().saveGoal(next);
    pushNutritionGoal(next);
    ui.saved = true;
    setTimeout(() => back("/nutrition"), 400);
  }

  onMount(() => void load());
</script>

<div class="flex flex-col pb-24">
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
    <button type="button" class="h-8 w-8 flex items-center justify-center" onclick={() => back("/nutrition")}>
      <ArrowLeft class="h-4 w-4" />
    </button>
    <h1 class="text-sm font-semibold">Nutrition goal</h1>
  </div>

  {#if ui.loading}
    <p class="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
  {:else}
    <div class="flex flex-col divide-y divide-border">
      <!-- Body -->
      <div class="px-3 py-3 flex flex-col gap-2">
        <span class="text-xs font-semibold">About you</span>
        <div class="flex gap-2">
          {#each ["male", "female"] as s (s)}
            <button
              type="button"
              class="flex-1 py-1.5 rounded text-sm capitalize {goal.sex === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
              onclick={() => (goal.sex = s as Sex)}
            >{s}</button>
          {/each}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Birth date</span>
            <input type="date" class="bg-muted rounded px-2 py-1.5 text-sm outline-none" bind:value={goal.birthDateIso} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Height ({heightUnit})</span>
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={heightDisplay} />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] text-muted-foreground">Activity level</span>
          <select class="bg-muted rounded px-2 py-1.5 text-sm outline-none" bind:value={goal.activityLevel}>
            {#each ACTIVITY as a (a.value)}<option value={a.value}>{a.label}</option>{/each}
          </select>
        </label>
      </div>

      <!-- Goal -->
      <div class="px-3 py-3 flex flex-col gap-2">
        <span class="text-xs font-semibold">Goal</span>
        <div class="flex gap-2">
          {#each ["lose", "maintain", "gain"] as t (t)}
            <button
              type="button"
              class="flex-1 py-1.5 rounded text-sm capitalize {goal.goalType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
              onclick={() => (goal.goalType = t as GoalType)}
            >{t}</button>
          {/each}
        </div>
        {#if goal.goalType !== "maintain"}
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-muted-foreground">Rate ({weightUnit}/week)</span>
              <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={rateDisplay} />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-muted-foreground">Target weight ({weightUnit}, optional)</span>
              <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={targetWeightDisplay} />
            </label>
          </div>
        {/if}
      </div>

      <!-- Macros -->
      <div class="px-3 py-3 flex flex-col gap-2">
        <span class="text-xs font-semibold">Macro split</span>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Protein (g/kg body weight)</span>
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={goal.proteinGPerKg} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Fat (% of calories)</span>
            <input
              class="bg-muted rounded px-2 py-1.5 text-sm outline-none"
              inputmode="numeric"
              value={Math.round(goal.fatPct * 100)}
              oninput={(e) => (goal.fatPct = (Number(e.currentTarget.value) || 0) / 100)}
            />
          </label>
        </div>
      </div>

      <!-- Adaptive -->
      <div class="px-3 py-3 flex flex-col gap-2">
        <label class="flex items-center justify-between">
          <span class="flex flex-col">
            <span class="text-xs font-semibold">Adaptive targets</span>
            <span class="text-[11px] text-muted-foreground">Adjust calories weekly from your real weight trend.</span>
          </span>
          <input type="checkbox" class="h-4 w-4" bind:checked={goal.adaptiveEnabled} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[11px] text-muted-foreground">Manual calorie override (optional)</span>
          <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="numeric" bind:value={goal.manualCalorieTarget} />
        </label>
      </div>

      <!-- Preview -->
      <div class="px-3 py-3 flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold">Your target</span>
          {#if preview}<Badge variant="outline" class="text-[10px] capitalize">{preview.source}</Badge>{/if}
        </div>
        {#if preview}
          <div class="text-sm tabular-nums">
            <span class="font-semibold">{fmtKcal(preview.kcal)} kcal</span>
            <span class="text-muted-foreground">
              · P {fmtGrams(preview.macros.proteinG)} · C {fmtGrams(preview.macros.carbsG)} · F {fmtGrams(preview.macros.fatG)}
            </span>
          </div>
          <p class="text-[11px] text-muted-foreground">
            Maintenance ≈ {fmtKcal(preview.expenditure)} kcal
          </p>
        {:else}
          <p class="text-xs text-muted-foreground">Add your birth date, height and a recent weight to see a target.</p>
        {/if}
      </div>
    </div>

    <div class="px-3 py-3">
      <Button class="w-full" onclick={() => void save()} disabled={ui.saved}>
        {ui.saved ? "Saved" : "Save goal"}
      </Button>
    </div>
  {/if}
</div>
