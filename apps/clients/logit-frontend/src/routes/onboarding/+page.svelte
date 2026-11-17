<script lang="ts">
  // First launch (design canvas row 2: welcome, O1 goal, E0 experience, O2 days, O3 plan).
  // One tap per question, no Continue buttons, no account or name: four taps from "Get
  // started" to a workout. The answers build a plan (core domain/starterPlan.ts) that is
  // saved as an ordinary split on a weekday schedule, with each exercise's rep range set
  // from the goal and the days a week as the weekly target.
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { ArrowLeft, ChevronDown, Dumbbell, Loader2 } from "lucide-svelte";

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
  };

  function loadAnswers(): Answers {
    const empty: Answers = { goal: null, experience: null, days: null, equipment: "gym", minutes: 45, kind: null };
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

  // Steps: 0 welcome, 1 goal, 2 experience, 3 days, 4 plan. An old saved step past the end
  // (the name step of the previous onboarding) starts again from the goal.
  onMount(() => {
    if (step > 4 || (step >= 2 && !answers.goal) || (step >= 3 && !answers.experience) || (step === 4 && !answers.days)) onboarding.setStep(answers.goal ? 2 : 1);
  });

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
    go(3);
  }
  function pickDays(days: DaysPerWeek) {
    save({ days, kind: null });
    go(4);
  }

  /** Saves the plan as the active split, its rep ranges and the weekly target; ends onboarding. */
  async function savePlan() {
    if (!plan) throw new Error("No plan yet");
    const split = await saveStarterPlan(plan);
    resetTours();
    onboarding.complete();
    return split;
  }

  async function startNow() {
    busy = "start";
    error = null;
    try {
      const split = await savePlan();
      // Planned like the plan screen does, and kept with where it came from (its name in the history).
      const day = split.days[0]!;
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

{#snippet header(back: number, current: number)}
  <div class="flex items-center min-h-11">
    <button type="button" class="flex items-center gap-1 min-h-11 text-sm text-muted-foreground" onclick={() => go(back)}>
      <ArrowLeft class="h-4 w-4" /> Back
    </button>
  </div>
  <div class="grid grid-cols-4 gap-1 mt-2 mb-7" role="img" aria-label="Step {current} of 4">
    {#each [1, 2, 3, 4] as s (s)}
      <span class="h-1 rounded-full {s <= current ? 'bg-primary' : 'bg-muted'}"></span>
    {/each}
  </div>
{/snippet}

<div class="flex flex-col min-h-screen bg-background text-foreground">
  {#if step === 0}
    <div class="flex flex-col flex-1 items-center justify-center gap-9 px-8 text-center" in:fade={{ duration: 150 }}>
      <div class="flex flex-col items-center gap-4">
        <div class="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center">
          <Dumbbell class="h-8 w-8 text-primary-foreground" />
        </div>
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Logit</h1>
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
      {@render header(0, 1)}
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
      {@render header(1, 2)}
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
      {@render header(2, 3)}
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

  {:else if plan && firstDay}
    <div class="flex flex-col flex-1 px-6 pt-10 pb-7" in:fade={{ duration: 150 }}>
      {@render header(3, 4)}
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
      <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        disabled={busy !== null || building} onclick={() => void startNow()}>
        {#if busy === "start"}<Loader2 class="h-4 w-4 animate-spin" />{/if}
        Start {firstDay.name} now
      </button>
      <button type="button" class="min-h-11 text-sm text-muted-foreground" disabled={busy !== null} onclick={() => void startLater()}>
        I'll start later
      </button>
    </div>
  {/if}
</div>
