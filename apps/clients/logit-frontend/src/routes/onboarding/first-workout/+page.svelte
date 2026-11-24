<script lang="ts">
  // After the first workout of a plan from onboarding (design canvas O5, then O6): where the
  // week stands, what next time looks like, and "When will you train?" with a reminder, said
  // back as one sentence (a when-and-where plan roughly doubles follow-through). Then, with no
  // account, the offer to save the training. `?save=again` (after workout 3) shows only that.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { Loader2 } from "lucide-svelte";
  import Switch from "$lib/components/ui/switch/Switch.svelte";
  import { TimeField } from "$lib/components/ui/time-field";
  import { apiClient } from "@logit/core/api/client";
  import { getWorkoutRepo } from "$lib/data/repoProvider";
  import { activeSplit } from "$lib/stores/activeSplit.store";
  import { profile } from "$lib/stores/profile.store";
  import { goalsStore } from "$lib/features/goals/goalsStore";
  import { saveSplit } from "$lib/usecases/Splits/saveSplit";
  import { getProgressionDeps } from "$lib/usecases/progressionDeps";
  import { getSuggestion } from "@logit/core/usecases/progression/getSuggestion";
  import { getExercises } from "@logit/core/domain/workout";
  import { formatWeight } from "@logit/core/domain/units";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import type { WorkoutSplit } from "@logit/core/domain/WorkoutSplit";
  import { canRemind, getWorkoutReminders, mondayFirst, reminderSentence, setWorkoutReminders } from "$lib/features/onboarding/workoutReminders";
  import { markSaveAsked } from "$lib/features/onboarding/afterWorkout";
  import { planWeek } from "@logit/core/domain/weekPlan";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { planStartIso } from "$lib/features/onboarding/firstWeek";

  const saveOnly = page.url.searchParams.get("save") === "again";
  const sessionId = page.url.searchParams.get("id") ?? "";

  let session = $state<WorkoutSession | null>(null);
  let split = $state<WorkoutSplit | null>(null);
  let doneThisWeek = $state(1);
  /** Workouts that still fit this week (started on a Sunday: just today's), like Home's card. */
  let fits = $state<number | null>(null);
  let workoutsSoFar = $state(1);
  let nextTime = $state<{ name: string; text: string }[]>([]);
  let liftCount = $state(0);
  let weekdays = $state<number[]>([]);
  let time = $state("07:00");
  let remind = $state(canRemind());
  let explainReminder = $state(false);
  let saving = $state(false);
  let reminderNote = $state<string | null>(null);
  let showSave = $state(saveOnly);

  const weekly = $derived(get(goalsStore).streak.weeklyTarget || split?.days.filter((d) => !d.rest).length || 3);
  const target = $derived(fits !== null && fits < weekly ? Math.max(fits, doneThisWeek) : weekly);
  const workoutDays = $derived(split?.days.filter((d) => !d.rest) ?? []);
  const needed = $derived(split?.schedule === "weekdays" ? workoutDays.length : 0);
  const sentence = $derived(weekdays.length ? reminderSentence(weekdays, time) : "");
  const canConfirm = $derived(!saving && (needed === 0 || weekdays.length === needed));

  const WEEK = [1, 2, 3, 4, 5, 6, 0];
  const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  onMount(async () => {
    if (saveOnly) {
      workoutsSoFar = (await getWorkoutRepo().listAllSessions()).length || 3;
      return;
    }
    // The workout is still being saved when this opens: wait for it briefly.
    for (let i = 0; i < 30 && !session; i++) {
      session = await getWorkoutRepo().getSession(sessionId).catch(() => null);
      if (!session) await new Promise((r) => setTimeout(r, 100));
    }
    split = get(activeSplit);
    weekdays = split?.schedule === "weekdays" ? workoutDaysOf(split) : [];
    const started = session?.startedAtMs ?? Date.now();
    const d = new Date(started);
    const mins = Math.round((d.getHours() * 60 + d.getMinutes()) / 30) * 30;
    time = `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    const all = await getWorkoutRepo().listAllSessions();
    workoutsSoFar = all.length;
    doneThisWeek = new Set(all.filter((s) => s.startedAtMs >= weekStart()).map((s) => new Date(s.startedAtMs).toDateString())).size || 1;
    if (split?.schedule === "weekdays") {
      const w = planWeek(split, all, localDateIso(new Date()), planStartIso());
      fits = w.onSchedule;
    }
    if (session) {
      const lifts = getExercises(session).filter((ex) => ex.sets.some((s) => s.completed));
      liftCount = lifts.length;
      const deps = getProgressionDeps();
      const unit = get(profile).weightUnit;
      const rows = await Promise.all(lifts.slice(0, 2).map(async (ex) => {
        const out = await getSuggestion({ id: ex.exerciseId, name: ex.exerciseName }, deps).catch(() => null);
        const first = out?.sets.find((s) => s.setType !== "warmup");
        if (!first || !first.weight) return null;
        const reps = Array.isArray(first.reps) ? first.reps[1] : first.reps;
        return { name: ex.exerciseName, text: `${formatWeight(first.weight, unit)} × ${reps}` };
      }));
      nextTime = rows.filter((r): r is { name: string; text: string } => r !== null);
    }
    const saved = getWorkoutReminders();
    if (saved?.permissionDenied) remind = false;
  });

  function workoutDaysOf(s: WorkoutSplit): number[] {
    return [...new Set(s.days.filter((d) => !d.rest && d.weekday !== undefined).map((d) => d.weekday!))];
  }

  function weekStart(): number {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return monday.getTime();
  }

  function toggleDay(wd: number) {
    weekdays = weekdays.includes(wd) ? weekdays.filter((d) => d !== wd) : [...weekdays, wd];
  }

  function toggleRemind() {
    remind = !remind;
    // Say what the reminders are before Android asks (design: notification priming).
    explainReminder = remind && !getWorkoutReminders()?.on;
  }

  async function confirm() {
    if (!canConfirm) return;
    saving = true;
    try {
      // The plan's days move to the weekdays picked, in order.
      if (split && needed > 0) {
        const days = mondayFirst(weekdays);
        let i = 0;
        const next: WorkoutSplit = {
          ...split,
          days: split.days.map((d) => (d.rest ? d : { ...d, weekday: days[i++] ?? d.weekday })),
          updatedAtMs: Date.now(),
        };
        await saveSplit(next);
        await activeSplit.load();
      }
      const dayNames: Record<number, string> = {};
      for (const d of get(activeSplit)?.days ?? []) if (d.weekday !== undefined && d.name) dayNames[d.weekday] = d.name;
      const result = await setWorkoutReminders({ on: remind, weekdays, time, dayNames, permissionDenied: getWorkoutReminders()?.permissionDenied });
      if (result === "denied" && remind) reminderNote = "Reminders are off. You can turn them on in Android's settings for LogIt.";
      if (!apiClient.isAuthenticated()) {
        showSave = true;
        saving = false;
        return;
      }
      await goto("/");
    } catch {
      saving = false;
    }
  }

  async function notNow() {
    markSaveAsked();
    await goto("/");
  }

  async function saveWithEmail() {
    markSaveAsked();
    await goto("/auth?mode=register");
  }
</script>

<div class="flex flex-col min-h-screen bg-background text-foreground px-6 pt-12 pb-7">
  {#if !saveOnly}
    <p class="text-[13px] font-semibold text-muted-foreground mb-1">Workout {doneThisWeek} of {target} this week{target < weekly ? ". Your first full week starts Monday" : ""}</p>
    <h1 class="text-[26px] font-bold mb-3.5">{session?.name || session?.source?.dayName || "Workout"}, done</h1>
    <div class="grid gap-1.5 mb-5" style="grid-template-columns: repeat({target}, minmax(0, 1fr))" role="img" aria-label="{doneThisWeek} of {target} workouts this week">
      {#each Array.from({ length: target }) as _, i (i)}
        <span class="h-2 rounded {i < doneThisWeek ? 'bg-primary' : 'bg-muted'}"></span>
      {/each}
    </div>

    {#if liftCount > 0}
      <div class="flex flex-col rounded-xl border border-border text-sm">
        <p class="px-3.5 py-3 font-semibold {nextTime.length ? 'border-b border-border' : ''}">Your starting point is set for {liftCount} lift{liftCount === 1 ? "" : "s"}</p>
        {#each nextTime as row, i (row.name)}
          <p class="flex justify-between px-3.5 py-2.5 {i < nextTime.length - 1 ? 'border-b border-border' : ''}">
            <span class="text-muted-foreground">Next time, {row.name}</span><span class="font-semibold tabular-nums">{row.text}</span>
          </p>
        {/each}
      </div>
    {/if}

    {#if needed > 0}
      <h2 class="mt-6 mb-2.5 text-[17px] font-bold">When will you train?</h2>
      <div class="grid grid-cols-7 gap-1.5" role="group" aria-label="Training days">
        {#each WEEK as wd (wd)}
          <button type="button" aria-pressed={weekdays.includes(wd)} aria-label={DAY_NAMES[wd]}
            class="h-11 rounded-lg text-sm font-semibold {weekdays.includes(wd) ? 'bg-primary text-primary-foreground' : 'border border-border'}"
            onclick={() => toggleDay(wd)}>{LETTERS[wd]}</button>
        {/each}
      </div>
      {#if weekdays.length !== needed}
        <p class="mt-1.5 text-xs text-muted-foreground">Pick {needed} days, one for each workout in your plan.</p>
      {/if}
    {/if}

    {#if canRemind()}
      <div class="mt-3 flex flex-col gap-2 rounded-xl bg-muted px-3.5 py-3">
        <div class="flex min-h-11 items-center justify-between gap-3">
          <span class="flex flex-col">
            <span class="text-[15px] font-medium">Remind me on those days</span>
            <span class="text-[13px] text-muted-foreground">At {time.replace(/^0(\d)/, "$1")}, with the day's workout</span>
          </span>
          <Switch checked={remind} label="Remind me on those days" onchange={toggleRemind} />
        </div>
        {#if remind}
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="text-muted-foreground">Time</span>
            <TimeField bind:value={time} aria-label="Reminder time" class="bg-background" />
          </div>
        {/if}
        {#if explainReminder}
          <p class="text-[13px] text-muted-foreground">One notification on your training days, nothing else. Android will ask if LogIt may send it.</p>
        {/if}
      </div>
    {/if}

    {#if sentence}
      <p class="mt-3.5 rounded-xl border border-border px-3.5 py-3 text-base leading-snug">{sentence}</p>
    {/if}
    {#if reminderNote}<p class="mt-2 text-sm text-muted-foreground">{reminderNote}</p>{/if}

    <div class="flex-1 min-h-6"></div>
    <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      disabled={!canConfirm} onclick={() => void confirm()}>
      {#if saving}<Loader2 class="h-4 w-4 animate-spin" />{/if}
      That's my plan
    </button>
  {/if}
</div>

{#if showSave}
  <div class="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" role="presentation">
    <div class="flex flex-col gap-4 rounded-t-2xl bg-background px-6 pt-3 pb-7" role="dialog" aria-modal="true" aria-labelledby="save-title">
      <span class="h-1 w-10 self-center rounded-full bg-muted-foreground/30"></span>
      <div>
        <h2 id="save-title" class="text-[21px] font-bold mb-1.5">
          {saveOnly ? `${workoutsSoFar} workouts on this phone only` : "Don't lose today's progress"}
        </h2>
        <p class="text-sm text-muted-foreground">
          {#if saveOnly}
            Your training and starting weights live only on this phone. Save them to a free account and get them back on any phone.
          {:else}
            Your starting weights{liftCount ? ` for ${liftCount} lift${liftCount === 1 ? "" : "s"}` : ""} live only on this phone. Save them to a free account and get them back on any phone.
          {/if}
        </p>
      </div>
      <div class="flex flex-col gap-2.5">
        <button type="button" class="h-[52px] rounded-[10px] bg-primary text-primary-foreground text-[15px] font-semibold" onclick={() => void saveWithEmail()}>
          Save to a free account
        </button>
        <button type="button" class="h-11 text-sm text-muted-foreground" onclick={() => void notNow()}>Not now</button>
      </div>
    </div>
  </div>
{/if}
