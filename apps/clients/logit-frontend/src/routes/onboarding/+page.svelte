<script lang="ts">
  // First launch (design canvas row 2: welcome, O1 goal, E0 experience, O2 days, O3 plan).
  // One tap per question, no Continue buttons, no account or name: four taps from "Get
  // started" to a workout. The answers build a plan (core domain/starterPlan.ts) that is
  // saved as an ordinary split on a weekday schedule, with each exercise's rep range set
  // from the goal and the days a week as the weekly target.
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { ArrowLeft, ChevronDown, Loader2, Plus, X } from "lucide-svelte";
  import Logo from "@logit/ui/Logo.svelte";
  import { onBack } from "$lib/components/sheet/sheet";

  import { onboarding } from "$lib/stores/onboarding.store";
  import { resetTours } from "$lib/tour/index";
  import { splits } from "$lib/stores/splits.store";
  import { currentSession } from "$lib/stores/currentSession.store";
  import { goalsStore } from "$lib/features/goals/goalsStore";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { saveStarterPlan } from "$lib/features/onboarding/saveStarterPlan";
  import { getAccountItem, setAccountItem } from "$lib/data/accountStorage";
  import { createSplit } from "@logit/core/domain/WorkoutSplit";
  import { sourceFromSplitDay } from "@logit/core/domain/sessionHistory";
  import { planSplitDay } from "$lib/usecases/startSessionFromSplitDay";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { saveStartingLifts } from "$lib/features/onboarding/startingLifts";
  import { getExerciseRepo } from "$lib/data/repoProvider";
  import { pushExercise } from "$lib/sync/syncService";
  import { applyTrainingStyle, TRAINING_STYLES, type TrainingStyle } from "$lib/features/onboarding/trainingStyle";
  import { estimated1RM } from "@logit/core/domain/oneRepMax";
  import ImportFlow from "$lib/features/import/ImportFlow.svelte";
  import { getSplitRepo, getWorkoutRepo } from "$lib/data/repoProvider";
  import { setTrainingGoal } from "$lib/features/onboarding/trainingGoal";
  import { detectSplit, splitFromDetected, summariseHistory, type DetectedSplit, type HistorySummary } from "@logit/core/import/historyFromImport";
  import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
  import { fromDisplayWeight, toDisplayWeight, trimWeight } from "@logit/core/domain/units";
  import {
    buildStarterPlan, otherPlanKinds, planKindFor,
    EQUIPMENT_LABELS, GOAL_LABELS, LENGTH_LABELS,
    type DaysPerWeek, type PlanEquipment, type PlanKind, type PlanLength, type TrainingExperience, type TrainingGoal,
  } from "@logit/core/domain/starterPlan";

  /** Kept per account so a half-finished onboarding picks up where it was. */
  const ANSWERS_KEY = "logit:onboarding:answers";

  type Answers = {
    goal: TrainingGoal | null;
    experience: TrainingExperience | null;
    days: DaysPerWeek | null;
    equipment: PlanEquipment;
    minutes: PlanLength;
    kind: PlanKind | null;
    /** Experienced path: skipped the best lifts ("Start fresh"). */
    fresh: boolean;
    /** Experienced path: brought their history in (steps 8 import, 9 your history). */
    imported: boolean;
    /** The split found in that history, kept: no days or plan steps, it's the plan. */
    historySplitId: string | null;
    /** "Your best lifts" rows as typed, in the display unit. */
    lifts: LiftRow[];
    style: TrainingStyle;
  };
  type LiftRow = { exerciseId?: string; name: string; weight: string; reps: string };
  const DEFAULT_LIFTS: LiftRow[] = ["Squat", "Bench Press", "Deadlift", "Overhead Press"].map((name) => ({ name, weight: "", reps: "" }));

  function loadAnswers(): Answers {
    const empty: Answers = { goal: null, experience: null, days: null, equipment: "gym", minutes: 45, kind: null, fresh: false, imported: false, historySplitId: null, lifts: DEFAULT_LIFTS, style: "adaptive" };
    try {
      const raw = getAccountItem(ANSWERS_KEY);
      return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Answers>) } : empty;
    } catch {
      return empty;
    }
  }

  let answers = $state<Answers>(loadAnswers());
  const step = $derived($onboarding.step);
  let building = $state(false);
  let showOtherPlans = $state(false);
  let busy = $state<"start" | "later" | "own" | null>(null);
  let error = $state<string | null>(null);

  function save(patch: Partial<Answers>) {
    answers = { ...answers, ...patch };
    setAccountItem(ANSWERS_KEY, JSON.stringify(answers));
  }

  // Steps: 0 welcome, 1 goal, 2 experience, 3 days, 4 plan. "2+ years" and "I compete" also
  // get 5 pick up where you left off, 6 your best lifts (before days) and 7 train your way
  // (after the plan); design canvas row E. Importing their history instead: 8 import, then 9
  // your history (E2), whose found split can replace days and plan. An old saved step past the
  // end (the name step of the previous onboarding) starts again from the goal.
  const experienced = $derived(answers.experience === "2plus" || answers.experience === "compete");
  onMount(() => {
    const broken = step > 9 || (step >= 2 && !answers.goal) || (step >= 3 && !answers.experience)
      || (step === 4 && !answers.days) || (step === 7 && !answers.days && !answers.historySplitId) || (step >= 5 && !experienced);
    if (broken) onboarding.setStep(answers.goal ? 2 : 1);
    else if (step === 9) void loadHistory();
    if (answers.historySplitId) void getSplitRepo().getSplit(answers.historySplitId).then((sp) => (historySplit = sp));
  });

  /** Where Back goes: the path taken, not the step number. */
  function prevStep(s: number): number {
    if (s === 3) return experienced ? (answers.imported ? 9 : answers.fresh ? 5 : 6) : 2;
    if (s === 7) return answers.historySplitId ? 9 : 4;
    return ({ 1: 0, 2: 1, 4: 3, 5: 2, 6: 5, 8: 5, 9: 5 } as Record<number, number>)[s] ?? 0;
  }
  /** [this step, of how many] for the progress bar. */
  const progress = $derived.by((): [number, number] => {
    if (!experienced) return [step, 4];
    const order = answers.imported
      ? answers.historySplitId ? [1, 2, 5, 8, 9, 7] : [1, 2, 5, 8, 9, 3, 4, 7]
      : answers.fresh ? [1, 2, 5, 3, 4, 7] : [1, 2, 5, 6, 3, 4, 7];
    return [order.indexOf(step) + 1, order.length];
  });

  // Android back: the previous step, and out of the app from the welcome screen even when the
  // WebView still has history (after deleting or signing out of the last account).
  $effect(() => onBack(() => (step > 0 ? go(prevStep(step)) : void import("@capacitor/app").then(({ App }) => App.exitApp()))));

  function go(next: number) {
    onboarding.setStep(next);
    if (next === 4) {
      // About a second of the plan visibly filling in from the answers, never longer
      // (skipped for anyone who has asked for less motion).
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) {
        building = true;
        setTimeout(() => (building = false), 900);
      }
    }
  }

  const GOALS: TrainingGoal[] = ["strength", "muscle", "both", "fit", "leaner"];
  const EXPERIENCE: { id: TrainingExperience; title: string; blurb: string }[] = [
    { id: "new", title: "Just starting", blurb: "A simple plan; we'll show you the ropes" },
    { id: "under2", title: "Under 2 years", blurb: "Steady progress that keeps coming" },
    { id: "2plus", title: "2+ years", blurb: "A plan that keeps up with you" },
    { id: "compete", title: "I compete", blurb: "Powerlifting: the big three come first" },
  ];
  const DAYS: { days: DaysPerWeek; label: string; blurb: string }[] = [
    { days: 2, label: "2 days", blurb: "Busy weeks" },
    { days: 3, label: "3 days", blurb: "Steady progress" },
    { days: 4, label: "4 days", blurb: "The sweet spot" },
    { days: 5, label: "5–6 days", blurb: "All in" },
  ];
  const WEEK = [1, 2, 3, 4, 5, 6, 0];
  const WEEK_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

  const echo = $derived(answers.goal ? GOAL_LABELS[answers.goal].echo : "");
  const plan = $derived(
    answers.goal && answers.experience && answers.days
      ? buildStarterPlan(
          { goal: answers.goal, experience: answers.experience, days: answers.days, equipment: answers.equipment, minutes: answers.minutes },
          answers.kind ?? planKindFor(answers.days),
        )
      : null,
  );
  const firstDay = $derived(plan?.days[0] ?? null);

  function pickGoal(goal: TrainingGoal) {
    save({ goal });
    go(2);
  }
  function pickExperience(experience: TrainingExperience) {
    save({ experience });
    go(experience === "2plus" || experience === "compete" ? 5 : 3);
  }

  // ── Your best lifts ──
  const unit = $derived($profile.weightUnit);
  let addingLift = $state(false);
  function setLift(i: number, patch: Partial<LiftRow>) {
    save({ lifts: answers.lifts.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  }
  function liftNumbers(l: LiftRow): { weight: number; reps: number } | null {
    const weight = Number(l.weight.replace(",", "."));
    const reps = Math.round(Number(l.reps));
    return weight > 0 && reps >= 1 && reps <= 30 ? { weight, reps } : null;
  }
  function liftMax(l: LiftRow): string | null {
    const n = liftNumbers(l);
    return n ? `≈ ${trimWeight(Math.round(estimated1RM(n.weight, Math.min(n.reps, 12))))} ${unit} max` : null;
  }
  async function addLift(sel: { name: string; exerciseId?: string }) {
    addingLift = false;
    if (answers.lifts.some((l) => l.name.toLowerCase() === sel.name.toLowerCase())) return;
    let exerciseId = sel.exerciseId;
    // One LogIt doesn't know becomes your own exercise now; its muscles are asked for the
    // first time it's in a workout (FinishSetupCard).
    if (!exerciseId) {
      const created = await getExerciseRepo().create(sel.name.trim()).catch(() => null);
      if (created) pushExercise(created);
      exerciseId = created?.id;
    }
    save({ lifts: [...answers.lifts, { exerciseId, name: sel.name.trim(), weight: "", reps: "" }] });
  }
  function commitLifts() {
    const now = Date.now();
    saveStartingLifts(answers.lifts.flatMap((l) => {
      const n = liftNumbers(l);
      return n ? [{ exerciseId: l.exerciseId, exerciseName: l.name, weightKg: fromDisplayWeight(n.weight, unit), reps: n.reps, enteredAtMs: now }] : [];
    }));
    save({ fresh: false, imported: false, historySplitId: null });
    go(3);
  }
  function startFresh() {
    saveStartingLifts([]);
    save({ fresh: true, imported: false, historySplitId: null });
    go(3);
  }
  function pickDays(days: DaysPerWeek) {
    save({ days, kind: null });
    go(4);
  }

  // ── Your history (E2) ──
  let history = $state<HistorySummary | null>(null);
  let detected = $state<DetectedSplit | null>(null);
  let historySplit = $state<WorkoutSplit | null>(null);

  async function loadHistory() {
    const sessions = (await getWorkoutRepo().listAllSessions()).filter((x) => x.endedAtMs != null);
    history = summariseHistory(sessions);
    detected = detectSplit(sessions);
  }
  async function afterImport() {
    save({ imported: true, fresh: false, historySplitId: null });
    await loadHistory();
    go(9);
  }
  async function keepSplit() {
    if (!detected) return;
    const names = detected.days.map((d) => d.name);
    const split = splitFromDetected($state.snapshot(detected) as DetectedSplit, names.length <= 3 ? names.join(" / ") : "My split");
    await saveSplit(split);
    await splits.setActive(split.id);
    goalsStore.setWeeklyTarget(detected.daysPerWeek);
    historySplit = split;
    save({ historySplitId: split.id });
    go(7);
  }
  function changeSplit() {
    historySplit = null;
    save({ historySplitId: null });
    go(3);
  }
  /** Today's day of the found split, else its first. */
  const historyDay = $derived(historySplit ? (historySplit.days.find((d) => d.weekday === new Date().getDay()) ?? historySplit.days[0] ?? null) : null);
  const startName = $derived(historyDay?.name ?? firstDay?.name ?? "");
  function sparkPoints(kgs: number[]): string {
    const lo = Math.min(...kgs), hi = Math.max(...kgs);
    return kgs.map((kg, i) => `${kgs.length === 1 ? 60 : (i / (kgs.length - 1)) * 120},${hi === lo ? 14 : 26 - ((kg - lo) / (hi - lo)) * 24}`).join(" ");
  }
  const toDisplay = (kg: number) => toDisplayWeight(kg, unit);
  const years = $derived(history ? (history.lastAtMs - history.firstAtMs) / (365.25 * 86_400_000) : 0);

  /** Saves the plan as the active split, its rep ranges and the weekly target; ends onboarding. */
  async function savePlan(): Promise<WorkoutSplit> {
    // The split found in their history is already saved and active.
    if (answers.historySplitId && historySplit) {
      if (answers.goal) setTrainingGoal(answers.goal);
      resetTours();
      onboarding.complete();
      return historySplit;
    }
    if (!plan) throw new Error("No plan yet");
    const split = await saveStarterPlan(plan, answers.goal ?? undefined);
    resetTours();
    onboarding.complete();
    return split;
  }

  async function startNow() {
    busy = "start";
    error = null;
    try {
      if (experienced) await applyTrainingStyle(answers.style);
      if (experienced && answers.style === "own") {
        await savePlan();
        await goto("/settings/progression/build/new?use=1");
        return;
      }
      const split = await savePlan();
      // Planned like the plan screen does, and kept with where it came from (its name in the history).
      const day = (split.id === historySplit?.id ? historyDay : null) ?? split.days[0]!;
      const { session } = await planSplitDay(day);
      await currentSession.startPlanned({ ...session, source: sourceFromSplitDay(split, day, session) });
      await goto("/session/current");
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't start. Try again.";
      busy = null;
    }
  }

  async function startLater() {
    busy = "later";
    error = null;
    try {
      if (experienced) await applyTrainingStyle(answers.style === "own" ? "adaptive" : answers.style);
      await savePlan();
      await goto("/");
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save the plan. Try again.";
      busy = null;
    }
  }

  async function buildMyOwn() {
    busy = "own";
    try {
      const split = createSplit("My split");
      await saveSplit(split);
      await splits.setActive(split.id);
      if (answers.days) goalsStore.setWeeklyTarget(answers.days);
      resetTours();
      onboarding.complete();
      await goto(`/splits/${split.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't make the split. Try again.";
      busy = null;
    }
  }

  function setsLabel(ex: { sets: number; repRange: [number, number] }) {
    return `${ex.sets} × ${ex.repRange[0]}–${ex.repRange[1]}`;
  }
</script>

{#snippet header(extra?: import("svelte").Snippet)}
  <div class="flex items-center justify-between min-h-11">
    <button type="button" class="flex items-center gap-1 min-h-11 text-sm text-muted-foreground" onclick={() => go(prevStep(step))}>
      <ArrowLeft class="h-4 w-4" /> Back
    </button>
    {@render extra?.()}
  </div>
  <div class="grid gap-1 mt-2 mb-7" style="grid-template-columns: repeat({progress[1]}, minmax(0, 1fr))" role="img" aria-label="Step {progress[0]} of {progress[1]}">
    {#each Array.from({ length: progress[1] }, (_, i) => i + 1) as s (s)}
      <span class="h-1 rounded-full transition-colors {s <= progress[0] ? 'bg-primary' : 'bg-muted'}"></span>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col min-h-screen bg-background text-foreground">
  {#if step === 0}
    <div class="flex flex-col flex-1 items-center justify-center gap-9 px-8 text-center" in:fade={{ duration: 150 }}>
      <div class="flex flex-col items-center gap-4">
        <div class="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground">
          <Logo size={36} />
        </div>
        <div>
          <h1 class="text-3xl font-bold tracking-tight">LogIt</h1>
          <p class="mt-2 text-[15px] text-muted-foreground">Get stronger every week,<br />without guessing the weights.</p>
        </div>
      </div>
      <div class="flex flex-col gap-2.5 w-full max-w-[300px] text-left text-sm text-muted-foreground">
        <p class="flex items-center gap-2.5"><span class="font-semibold text-foreground">✓</span> Know what to lift, every set</p>
        <p class="flex items-center gap-2.5"><span class="font-semibold text-foreground">✓</span> See yourself getting stronger, week by week</p>
        <p class="flex items-center gap-2.5"><span class="font-semibold text-foreground">✓</span> Start in under a minute, no account needed</p>
      </div>
      <div class="flex flex-col gap-3 w-full max-w-[300px]">
        <button type="button" class="h-12 rounded-lg bg-primary text-primary-foreground text-[15px] font-medium" onclick={() => go(1)}>
          Get started
        </button>
        <button type="button" class="h-12 rounded-lg border border-border text-[15px] font-medium" onclick={() => goto("/auth?mode=login")}>
          I already have an account
        </button>
      </div>
    </div>

  {:else if step === 1}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header()}
      <h2 class="text-2xl font-bold leading-tight mb-1.5">What do you want from training?</h2>
      <p class="text-sm text-muted-foreground mb-6">Your plan and weights are built around it.</p>
      <div class="flex flex-col gap-2">
        {#each GOALS as goal (goal)}
          <button type="button"
            class="flex flex-col gap-0.5 min-h-[66px] rounded-xl px-4 py-3 text-left {answers.goal === goal ? 'border-2 border-primary bg-muted/50' : 'border border-border'}"
            onclick={() => pickGoal(goal)}>
            <span class="text-base font-semibold">{GOAL_LABELS[goal].title}</span>
            <span class="text-sm text-muted-foreground">{GOAL_LABELS[goal].blurb}</span>
          </button>
        {/each}
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2">
        <button type="button" class="min-h-11 rounded-[10px] bg-muted text-sm font-medium" onclick={() => goto("/onboarding/coaching")}>I coach people</button>
        <button type="button" class="min-h-11 rounded-[10px] bg-muted text-sm font-medium" onclick={() => goto("/onboarding/coach")}>I have a coach</button>
      </div>
    </div>

  {:else if step === 2}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header()}
      <p class="text-[13px] font-semibold text-muted-foreground mb-1.5">{echo}</p>
      <h2 class="text-2xl font-bold leading-tight mb-6">How long have you been lifting?</h2>
      <div class="flex flex-col gap-2.5">
        {#each EXPERIENCE as e (e.id)}
          <button type="button"
            class="flex flex-col gap-0.5 min-h-16 rounded-xl px-4 py-3.5 text-left {answers.experience === e.id ? 'border-2 border-primary bg-muted/50' : 'border border-border'}"
            onclick={() => pickExperience(e.id)}>
            <span class="text-base font-semibold">{e.title}</span>
            <span class="text-sm text-muted-foreground">{e.blurb}</span>
          </button>
        {/each}
      </div>
    </div>

  {:else if step === 3}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header()}
      <p class="text-[13px] font-semibold text-muted-foreground mb-1.5">{echo}</p>
      <h2 class="text-2xl font-bold leading-tight mb-6">How many days a week can you train?</h2>
      <div class="flex flex-col gap-2.5">
        {#each DAYS as d (d.days)}
          <button type="button"
            class="flex items-center justify-between min-h-14 rounded-xl px-4 text-left {answers.days === d.days ? 'border-2 border-primary bg-muted/50' : 'border border-border'}"
            onclick={() => pickDays(d.days)}>
            <span class="text-base font-semibold">{d.label}</span>
            <span class="text-[13px] text-muted-foreground">{d.blurb}</span>
          </button>
        {/each}
      </div>
      <button type="button" class="mt-2 min-h-11 text-sm text-muted-foreground" onclick={() => pickDays(3)}>
        Not sure? Start with 3, change it any time
      </button>
    </div>

  {:else if step === 5}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header()}
      <h2 class="text-2xl font-bold leading-tight mb-1.5">Pick up where you left off</h2>
      <p class="text-sm text-muted-foreground mb-6">LogIt plans from your real numbers, not from zero.</p>
      <div class="flex flex-col gap-2.5">
        <button type="button" class="flex flex-col gap-0.5 min-h-[72px] rounded-xl bg-primary px-4 py-3.5 text-left text-primary-foreground" onclick={() => go(8)}>
          <span class="text-base font-semibold">Import my history</span>
          <span class="text-sm opacity-80">Every workout, set and PR, from a spreadsheet</span>
        </button>
        <button type="button" class="flex flex-col gap-0.5 min-h-16 rounded-xl border border-border px-4 py-3 text-left" onclick={() => go(6)}>
          <span class="text-base font-semibold">Just enter my best lifts</span>
          <span class="text-sm text-muted-foreground">A recent heavy set or a max, for the lifts you care about</span>
        </button>
        <button type="button" class="min-h-12 rounded-xl px-4 text-left text-sm text-muted-foreground" onclick={startFresh}>
          Start fresh
        </button>
      </div>
    </div>

  {:else if step === 6}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {#snippet unitToggle()}
        <div class="grid grid-cols-2 rounded-lg bg-muted p-[3px]" role="group" aria-label="Units">
          {#each [["kg", "kg"], ["lbs", "lb"]] as [u, label] (u)}
            <button type="button" aria-pressed={unit === u}
              class="h-8 min-w-11 rounded-md text-[13px] transition-colors {unit === u ? 'bg-background font-semibold shadow-sm' : 'font-medium text-muted-foreground'}"
              onclick={() => profile.save({ weightUnit: u as "kg" | "lbs" })}>{label}</button>
          {/each}
        </div>
      {/snippet}
      {@render header(unitToggle)}
      <h2 class="text-2xl font-bold leading-tight mb-1.5">Your best lifts</h2>
      <p class="text-sm text-muted-foreground mb-5">A recent heavy set is enough, a max works too. Your first sets are planned from these.</p>
      <ul class="flex flex-col rounded-xl border border-border">
        {#each answers.lifts as lift, i (lift.name)}
          {@const max = liftMax(lift)}
          <li class="grid grid-cols-[minmax(0,1fr)_68px_10px_50px_36px] items-center gap-1.5 py-2.5 pl-3.5 pr-1.5 {i > 0 ? 'border-t border-border' : ''}" transition:fade={{ duration: 150 }}>
            <div class="flex min-w-0 flex-col gap-0.5">
              <label for="lift-{i}" class="truncate text-[15px] font-semibold">{lift.name}</label>
              <span class="text-xs {max ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}">{max ?? "Leave empty to skip"}</span>
            </div>
            <input id="lift-{i}" type="text" inputmode="decimal" placeholder={unit === "lbs" ? "lb" : "kg"} value={lift.weight}
              aria-label="{lift.name} weight, {unit}"
              class="h-11 min-w-0 rounded-lg border border-input bg-background px-2 text-right text-[15px] font-semibold tabular-nums"
              oninput={(e) => setLift(i, { weight: (e.currentTarget as HTMLInputElement).value })} />
            <span class="text-center text-sm text-muted-foreground" aria-hidden="true">×</span>
            <input type="text" inputmode="numeric" placeholder="reps" value={lift.reps} aria-label="{lift.name} reps"
              class="h-11 min-w-0 rounded-lg border border-input bg-background px-2 text-right text-[15px] font-semibold tabular-nums"
              oninput={(e) => setLift(i, { reps: (e.currentTarget as HTMLInputElement).value })} />
            <button type="button" class="flex h-11 w-9 items-center justify-center text-muted-foreground" aria-label="Remove {lift.name}"
              onclick={() => save({ lifts: answers.lifts.filter((_, j) => j !== i) })}>
              <X class="h-4 w-4" />
            </button>
          </li>
        {/each}
      </ul>
      {#if addingLift}
        <div class="mt-2.5" transition:fade={{ duration: 150 }}>
          <ExerciseSearchInput placeholder="e.g. Front Squat" onConfirm={(sel) => void addLift(sel)} />
        </div>
      {:else}
        <button type="button" class="mt-2.5 flex h-12 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-muted-foreground/50 text-sm font-medium"
          onclick={() => (addingLift = true)}>
          <Plus class="h-4 w-4" /> Add a lift
        </button>
      {/if}
      <div class="flex-1 min-h-6"></div>
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold" onclick={commitLifts}>Continue</button>
      <button type="button" class="mt-2 h-11 rounded-[10px] border border-border text-sm font-medium" onclick={startFresh}>Skip, I'll pick weights in my first workout</button>
    </div>

  {:else if step === 8}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      <!-- A CSV shared to LogIt before onboarding was done is opened here ("onboarding"). -->
      <ImportFlow onexit={() => go(5)} ondone={() => void afterImport()} shared="onboarding" />
    </div>

  {:else if step === 9}
    <div class="flex flex-col flex-1 gap-3.5 px-5 pt-12 pb-7" in:fade={{ duration: 150 }}>
      {#if history}
        <div>
          <p class="mb-1 text-[13px] font-semibold text-muted-foreground">Your history, imported</p>
          <h2 class="text-2xl font-bold leading-tight">
            {years >= 1 ? `${years >= 1.5 ? Math.round(years) : 1} year${years >= 1.5 ? "s" : ""} of training, all here` : `${history.workouts} workouts, all here`}
          </h2>
        </div>
        <div class="grid grid-cols-3 gap-2">
          {#each [[history.workouts, "workouts"], [history.prs, "PRs found"], [history.exercises, "exercises"]] as [n, label] (label)}
            <div class="rounded-[10px] bg-muted p-2.5 text-center"><p class="text-xl font-bold tabular-nums">{n}</p><p class="text-xs text-muted-foreground">{label}</p></div>
          {/each}
        </div>
        {#if history.lifts.length}
          <div class="flex flex-col rounded-xl border border-border">
            <div class="flex items-baseline justify-between px-3.5 pt-3 pb-1">
              <span class="text-sm font-semibold">Estimated max{history.lifts[0]!.months.length > 1 ? `, since ${new Date(history.lifts[0]!.months[0]!.monthMs).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""}</span>
              <span class="text-xs text-muted-foreground">{unit}</span>
            </div>
            {#each history.lifts as lift (lift.name)}
              {@const gain = Math.round(toDisplay(lift.lastKg - lift.firstKg))}
              <div class="grid grid-cols-[92px_minmax(0,1fr)_88px] items-center gap-2 px-3.5 py-2">
                <span class="truncate text-sm">{lift.name}</span>
                <svg viewBox="0 0 120 28" class="h-7 w-full" role="img" aria-label="{lift.name} estimated max, {Math.round(toDisplay(lift.firstKg))} to {Math.round(toDisplay(lift.lastKg))} {unit}">
                  <polyline points={sparkPoints(lift.months.map((m) => m.kg))} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-right text-sm tabular-nums"><strong>{Math.round(toDisplay(lift.lastKg))}</strong>{#if gain > 0} <span class="text-xs text-green-700 dark:text-green-400">+{gain}</span>{/if}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if detected}
          <div class="flex flex-col gap-2 rounded-xl bg-muted p-3.5">
            <span class="text-sm font-semibold">We found your split</span>
            <span class="text-sm text-muted-foreground">{detected.daysPerWeek} day{detected.daysPerWeek === 1 ? "" : "s"} a week: {detected.days.map((d) => d.name).join(", ")}, from your last 6 weeks.</span>
            <div class="flex gap-2">
              <button type="button" class="h-11 flex-1 rounded-lg bg-primary text-sm font-medium text-primary-foreground" onclick={() => void keepSplit()}>Keep it</button>
              <button type="button" class="h-11 flex-1 rounded-lg border border-border bg-background text-sm font-medium" onclick={changeSplit}>Change it</button>
            </div>
          </div>
        {:else}
          <div class="flex-1"></div>
          <button type="button" class="h-[52px] rounded-[10px] bg-primary text-base font-semibold text-primary-foreground" onclick={changeSplit}>Continue</button>
        {/if}
      {:else}
        <Loader2 class="mx-auto mt-24 h-6 w-6 animate-spin text-muted-foreground" />
      {/if}
    </div>

  {:else if step === 7 && (historySplit || (plan && firstDay))}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header()}
      <h2 class="text-2xl font-bold leading-tight mb-1.5">Train your way</h2>
      <p class="text-sm text-muted-foreground mb-5">Pick what sets the weights. You can change it for any exercise later.</p>
      <div class="flex flex-col gap-2">
        {#each TRAINING_STYLES as t (t.id)}
          <button type="button" aria-pressed={answers.style === t.id}
            class="flex flex-col gap-0.5 min-h-[60px] rounded-xl px-3.5 py-3 text-left transition-colors {answers.style === t.id ? 'border-2 border-primary bg-muted/50' : t.id === 'own' ? 'border border-dashed border-muted-foreground/60' : 'border border-border'}"
            onclick={() => save({ style: t.id })}>
            <span class="flex w-full items-center justify-between gap-2">
              <span class="text-[15px] font-semibold">{t.title}</span>
              {#if t.id === "adaptive"}<span class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Recommended</span>{/if}
            </span>
            <span class="text-[13px] text-muted-foreground">{t.blurb}</span>
          </button>
        {/each}
      </div>
      <div class="flex-1 min-h-6"></div>
      {#if error}<p class="mb-2 text-sm text-destructive" role="alert">{error}</p>{/if}
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        disabled={busy !== null} onclick={() => void startNow()}>
        {#if busy === "start"}<Loader2 class="h-4 w-4 animate-spin" />{/if}
        {answers.style === "own" ? "Set up my rules" : `Start ${startName} now`}
      </button>
      <button type="button" class="min-h-11 text-sm text-muted-foreground" disabled={busy !== null} onclick={() => void startLater()}>
        I'll start later
      </button>
    </div>

  {:else if plan && firstDay}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header()}
      <p class="text-[13px] font-semibold text-muted-foreground mb-1.5">Your plan</p>
      <h2 class="text-2xl font-bold leading-tight mb-3">{echo} in {plan.daysPerWeek} days a week</h2>
      <div class="flex flex-wrap gap-2 mb-3.5">
        <label class="relative">
          <span class="sr-only">Equipment</span>
          <select class="h-9 appearance-none rounded-full border border-border bg-background pl-3 pr-8 text-[13px] font-medium"
            value={answers.equipment} onchange={(e) => save({ equipment: (e.currentTarget as HTMLSelectElement).value as PlanEquipment })}>
            {#each Object.entries(EQUIPMENT_LABELS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </label>
        <label class="relative">
          <span class="sr-only">Workout length</span>
          <select class="h-9 appearance-none rounded-full border border-border bg-background pl-3 pr-8 text-[13px] font-medium"
            value={String(answers.minutes)} onchange={(e) => save({ minutes: Number((e.currentTarget as HTMLSelectElement).value) as PlanLength })}>
            {#each Object.entries(LENGTH_LABELS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        </label>
      </div>

      <div class="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-base font-semibold">{plan.name}</span>
          <button type="button" class="min-h-11 -my-3 text-[13px] text-muted-foreground underline" onclick={() => (showOtherPlans = !showOtherPlans)}>
            {showOtherPlans ? "Hide" : "Other plans"}
          </button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center" aria-label="Training days">
          {#each WEEK as wd, i (wd)}
            {@const day = plan.days.find((d) => d.weekday === wd)}
            <span class="flex flex-col gap-1 text-[11px] text-muted-foreground">
              {WEEK_LETTERS[wd]}
              <span class="h-7 rounded-md flex items-center justify-center text-[11px] font-semibold {day ? (i % 2 ? 'bg-primary/80 text-primary-foreground' : 'bg-primary text-primary-foreground') : 'bg-muted'}"
                aria-label={day ? day.name : "Rest"}>
                {#if day && !building}{day.short}{/if}
              </span>
            </span>
          {/each}
        </div>
        {#if showOtherPlans}
          <ul class="flex flex-col border-t border-border pt-2">
            {#each otherPlanKinds(plan.kind) as other (other.kind)}
              <li>
                <button type="button" class="flex w-full min-h-11 items-center justify-between text-left text-sm"
                  onclick={() => { save({ kind: other.kind }); showOtherPlans = false; }}>
                  <span class="font-medium">{other.name}</span>
                  <span class="text-muted-foreground">{other.daysPerWeek} days</span>
                </button>
              </li>
            {/each}
            <li>
              <button type="button" class="flex w-full min-h-11 items-center text-left text-sm font-medium" disabled={busy !== null} onclick={() => void buildMyOwn()}>
                Build my own
              </button>
            </li>
          </ul>
        {/if}
      </div>

      <div class="mt-4 flex flex-col gap-2 rounded-xl bg-muted p-4">
        <p class="text-sm font-semibold">First up: {firstDay.name} · about {firstDay.minutes} min</p>
        <ul class="flex flex-col gap-1.5 text-sm">
          {#each firstDay.exercises as ex, i (ex.name)}
            {#if building}
              <li class="h-5 rounded bg-background/70 animate-pulse" style="animation-delay: {i * 120}ms"></li>
            {:else}
              <li class="flex justify-between gap-3" in:fade={{ duration: 120, delay: i * 60 }}>
                <span>{ex.name}</span><span class="text-muted-foreground tabular-nums">{setsLabel(ex)}</span>
              </li>
            {/if}
          {/each}
        </ul>
      </div>

      <div class="flex-1 min-h-6"></div>
      {#if error}<p class="mb-2 text-sm text-destructive" role="alert">{error}</p>{/if}
      {#if experienced}
        <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold disabled:opacity-60"
          disabled={building} onclick={() => go(7)}>Continue</button>
      {:else}
        <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          disabled={busy !== null || building} onclick={() => void startNow()}>
          {#if busy === "start"}<Loader2 class="h-4 w-4 animate-spin" />{/if}
          Start {firstDay.name} now
        </button>
        <button type="button" class="min-h-11 text-sm text-muted-foreground" disabled={busy !== null} onclick={() => void startLater()}>
          I'll start later
        </button>
      {/if}
    </div>
  {/if}
</div>
