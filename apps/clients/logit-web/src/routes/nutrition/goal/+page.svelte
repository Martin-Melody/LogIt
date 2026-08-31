<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import {
    defaultNutritionGoal,
    localDateIso,
    resolveAlgorithmId,
    touchGoal,
    type ActivityLevel,
    type GoalType,
    type NutritionGoal,
    type Sex,
  } from "@logit/core/domain/nutrition";
  import { macroTargets } from "@logit/core/nutrition/targets";
  import { smoothWeightSeries } from "@logit/core/nutrition/trend";
  import type { AlgorithmPreferencesField } from "@logit/core/domain/progression";
  import type { NutritionAlgorithm, NutritionAlgorithmMeta, DailyIntakePoint } from "@logit/core/domain/nutritionAlgorithm";
  import type { WeightEntry } from "@logit/core/domain/nutrition";
  import {
    getNutritionAlgorithmConfig,
    getNutritionAlgorithmPreferences,
    setNutritionAlgorithm,
    setNutritionAlgorithmPreferences,
  } from "@logit/core/usecases/nutrition/getNutritionAlgorithmConfig";
  import { recentDailyIntake } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import { getOwnNutritionDeps, getOwnProfile } from "$lib/deps";
  import AlgorithmPreferencesForm from "$lib/components/nutrition/AlgorithmPreferencesForm.svelte";
  import { displayToKg, kgToDisplay, fmtKcal, fmtGrams, type WeightUnit } from "$lib/nutrition";

  const deps = getOwnNutritionDeps();
  const repo = deps.nutritionRepo;

  const ACTIVITY: { value: ActivityLevel; label: string }[] = [
    { value: "sedentary", label: "Sedentary — desk job, little exercise" },
    { value: "light", label: "Light — 1–3 workouts/week" },
    { value: "moderate", label: "Moderate — 3–5 workouts/week" },
    { value: "very", label: "Very active — 6–7 workouts/week" },
    { value: "extra", label: "Extra — hard training or physical job" },
  ];

  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);

  let goal = $state<NutritionGoal>(defaultNutritionGoal());
  let currentWeightKg = $state<number | null>(null);
  let weightEntries = $state<WeightEntry[]>([]);
  let dailyIntake = $state<DailyIntakePoint[]>([]);
  let unit = $state<WeightUnit>("kg");

  let algorithms = $state<(NutritionAlgorithmMeta & { hasPreferences: boolean })[]>([]);
  let algoSchema = $state<AlgorithmPreferencesField[]>([]);
  let algoPrefs = $state<Record<string, unknown>>({});
  let previewAlgo = $state<NutritionAlgorithm | null>(null);
  const selectedAlgoId = $derived(resolveAlgorithmId(goal));

  let rateDisplay = $state("0.5");
  let targetWeightDisplay = $state("");
  let heightDisplay = $state("");

  function liveGoal(): NutritionGoal {
    return {
      ...goal,
      heightCm: Number(heightDisplay) || undefined,
      targetRateKgPerWeek: goal.goalType === "maintain" ? 0 : displayToKg(Number(rateDisplay) || 0, unit),
      targetWeightKg: targetWeightDisplay ? displayToKg(Number(targetWeightDisplay), unit) : undefined,
    };
  }

  const preview = $derived.by(() => {
    if (!previewAlgo) return null;
    const g = liveGoal();
    const out = previewAlgo.computeTargets({
      goal: g,
      currentWeightKg: currentWeightKg ?? undefined,
      weightEntries,
      dailyIntakeKcal: dailyIntake,
      userPreferences: algoPrefs,
      now: Date.now(),
    });
    if (!out.kcal || out.kcal <= 0) return null;
    const macros =
      out.macros ??
      macroTargets({ kcalTarget: out.kcal, weightKg: currentWeightKg ?? 0, proteinGPerKg: g.proteinGPerKg, fatPct: g.fatPct });
    return { kcal: out.kcal, macros, sourceLabel: out.sourceLabel ?? "", maintenanceKcal: out.maintenanceKcal ?? null };
  });

  async function loadAlgorithm(id: string) {
    const [prefs, algo] = await Promise.all([
      getNutritionAlgorithmPreferences(goal, id, deps),
      deps.nutritionAlgorithmRegistry.get(id),
    ]);
    algoSchema = prefs?.schema ?? [];
    algoPrefs = prefs?.values ?? {};
    previewAlgo = algo;
  }

  async function load() {
    try {
      const [existing, weights, intake, config, profile] = await Promise.all([
        repo.getGoal(),
        repo.listWeightEntries(),
        recentDailyIntake(repo, 35, Date.now()),
        getNutritionAlgorithmConfig(null, deps),
        getOwnProfile(),
      ]);
      unit = (profile?.weightUnit ?? "kg") as WeightUnit;
      weightEntries = weights;
      dailyIntake = intake;
      algorithms = config.algorithms;

      const trend = smoothWeightSeries(weights);
      currentWeightKg = trend.currentKg ?? (profile?.weight != null && profile.weightUnit === "kg" ? profile.weight : null);

      if (existing) {
        goal = existing;
        if (goal.goalType !== "maintain") rateDisplay = kgToDisplay(goal.targetRateKgPerWeek, unit).toFixed(2);
        if (goal.targetWeightKg) targetWeightDisplay = kgToDisplay(goal.targetWeightKg, unit).toFixed(1);
        if (goal.heightCm) heightDisplay = String(Math.round(goal.heightCm));
      } else if (profile?.height != null && profile.heightUnit === "cm") {
        heightDisplay = String(profile.height);
      }

      await loadAlgorithm(resolveAlgorithmId(goal));
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  async function selectAlgorithm(id: string) {
    goal = setNutritionAlgorithm(goal, id);
    await loadAlgorithm(id);
  }

  function setAlgoPref(key: string, value: unknown) {
    algoPrefs = { ...algoPrefs, [key]: value };
    goal = setNutritionAlgorithmPreferences(goal, selectedAlgoId, algoPrefs);
  }

  async function save() {
    if (saving) return;
    saving = true;
    error = null;
    const next = touchGoal({
      ...goal,
      heightCm: heightDisplay ? Number(heightDisplay) : undefined,
      targetRateKgPerWeek: goal.goalType === "maintain" ? 0 : Math.abs(displayToKg(Number(rateDisplay) || 0, unit)),
      targetWeightKg: targetWeightDisplay ? displayToKg(Number(targetWeightDisplay), unit) : undefined,
      manualCalorieTarget: goal.manualCalorieTarget || undefined,
    });
    try {
      await repo.saveGoal(next);
      goal = next;
      saved = true;
      setTimeout(() => goto("/nutrition"), 500);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<div class="flex flex-col gap-4 max-w-2xl">
  <div>
    <a href="/nutrition" class="text-xs text-muted-foreground hover:text-foreground">&larr; Nutrition</a>
    <h1 class="text-lg font-semibold mt-1">Nutrition goal</h1>
  </div>

  {#if error}
    <Alert.Root variant="destructive" class="mb-1"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {/if}

  {#if loading}
    <div class="flex items-center gap-2 text-sm text-muted-foreground"><Spinner class="size-4" /> Loading…</div>
  {:else}
    <Card.Root>
      <Card.Header class="pb-2"><Card.Title class="text-sm">About you</Card.Title></Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-3">
        <div class="flex gap-2">
          {#each ["male", "female"] as s (s)}
            <button
              type="button"
              class="flex-1 py-1.5 rounded text-sm capitalize {goal.sex === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
              onclick={() => (goal.sex = s as Sex)}
            >{s}</button>
          {/each}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Birth date</span>
            <input type="date" max={localDateIso()} class="h-8 rounded border border-border bg-background px-2 text-sm" bind:value={goal.birthDateIso} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Height (cm)</span>
            <input class="h-8 rounded border border-border bg-background px-2 text-sm" inputmode="decimal" bind:value={heightDisplay} />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Activity level</span>
          <select class="h-8 rounded border border-border bg-background px-2 text-sm" bind:value={goal.activityLevel}>
            {#each ACTIVITY as a (a.value)}<option value={a.value}>{a.label}</option>{/each}
          </select>
        </label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2"><Card.Title class="text-sm">Goal</Card.Title></Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-3">
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
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Rate ({unit}/week)</span>
              <input class="h-8 rounded border border-border bg-background px-2 text-sm" inputmode="decimal" bind:value={rateDisplay} />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Target weight ({unit}, optional)</span>
              <input class="h-8 rounded border border-border bg-background px-2 text-sm" inputmode="decimal" bind:value={targetWeightDisplay} />
            </label>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2"><Card.Title class="text-sm">Macro split</Card.Title></Card.Header>
      <Card.Content class="pt-0 grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Protein (g/kg body weight)</span>
          <input class="h-8 rounded border border-border bg-background px-2 text-sm" inputmode="decimal" bind:value={goal.proteinGPerKg} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">Fat (% of calories)</span>
          <input
            class="h-8 rounded border border-border bg-background px-2 text-sm"
            inputmode="numeric"
            value={Math.round(goal.fatPct * 100)}
            oninput={(e) => (goal.fatPct = (Number(e.currentTarget.value) || 0) / 100)}
          />
        </label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2">
        <Card.Title class="text-sm">Algorithm</Card.Title>
        <Card.Description>How your calorie target is worked out. Install more from the mobile Plugins screen.</Card.Description>
      </Card.Header>
      <Card.Content class="pt-0 flex flex-col gap-2">
        {#each algorithms as a (a.id)}
          <button
            type="button"
            class="text-left rounded px-2.5 py-2 border {selectedAlgoId === a.id ? 'border-primary bg-primary/5' : 'border-border'}"
            onclick={() => selectAlgorithm(a.id)}
          >
            <span class="text-sm font-medium">{a.name}</span>
            <span class="block text-xs text-muted-foreground">{a.description}</span>
          </button>
        {/each}

        {#if algoSchema.length}
          <div class="mt-1 rounded border border-border px-3">
            <AlgorithmPreferencesForm schema={algoSchema} values={algoPrefs} onChange={setAlgoPref} />
          </div>
        {/if}

        <label class="flex flex-col gap-1 mt-1">
          <span class="text-xs text-muted-foreground">Manual calorie override (optional)</span>
          <input class="h-8 rounded border border-border bg-background px-2 text-sm" inputmode="numeric" bind:value={goal.manualCalorieTarget} />
        </label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-2 flex-row items-center justify-between">
        <Card.Title class="text-sm">Your target</Card.Title>
        {#if goal.manualCalorieTarget}
          <Badge variant="outline" class="text-[10px]">Manual</Badge>
        {:else if preview?.sourceLabel}
          <Badge variant="outline" class="text-[10px]">{preview.sourceLabel}</Badge>
        {/if}
      </Card.Header>
      <Card.Content class="pt-0">
        {#if goal.manualCalorieTarget}
          <p class="text-sm tabular-nums font-semibold">{fmtKcal(Number(goal.manualCalorieTarget))} kcal</p>
        {:else if preview}
          <p class="text-sm tabular-nums">
            <span class="font-semibold">{fmtKcal(preview.kcal)} kcal</span>
            <span class="text-muted-foreground"> · P {fmtGrams(preview.macros.proteinG)} · C {fmtGrams(preview.macros.carbsG)} · F {fmtGrams(preview.macros.fatG)}</span>
          </p>
          {#if preview.maintenanceKcal}
            <p class="text-xs text-muted-foreground mt-0.5">Maintenance ≈ {fmtKcal(preview.maintenanceKcal)} kcal</p>
          {/if}
        {:else}
          <p class="text-xs text-muted-foreground">Add your birth date, height and a recent weight to see a target.</p>
        {/if}
      </Card.Content>
    </Card.Root>

    <div>
      <Button disabled={saving || saved} onclick={save}>
        {#if saving}<Spinner class="size-4" />{/if}
        {saved ? "Saved" : "Save goal"}
      </Button>
    </div>
  {/if}
</div>
