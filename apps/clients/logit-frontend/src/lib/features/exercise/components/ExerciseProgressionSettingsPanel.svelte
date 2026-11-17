<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { PROGRESSION_OFF, type ExerciseProgressionSettings, type ProgressionAlgorithmMeta } from "@logit/core/domain/progression";
  import type { MuscleGroup } from "@logit/core/domain/exercise";
  import { liftGoalPace, sameExercise, type Goal, type LiftGoalPace } from "@logit/core/domain/goals";
  import {
    getExerciseProgressionSettings,
    saveExerciseProgressionSettings,
    type ExerciseSettingsPatch,
  } from "@logit/core/usecases/progression/exerciseProgressionSettings";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { isCompound } from "@logit/core/progression/algorithms/adaptiveProgression";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { pushExerciseSetting } from "$lib/sync/syncService";
  import { bumpProgression } from "$lib/progression/store";
  import { activeGoals, goalsStore } from "$lib/features/goals/goalsStore";
  import { segment, segmentTrack } from "$lib/components/ui/choice";

  // Exercise › How it progresses: this exercise's rep range, which algorithm plans it, and
  // what to do when a lift goal on it falls behind. Everything defaults to "same as every
  // other exercise".
  interface Props {
    exercise: { id?: string; name: string; primaryMuscles?: MuscleGroup[]; secondaryMuscles?: MuscleGroup[] };
  }
  const { exercise }: Props = $props();

  const PRESETS: [number, number][] = [[3, 6], [5, 8], [8, 12], [12, 20]];

  let settings = $state<ExerciseProgressionSettings | null>(null);
  let algorithms = $state<ProgressionAlgorithmMeta[]>([]);
  let generalId = $state<string | null>(null);
  let defaultRange = $state<[number, number] | null>(null);
  let goal = $state<Goal | null>(null);
  let pace = $state<LiftGoalPace | null>(null);
  let custom = $state(false);
  let customLo = $state("");
  let customHi = $state("");
  let saving = $state(false);

  onMount(() => void load());

  async function load() {
    const deps = getProgressionDeps();
    const [s, metas, config] = await Promise.all([
      getExerciseProgressionSettings(exercise, deps),
      deps.algorithmRegistry.list(),
      deps.progressionRepo.getConfig(),
    ]);
    settings = s;
    algorithms = metas;
    generalId = config?.algorithmId ?? null;
    await loadDefaultRange();
    const r = s?.repRange;
    custom = !!r && !PRESETS.some((p) => p[0] === r[0] && p[1] === r[1]);
    if (r) {
      customLo = String(r[0]);
      customHi = String(r[1]);
    }

    goal = activeGoals(get(goalsStore)).find((g) => g.target.type === "lift" && sameExercise(g.target, exercise)) ?? null;
    if (goal && goal.target.type === "lift") {
      const { history } = await getExerciseHistory(exercise, deps, { includeExcluded: true });
      pace = liftGoalPace(history, { weightKg: goal.target.weightKg, reps: goal.target.reps, deadlineIso: goal.deadlineIso }, Date.now());
    }
  }

  /** What "Default" means for the algorithm that plans this exercise. */
  async function loadDefaultRange() {
    const id = activeId;
    if (!id || id === PROGRESSION_OFF) {
      defaultRange = null;
      return;
    }
    const prefs = ((await getProgressionDeps().progressionRepo.getAlgorithmPreferences(id)) ?? {}) as Record<string, unknown>;
    const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
    if (id === "logit-adaptive") {
      defaultRange = isCompound(exercise)
        ? [n(prefs.compoundRepMin, 5), n(prefs.compoundRepMax, 8)]
        : [n(prefs.isolationRepMin, 8), n(prefs.isolationRepMax, 12)];
    } else if (id === "linear-progression") {
      defaultRange = [n(prefs.repRangeMin, 5), n(prefs.repRangeMax, 8)];
    } else {
      defaultRange = null;
    }
  }

  const activeId = $derived(settings?.algorithmId ?? generalId);
  const generalName = $derived(algorithms.find((a) => a.id === generalId)?.name ?? "No suggestions");
  const range = $derived(settings?.repRange ?? null);
  const isOff = $derived(settings?.algorithmId === PROGRESSION_OFF);

  async function save(patch: ExerciseSettingsPatch) {
    if (saving) return;
    saving = true;
    try {
      const row = await saveExerciseProgressionSettings(exercise, patch, getProgressionDeps());
      if (row) pushExerciseSetting(row);
      settings = row && !row.deletedAtMs ? row : null;
      await loadDefaultRange();
      bumpProgression();
    } finally {
      saving = false;
    }
  }

  function pickRange(r: [number, number] | null) {
    custom = false;
    void save({ repRange: r ?? undefined });
  }

  function saveCustom() {
    const lo = Number(customLo);
    const hi = Number(customHi);
    if (lo > 0 && hi > 0) void save({ repRange: [lo, hi] });
  }

  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const kg = (n: number) => `${Math.round(n * 10) / 10} kg`;

  const paceText = $derived.by(() => {
    if (!pace) return "";
    if (pace.pace === "achieved") return "Done.";
    if (pace.pace === "unknown" || pace.neededPerWeekKg == null || pace.ratePerWeekKg == null) {
      return pace.currentKg != null ? `You're at about ${kg(pace.currentKg)}. Add a date to see if you're on pace.` : "A few more sessions and it can tell how it's going.";
    }
    const rate = `${pace.ratePerWeekKg >= 0 ? "+" : "−"}${kg(Math.abs(pace.ratePerWeekKg))}`;
    return `${pace.pace === "on_pace" ? "On pace" : "Behind"}: needs about +${kg(pace.neededPerWeekKg)} a week; you're averaging ${rate}.`;
  });

  const chip = (on: boolean) =>
    `h-10 rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-transparent bg-foreground text-background" : "border-border"}`;
