<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { back } from "$lib/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Select from "$lib/components/ui/select";
  import DateField from "$lib/components/ui/date-field";
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
  import type { AlgorithmPreferencesField, NutritionAlgorithmMeta } from "@logit/core/domain/nutritionAlgorithm";
  import {
    getNutritionAlgorithmConfig,
    getNutritionAlgorithmPreferences,
    setNutritionAlgorithm,
    setNutritionAlgorithmPreferences,
  } from "@logit/core/usecases/nutrition/getNutritionAlgorithmConfig";
  import { recentDailyIntake } from "@logit/core/usecases/nutrition/getNutritionTargets";
  import type { DailyIntakePoint } from "@logit/core/domain/nutritionAlgorithm";
  import type { WeightEntry } from "@logit/core/domain/nutrition";
  import { getNutritionRepo } from "$lib/data/repoProvider";
  import { getNutritionDeps } from "$lib/features/nutrition/deps";
  import { pushNutritionGoal, lastSyncedAt } from "$lib/sync/syncService";
  import { profile } from "$lib/stores/profile.store";
  import AlgorithmPreferencesForm from "$lib/components/AlgorithmPreferencesForm.svelte";
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
  let weightEntries = $state<WeightEntry[]>([]);
  let dailyIntake = $state<DailyIntakePoint[]>([]);

  // Algorithm picker + its live preferences.
  let algorithms = $state<(NutritionAlgorithmMeta & { hasPreferences: boolean })[]>([]);
  let algoSchema = $state<AlgorithmPreferencesField[]>([]);
  let algoPrefs = $state<Record<string, unknown>>({});
  const selectedAlgoId = $derived(resolveAlgorithmId(goal));

  const weightUnit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const heightUnit = $derived(($profile.heightUnit ?? "cm") as "cm" | "in");

  // Rate is edited in display units; stored as kg/week.
  let rateDisplay = $state("0.5");
  let targetWeightDisplay = $state("");
  let heightDisplay = $state("");

  /** The goal as currently edited in the form (before Save). */
  function liveGoal(): NutritionGoal {
    return {
      ...goal,
      heightCm:
        heightUnit === "in"
          ? (Number(heightDisplay) || 0) * 2.54
          : Number(heightDisplay) || undefined,
      targetRateKgPerWeek:
        goal.goalType === "maintain" ? 0 : displayToKg(Number(rateDisplay) || 0, weightUnit),
      targetWeightKg: targetWeightDisplay
        ? displayToKg(Number(targetWeightDisplay), weightUnit)
        : undefined,
    };
  }

  let previewAlgo = $state<
    import("@logit/core/domain/nutritionAlgorithm").NutritionAlgorithm | null
  >(null);

  type Preview = {
    kcal: number;
    macros: import("@logit/core/domain/nutrition").MacroTotals;
    sourceLabel: string;
    maintenanceKcal: number | null;
  };
  let preview = $state<Preview | null>(null);

  // computeTargets() may be async (community algorithms run in the sandbox), so
  // the live preview is an effect, not a $derived. A run token drops stale
  // results if inputs change mid-compute.
  let previewRun = 0;
  $effect(() => {
    const algo = previewAlgo;
    const g = liveGoal();
    const w = currentWeightKg;
    const prefs = algoPrefs;
    const entries = weightEntries;
    const intake = dailyIntake;

    if (!algo) {
      preview = null;
      return;
    }
    const token = ++previewRun;
    void Promise.resolve(
      algo.computeTargets({
        goal: g,
        currentWeightKg: w ?? undefined,
        weightEntries: entries,
        dailyIntakeKcal: intake,
        userPreferences: prefs,
        now: Date.now(),
      }),
    )
      .then((out) => {
        if (token !== previewRun) return;
        if (!out.kcal || out.kcal <= 0) {
          preview = null;
          return;
        }
        preview = {
          kcal: out.kcal,
          macros:
            out.macros ??
            macroTargets({
              kcalTarget: out.kcal,
              weightKg: w ?? 0,
              proteinGPerKg: g.proteinGPerKg,
              fatPct: g.fatPct,
            }),
          sourceLabel: out.sourceLabel ?? "",
          maintenanceKcal: out.maintenanceKcal ?? null,
        };
      })
      .catch(() => {
        if (token === previewRun) preview = null;
      });
  });

  async function loadAlgorithm(id: string) {
    const deps = getNutritionDeps();
    const [prefs, algo] = await Promise.all([
      getNutritionAlgorithmPreferences(goal, id, deps),
      deps.nutritionAlgorithmRegistry.get(id),
    ]);
    algoSchema = prefs?.schema ?? [];
    algoPrefs = prefs?.values ?? {};
    previewAlgo = algo;
  }

  async function load() {
    const repo = getNutritionRepo();
    const deps = getNutritionDeps();
    const [existing, weights, intake, config] = await Promise.all([
      repo.getGoal(),
      repo.listWeightEntries(),
      recentDailyIntake(repo, 35, Date.now()),
      getNutritionAlgorithmConfig(null, deps),
    ]);
    weightEntries = weights;
    dailyIntake = intake;
    algorithms = config.algorithms;

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

    await loadAlgorithm(resolveAlgorithmId(goal));
    ui.loading = false;
  }

  /**
   * Re-pull just the weight history/trend — not the goal fields, which the user may be
   * mid-edit on this screen. Login's background sync can still be pulling weight entries
   * down when this page is first opened, which left the preview stuck on "add a recent
   * weight" until the next full reload; this refreshes that as soon as sync catches up.
   */
  async function refreshWeightHistory() {
    const repo = getNutritionRepo();
    const [weights, intake] = await Promise.all([
      repo.listWeightEntries(),
      recentDailyIntake(repo, 35, Date.now()),
    ]);
    weightEntries = weights;
    dailyIntake = intake;
    const trend = smoothWeightSeries(weights);
    currentWeightKg =
      trend.currentKg ?? ($profile.weight != null && $profile.weightUnit === "kg" ? $profile.weight : null);
  }

  let lastSyncSeen = $state<number | null>(null);
  $effect(() => {
    const t = $lastSyncedAt;
    if (lastSyncSeen === null) {
      lastSyncSeen = t;
      return;
    }
    if (t !== lastSyncSeen) {
      lastSyncSeen = t;
      if (!ui.loading) void refreshWeightHistory();
    }
  });

  async function selectAlgorithm(id: string) {
    goal = setNutritionAlgorithm(goal, id);
    await loadAlgorithm(id);
  }

  function setAlgoPref(key: string, value: unknown) {
    algoPrefs = { ...algoPrefs, [key]: value };
    goal = setNutritionAlgorithmPreferences(goal, selectedAlgoId, algoPrefs);
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
            <DateField bind:value={goal.birthDateIso} maxIso={localDateIso()} aria-label="Birth date" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-muted-foreground">Height ({heightUnit})</span>
            <input class="bg-muted rounded px-2 py-1.5 text-sm outline-none" inputmode="decimal" bind:value={heightDisplay} />
          </label>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[11px] text-muted-foreground">Activity level</span>
          <Select.Root type="single" bind:value={goal.activityLevel}>
            <Select.Trigger class="w-full">
              {ACTIVITY.find((a) => a.value === goal.activityLevel)?.label ?? "Select"}
            </Select.Trigger>
            <Select.Content>
              {#each ACTIVITY as a (a.value)}
                <Select.Item value={a.value} label={a.label} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
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

      <!-- Algorithm -->
      <div class="px-3 py-3 flex flex-col gap-2">
        <span class="text-xs font-semibold">Algorithm</span>
        <p class="text-[11px] text-muted-foreground -mt-1">
          How your calorie target is worked out. Install more from the Plugins screen.
        </p>
        <div class="flex flex-col gap-1">
          {#each algorithms as a (a.id)}
            <button
              type="button"
              class="text-left rounded px-2.5 py-2 border {selectedAlgoId === a.id
                ? 'border-primary bg-primary/5'
                : 'border-border'}"
              onclick={() => void selectAlgorithm(a.id)}
            >
              <span class="text-sm font-medium">{a.name}</span>
              <span class="block text-[11px] text-muted-foreground">{a.description}</span>
            </button>
          {/each}
        </div>

        {#if algoSchema.length}
          <div class="mt-1 rounded border border-border px-3">
            <AlgorithmPreferencesForm schema={algoSchema} values={algoPrefs} onChange={setAlgoPref} />
          </div>
        {/if}

        <label class="flex flex-col gap-1 mt-1">
          <span class="text-[11px] text-muted-foreground">Manual calorie override (optional)</span>
          <input
            class="bg-muted rounded px-2 py-1.5 text-sm outline-none"
            inputmode="numeric"
            bind:value={goal.manualCalorieTarget}
          />
        </label>
      </div>

      <!-- Preview -->
      <div class="px-3 py-3 flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold">Your target</span>
          {#if goal.manualCalorieTarget}
            <Badge variant="outline" class="text-[10px]">Manual</Badge>
          {:else if preview?.sourceLabel}
            <Badge variant="outline" class="text-[10px]">{preview.sourceLabel}</Badge>
          {/if}
        </div>
        {#if goal.manualCalorieTarget}
          <div class="text-sm tabular-nums">
            <span class="font-semibold">{fmtKcal(Number(goal.manualCalorieTarget))} kcal</span>
          </div>
        {:else if preview}
          <div class="text-sm tabular-nums">
            <span class="font-semibold">{fmtKcal(preview.kcal)} kcal</span>
            <span class="text-muted-foreground">
              · P {fmtGrams(preview.macros.proteinG)} · C {fmtGrams(preview.macros.carbsG)} · F {fmtGrams(preview.macros.fatG)}
            </span>
          </div>
          {#if preview.maintenanceKcal}
            <p class="text-[11px] text-muted-foreground">
              Maintenance ≈ {fmtKcal(preview.maintenanceKcal)} kcal
            </p>
          {/if}
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