</script>

<section class="flex flex-col gap-4" aria-labelledby="how-it-progresses">
  <div>
    <h2 id="how-it-progresses" class="text-sm font-medium">How it progresses</h2>
    <p class="text-xs text-muted-foreground">Just for {exercise.name}. Anything left on default follows your general setting.</p>
  </div>

  <div class="flex flex-col gap-2">
    <span class="text-xs font-medium text-muted-foreground">Rep range</span>
    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Rep range">
      <button type="button" role="radio" aria-checked={!range && !custom} class={chip(!range && !custom)} onclick={() => pickRange(null)}>
        Default{defaultRange ? ` ${defaultRange[0]}–${defaultRange[1]}` : ""}
      </button>
      {#each PRESETS as p (p.join("-"))}
        {@const on = !custom && !!range && range[0] === p[0] && range[1] === p[1]}
        <button type="button" role="radio" aria-checked={on} class={chip(on)} onclick={() => pickRange(p)}>{p[0]}–{p[1]}</button>
      {/each}
      <button type="button" role="radio" aria-checked={custom} class={chip(custom)} onclick={() => (custom = true)}>Custom</button>
    </div>
    {#if custom}
      <div class="flex items-center gap-2 text-sm">
        <label class="sr-only" for="rr-lo">Fewest reps</label>
        <input id="rr-lo" class="h-10 w-16 rounded-lg bg-muted px-2 text-center tabular-nums" inputmode="numeric" bind:value={customLo} onchange={saveCustom} />
        <span class="text-muted-foreground">to</span>
        <label class="sr-only" for="rr-hi">Most reps</label>
        <input id="rr-hi" class="h-10 w-16 rounded-lg bg-muted px-2 text-center tabular-nums" inputmode="numeric" bind:value={customHi} onchange={saveCustom} />
        <span class="text-muted-foreground">reps</span>
      </div>
    {/if}
    <p class="text-xs text-muted-foreground">A split day that sets its own reps still wins on that day.</p>
  </div>

  <div class="flex flex-col gap-2">
    <span class="text-xs font-medium text-muted-foreground">Algorithm</span>
    <div class="overflow-hidden rounded-xl border border-border" role="radiogroup" aria-label="Algorithm for {exercise.name}">
      <button type="button" role="radio" aria-checked={!settings?.algorithmId} class="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left" onclick={() => void save({ algorithmId: undefined })}>
        <span class="size-4 shrink-0 rounded-full border-2 {!settings?.algorithmId ? 'border-[5px] border-foreground' : 'border-muted-foreground/50'}"></span>
        <span class="flex-1"><span class="block text-sm font-medium">Same as everything else</span><span class="block text-xs text-muted-foreground">{generalName}</span></span>
      </button>
      {#each algorithms as a (a.id)}
        {@const on = settings?.algorithmId === a.id}
        <button type="button" role="radio" aria-checked={on} class="flex min-h-12 w-full items-center gap-3 border-t border-border px-3.5 py-2 text-left" onclick={() => void save({ algorithmId: a.id })}>
          <span class="size-4 shrink-0 rounded-full border-2 {on ? 'border-[5px] border-foreground' : 'border-muted-foreground/50'}"></span>
          <span class="flex-1 text-sm font-medium">{a.name}</span>
        </button>
      {/each}
      <button type="button" role="radio" aria-checked={isOff} class="flex min-h-12 w-full items-center gap-3 border-t border-border px-3.5 py-2 text-left" onclick={() => void save({ algorithmId: PROGRESSION_OFF })}>
        <span class="size-4 shrink-0 rounded-full border-2 {isOff ? 'border-[5px] border-foreground' : 'border-muted-foreground/50'}"></span>
        <span class="flex-1"><span class="block text-sm font-medium">No suggestions</span><span class="block text-xs text-muted-foreground">No planned sets; you add them yourself</span></span>
      </button>
    </div>
  </div>

  <div class="flex flex-col gap-2">
    <span class="text-xs font-medium text-muted-foreground">Goal</span>
    {#if goal && goal.target.type === "lift"}
      <div class="flex flex-col gap-2.5 rounded-xl border border-border p-3.5" data-testid="exercise-goal">
        <div class="text-sm font-medium tabular-nums">
          {goal.target.weightKg} kg × {goal.target.reps}{goal.deadlineIso ? ` by ${fmtDate(goal.deadlineIso)}` : ""}
        </div>
        <p class="text-xs text-muted-foreground">{paceText}</p>
        <span class="text-xs font-medium">If you fall behind pace</span>
        <div class={segmentTrack} role="radiogroup" aria-label="If you fall behind pace">
          <button type="button" role="radio" aria-checked={settings?.behindPace !== "push"} class={segment(settings?.behindPace !== "push")} onclick={() => void save({ behindPace: undefined })}>Just show it</button>
          <button type="button" role="radio" aria-checked={settings?.behindPace === "push"} class={segment(settings?.behindPace === "push")} onclick={() => void save({ behindPace: "push" })}>Push a little harder</button>
        </div>
        {#if settings?.behindPace === "push" && activeId !== "logit-adaptive"}
          <p class="text-xs text-muted-foreground">Pushing works with LogIt Adaptive; other algorithms just show the pace.</p>
        {/if}
      </div>
    {:else}
      <a href="/progress/goals/new" class="text-sm font-medium underline underline-offset-2">Set a lift goal for {exercise.name}</a>
    {/if}
  </div>

  <a href="/progress/weekly-sets" class="text-sm font-medium underline underline-offset-2">Sets this week for each muscle</a>
</section>
