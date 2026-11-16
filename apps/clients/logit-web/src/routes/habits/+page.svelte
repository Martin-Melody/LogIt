<script lang="ts">
  import { guideSignal } from "$lib/features/guide/signal";
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Goal } from "@logit/core/domain/goals";
  import type { GoalView } from "@logit/core/domain/goalView";
  import { deadlineText, fmtDate, goalFormat, goalStatusText } from "@logit/core/domain/goalText";
  import { addDays, weekStartIso } from "@logit/core/domain/dateIso";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { dueOn, isSatisfied, weekProgress, type Habit, type HabitEntry } from "@logit/core/domain/habit";
  import { MAX_WEEKLY_TARGET, type WeeklyStreak } from "@logit/core/domain/weeklyStreak";
  import type { WeightUnit } from "@logit/core/domain/units";
  import type { WorkoutSession } from "@logit/core/domain/workout";
  import { getOwnProfile, getWebDeps, invalidateOwnProfile } from "$lib/deps";
  import { loadExerciseIndex, type ExerciseIndex } from "$lib/features/plan/exerciseIndex";
  import {
    deleteGoal,
    goalsFromProfile,
    goalViews,
    ownBodyweightView,
    setWeeklyTarget,
    streakFor,
    type StreakSettings,
  } from "$lib/features/habitsGoals/goalsData";
  import { loadHabits, setHabitDay, type HabitsData } from "$lib/features/habitsGoals/habitsData";
  import GoalChart from "$lib/features/habitsGoals/GoalChart.svelte";
  import GoalDialog from "$lib/features/habitsGoals/GoalDialog.svelte";
  import HabitDialog from "$lib/features/habitsGoals/HabitDialog.svelte";

  // Goals, the weekly workout target and habits, editable here. Ticking habits happens on
  // the phone; a past day can be fixed here.

  let sessions = $state<WorkoutSession[]>([]);
  let unit = $state<WeightUnit>("kg");
  let goals = $state<Goal[]>([]);
  let views = $state<GoalView[]>([]);
  let bodyweight = $state<GoalView | null>(null);
  let streakSettings = $state<StreakSettings | null>(null);
  let streak = $state<WeeklyStreak | null>(null);
  let habits = $state<HabitsData | null>(null);
  let index = $state<ExerciseIndex | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let selectedGoalId = $state<string | null>(null);

  let goalDialog = $state(false);
  let editingGoal = $state<Goal | null>(null);
  let habitDialog = $state(false);
  let editingHabit = $state<Habit | null>(null);
  let showArchived = $state(false);

  const todayIso = localDateIso();

  async function loadGoals() {
    invalidateOwnProfile();
    const profile = await getOwnProfile();
    const g = goalsFromProfile(profile);
    goals = g.goals;
    streakSettings = g.streak;
    streak = streakFor(sessions, g.streak);
    views = await goalViews(g.goals, sessions, unit);
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const [all, profile] = await Promise.all([getWebDeps().workoutRepo.listAllSessions(), getOwnProfile()]);
      sessions = all.filter((s) => s.endedAtMs != null);
      unit = profile?.weightUnit === "lbs" ? "lbs" : "kg";
      const [, bw, h, ix] = await Promise.all([
        loadGoals(),
        ownBodyweightView().catch(() => null),
        loadHabits(),
        loadExerciseIndex(sessions),
      ]);
      bodyweight = bw;
      habits = h;
      index = ix;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load your habits and goals.";
    } finally {
      loading = false;
    }
  }
  onMount(() => void load());

  // ── Weekly target ──────────────────────────────────────────────────────────
  let targetSaving = $state(false);
  async function changeTarget(by: number) {
    if (!streakSettings || targetSaving) return;
    const n = streakSettings.weeklyTarget + by;
    if (n < 1 || n > MAX_WEEKLY_TARGET) return;
    targetSaving = true;
    actionError = null;
    try {
      streakSettings = await setWeeklyTarget(n);
      streak = streakFor(sessions, streakSettings);
    } catch (e) {
      actionError = e instanceof Error ? e.message : "Couldn't change the target.";
    } finally {
      targetSaving = false;
    }
  }

  // ── Goals ──────────────────────────────────────────────────────────────────
  const selected = $derived(views.find((v) => v.key === selectedGoalId) ?? views.find((v) => v.projection.status !== "achieved") ?? views[0] ?? null);
  const selFmt = $derived(selected ? goalFormat(selected, unit) : null);

  function barColour(v: GoalView): string {
    if (v.projection.status === "achieved") return "bg-success";
    if (v.projection.status === "stalled") return "bg-warning";
    if (v.deadlineMs && v.projection.atDeadline != null && v.projection.status !== "on_track") return "bg-warning";
    if (v.deadlineMs && v.projection.eta && v.projection.eta.likelyMs > v.deadlineMs) return "bg-warning";
    return "bg-primary";
  }
  function currentText(v: GoalView): string {
    const cur = v.goal?.target.type === "count" ? v.points.at(-1)?.value : (v.projection.current ?? v.points.at(-1)?.value);
    return cur == null ? "—" : goalFormat(v, unit).fmt(cur);
  }

  let confirmDeleteGoal = $state(false);
  async function removeGoal() {
    const g = selected?.goal;
    confirmDeleteGoal = false;
    if (!g) return;
    actionError = null;
    try {
      await deleteGoal(g);
      selectedGoalId = null;
      await loadGoals();
    } catch (e) {
      actionError = e instanceof Error ? e.message : "Couldn't delete the goal.";
    }
  }

  // ── Habits ─────────────────────────────────────────────────────────────────
  // Four weeks, Monday to Sunday, ending with this one.
  const firstDay = addDays(weekStartIso(todayIso), -21);
  const days = Array.from({ length: 28 }, (_, i) => addDays(firstDay, i));
  const weekStarts = [0, 7, 14, 21].map((i) => days[i]!);

  function entryOf(h: Habit, d: string): HabitEntry | undefined {
    return habits?.entries.find((e) => e.habitId === h.id && e.dateIso === d);
  }
  type Cell = "done" | "part" | "missed" | "off" | "future";
  function cell(h: Habit, d: string): Cell {
    if (d > todayIso) return "future";
    const e = entryOf(h, d);
    if (isSatisfied(h, e)) return "done";
    if (h.target && (e?.value ?? 0) > 0) return "part";
    if (!dueOn(h, d)) return "off";
    // Weekly habits aren't "missed" on any one day.
    if (h.cadence.kind === "weekly") return "off";
    return d === todayIso ? "off" : "missed";
  }
  const CELL: Record<Cell, string> = {
    done: "bg-success",
    part: "bg-success/45",
    missed: "bg-muted",
    off: "bg-transparent ring-1 ring-inset ring-border",
    future: "bg-transparent ring-1 ring-inset ring-border/50",
  };
  function thisWeek(h: Habit): string {
    const w = weekProgress(h, habits?.entries ?? [], todayIso);
    if (w) return `${w.done} / ${w.target}`;
    const monday = weekStartIso(todayIso);
    let due = 0;
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d > todayIso) break;
      if (!dueOn(h, d)) continue;
      due++;
      if (isSatisfied(h, entryOf(h, d))) done++;
    }
    return `${done} / ${due}`;
  }
  function cadenceText(h: Habit): string {
    const c = h.cadence;
    if (c.kind === "daily") return "Every day";
    if (c.kind === "weekly") return `${c.timesPerWeek} times a week`;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return [...c.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => names[d]).join(", ");
  }
  function dayLabel(d: string): string {
    return new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  /** Fixing a number habit's day: which one, and the value being typed. */
  let fixing = $state<{ habit: Habit; dateIso: string; value: string } | null>(null);
  let fixSaving = $state(false);

  async function fixDay(h: Habit, d: string) {
    if (d >= todayIso) return;
    if (h.target) {
      fixing = { habit: h, dateIso: d, value: String(entryOf(h, d)?.value ?? "") };
      return;
    }
    await writeDay(h, d, { done: !isSatisfied(h, entryOf(h, d)) });
  }
  async function writeDay(h: Habit, d: string, change: { done?: boolean; value?: number }) {
    actionError = null;
    fixSaving = true;
    try {
      const entry = await setHabitDay(h, d, entryOf(h, d), change);
      if (habits) habits = { ...habits, entries: [...habits.entries.filter((e) => e.id !== entry.id), entry] };
      fixing = null;
    } catch (e) {
      actionError = e instanceof Error ? e.message : "Couldn't save that day.";
    } finally {
      fixSaving = false;
    }
  }

  async function reloadHabits() {
    try {
      habits = await loadHabits();
    } catch (e) {
      actionError = e instanceof Error ? e.message : "Couldn't reload habits.";
    }
  }

  const habitRows = $derived(habits ? [
    ...habits.habits.map((h) => ({ habit: h, coach: false, note: undefined as string | undefined })),
    ...habits.coach.map((c) => ({ habit: c.habit, coach: true, note: c.note })),
  ] : []);
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-[26px] font-bold tracking-tight">Habits &amp; goals</h1>
    <div class="flex gap-2">
      <Button variant="outline" data-guide="habits-new-goal" disabled={!index} onclick={() => { editingGoal = null; goalDialog = true; }}>+ New goal</Button>
      <Button variant="outline" onclick={() => { editingHabit = null; habitDialog = true; }}>+ New habit</Button>
    </div>
  </header>

  {#if actionError}<Alert.Root variant="destructive"><Alert.Description>{actionError}</Alert.Description></Alert.Root>{/if}

  {#if error}
    <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
  {:else if loading}
    <div class="flex flex-wrap gap-4"><Skeleton class="h-28 flex-[1_1_340px]" /><Skeleton class="h-28 flex-[1_1_340px]" /></div>
    <Skeleton class="h-80" />
    <Skeleton class="h-64" />
  {:else}
    <div class="flex flex-wrap gap-4">
      <section data-guide="habits-week" class="flex flex-[1_1_340px] flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-card px-[18px] py-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-sm font-semibold">Workouts a week</h2>
          <p class="text-xs leading-relaxed text-muted-foreground">
            Your streak counts the weeks you hit this.<br />
            {#if streak}Streak {streak.currentWeeks} week{streak.currentWeeks === 1 ? "" : "s"} · best {streak.bestWeeks}{#if streak.pausedNow}{" · paused"}{/if}{/if}
          </p>
        </div>
        <div role="group" aria-label="Workouts a week" class="flex items-center gap-2.5">
          <button type="button" aria-label="One fewer" disabled={targetSaving || (streakSettings?.weeklyTarget ?? 1) <= 1} onclick={() => void changeTarget(-1)}
            class="size-9 rounded-[9px] border border-border text-base hover:bg-muted disabled:opacity-40">−</button>
          <span class="min-w-6 text-center text-2xl font-bold tabular-nums" aria-live="polite">{streakSettings?.weeklyTarget ?? "–"}</span>
          <button type="button" aria-label="One more" disabled={targetSaving || (streakSettings?.weeklyTarget ?? MAX_WEEKLY_TARGET) >= MAX_WEEKLY_TARGET} onclick={() => void changeTarget(1)}
            class="size-9 rounded-[9px] border border-border text-base hover:bg-muted disabled:opacity-40">+</button>
        </div>
      </section>

      <section class="flex flex-[1_1_340px] flex-col gap-2 rounded-[10px] border border-border bg-card px-[18px] py-4">
        {#if bodyweight}
          {@const f = goalFormat(bodyweight, unit)}
          {@const cur = bodyweight.projection.current ?? bodyweight.points.at(-1)?.value}
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold">Body weight {f.fmt(bodyweight.target)}</h2>
            <a href="/nutrition/goal" class="text-xs text-primary hover:underline">Change in Nutrition ›</a>
          </div>
          <div class="flex justify-between text-[13px] text-muted-foreground">
            <span>{cur != null ? `Now ${f.fmt(cur)}` : "No weigh-ins yet"}{bodyweight.start != null ? ` · started at ${f.fmt(bodyweight.start)}` : ""}</span>
            <span>{Math.round(bodyweight.progress * 100)}%</span>
          </div>
          <span class="block h-1.5 rounded-full bg-muted"><span class="block h-1.5 rounded-full {barColour(bodyweight)}" style="width: {Math.round(bodyweight.progress * 100)}%"></span></span>
          <span class="text-xs text-muted-foreground">{goalStatusText(bodyweight, unit)}</span>
        {:else}
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold">Body weight</h2>
            <a href="/nutrition/goal" class="text-xs text-primary hover:underline">Set a target in Nutrition ›</a>
          </div>
          <p class="text-xs text-muted-foreground">A target weight on your nutrition goal shows up here with its trend.</p>
        {/if}
      </section>
    </div>

    <!-- Goals -->
    <section data-guide="habits-goals" class="flex flex-col gap-3.5 rounded-[10px] border border-border bg-card px-[18px] py-4">
      <h2 class="text-sm font-semibold">Goals</h2>
      {#if views.length === 0}
        <p class="text-[13px] text-muted-foreground">No goals yet. A lift, a rep count or a number of workouts: <button type="button" class="text-primary hover:underline" onclick={() => { editingGoal = null; goalDialog = true; }}>set one</button>.</p>
      {:else}
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex flex-[1_1_280px] flex-col gap-0.5">
            {#each views as v (v.key)}
              <button type="button" onclick={() => (selectedGoalId = v.key)} aria-current={selected?.key === v.key ? "true" : undefined}
                class="flex flex-col gap-1.5 rounded-lg p-3 text-left {selected?.key === v.key ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'}">
                <span class="flex justify-between gap-2 text-[13px]"><span class="font-semibold">{v.title}</span><span class="shrink-0 text-muted-foreground">{currentText(v)}</span></span>
                <span class="block h-1.5 rounded-full bg-background"><span class="block h-1.5 rounded-full {barColour(v)}" style="width: {Math.round(v.progress * 100)}%"></span></span>
                <span class="text-[11px] text-muted-foreground">{goalStatusText(v, unit)}</span>
              </button>
            {/each}
          </div>

          {#if selected && selFmt}
            <div class="flex min-w-0 flex-[2_1_480px] flex-col gap-2.5 rounded-[10px] border border-border bg-background px-4 py-3.5">
              <div class="flex flex-wrap justify-between gap-2.5">
                <div>
                  <h3 class="text-base font-bold">{selected.title}</h3>
                  <p class="mt-0.5 text-xs text-muted-foreground">
                    {selected.measure}{#if selected.goal}{" · set "}{fmtDate(selected.goal.createdAtMs)}{/if}{#if !selected.deadlineMs}{" · no deadline"}{/if}
                  </p>
                </div>
                {#if selected.goal}
                  <div class="flex items-start gap-1.5">
                    <Button variant="outline" size="sm" onclick={() => { editingGoal = selected!.goal; goalDialog = true; }}>Edit</Button>
                    {#if confirmDeleteGoal}
                      <Button variant="destructive" size="sm" onclick={() => void removeGoal()}>Delete it</Button>
                      <Button variant="ghost" size="sm" onclick={() => (confirmDeleteGoal = false)}>Keep</Button>
                    {:else}
                      <Button variant="outline" size="sm" onclick={() => (confirmDeleteGoal = true)}>Delete</Button>
                    {/if}
                  </div>
                {/if}
              </div>
              <GoalChart view={selected} toDisplay={selFmt.toDisplay} unitLabel={selFmt.unitLabel} />
              <p class="text-xs leading-relaxed text-muted-foreground">
                {goalStatusText(selected, unit)}{#if selected.projection.ratePerWeek != null && selected.projection.status === "on_track"}{" · "}{selFmt.fmtRate(selected.projection.ratePerWeek)}{/if}
                {#if deadlineText(selected, unit)}<br />{deadlineText(selected, unit)}{/if}
              </p>
              <p class="text-[11px] text-muted-foreground">Dashed line: your recent trend. Shaded: where it'll likely land, between the faster and slower pace you've shown.</p>
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <!-- Habits -->
    <section data-guide="habits-list" class="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-2 pt-4 pb-2">
      <div class="flex flex-wrap items-baseline justify-between gap-2 px-2.5">
        <h2 class="text-sm font-semibold">Habits</h2>
        <span class="text-xs text-muted-foreground">You tick them on your phone. Click a past day here to fix it.</span>
      </div>
      {#if habitRows.length === 0}
        <p class="px-2.5 pb-3 text-[13px] text-muted-foreground">No habits yet. <button type="button" class="text-primary hover:underline" onclick={() => { editingHabit = null; habitDialog = true; }}>Add one</button>.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr class="text-left text-xs text-muted-foreground">
                <th class="px-2.5 py-2 font-medium">Habit</th>
                <th class="px-2.5 py-2 font-medium">How often</th>
                <th class="px-2.5 py-2 font-medium">
                  <span class="grid grid-cols-4 gap-[3px]" style="width: calc(28 * 16px)">
                    {#each weekStarts as w, i (w)}<span>{i === 3 ? "This week" : new Date(w + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>{/each}
                  </span>
                </th>
                <th class="px-2.5 py-2 font-medium">This week</th>
                <th class="w-16 px-2.5 py-2"><span class="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {#each habitRows as row (row.habit.id)}
                {@const h = row.habit}
                <tr class="border-t border-border">
                  <td class="px-2.5 py-2.5 font-medium">
                    {h.name}{#if h.target}{" "}<span class="font-normal text-muted-foreground">{h.target.value}{h.target.unit ? ` ${h.target.unit}` : ""}</span>{/if}
                    {#if row.coach}<span class="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary" title={row.note}>From your coach</span>{/if}
                  </td>
                  <td class="px-2.5 py-2.5 text-muted-foreground">{cadenceText(h)}</td>
                  <td class="px-2.5 py-2.5">
                    <span class="grid grid-cols-[repeat(28,13px)] gap-[3px]">
                      {#each days as d (d)}
                        {@const c = cell(h, d)}
                        {@const e = entryOf(h, d)}
                        <button type="button" disabled={d >= todayIso}
                          aria-label="{h.name}, {dayLabel(d)}: {c === 'done' ? 'done' : c === 'part' ? `${e?.value} of ${h.target?.value}` : c === 'future' ? 'not yet' : c === 'off' ? 'not due' : 'missed'}{d < todayIso ? '. Click to change' : ''}"
                          title="{dayLabel(d)}{h.target && e?.value ? `: ${e.value}${h.target.unit ? ` ${h.target.unit}` : ''}` : ''}"
                          onclick={() => void fixDay(h, d)}
                          class="block size-[13px] rounded-[3px] {CELL[c]} {d < todayIso ? 'cursor-pointer hover:ring-2 hover:ring-primary/60' : 'cursor-default'} {fixing?.habit.id === h.id && fixing.dateIso === d ? 'ring-2 ring-primary' : ''}"></button>
                      {/each}
                    </span>
                  </td>
                  <td class="px-2.5 py-2.5 tabular-nums">{thisWeek(h)}</td>
                  <td class="px-2.5 py-2.5">
                    {#if row.coach}
                      <span class="text-xs text-muted-foreground">Coach's</span>
                    {:else}
                      <Button variant="outline" size="sm" onclick={() => { editingHabit = h; habitDialog = true; }}>Edit</Button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if fixing}
          <form class="mx-2.5 flex flex-wrap items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-[13px]"
            onsubmit={(e) => { e.preventDefault(); if (fixing) void writeDay(fixing.habit, fixing.dateIso, { value: Number(fixing.value.replace(",", ".")) || 0 }); }}>
            <label for="fix-value">{fixing.habit.name} on {dayLabel(fixing.dateIso)}</label>
            <input id="fix-value" inputmode="decimal" bind:value={fixing.value} class="h-8 w-24 rounded-md border border-input bg-background px-2 text-right tabular-nums" />
            <span class="text-muted-foreground">{fixing.habit.target?.unit ?? ""} (target {fixing.habit.target?.value})</span>
            <span class="flex-1"></span>
            <Button type="button" variant="outline" size="sm" onclick={() => (fixing = null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={fixSaving}>Save</Button>
          </form>
        {/if}
      {/if}
      <div class="flex flex-wrap items-center gap-3.5 px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5"><span class="size-[13px] rounded-[3px] bg-success"></span>Done</span>
        <span class="flex items-center gap-1.5"><span class="size-[13px] rounded-[3px] bg-success/45"></span>Part (number habits)</span>
        <span class="flex items-center gap-1.5"><span class="size-[13px] rounded-[3px] bg-muted"></span>Missed</span>
        <span class="flex items-center gap-1.5"><span class="size-[13px] rounded-[3px] ring-1 ring-inset ring-border"></span>Not due / not yet</span>
        <span class="flex-1"></span>
        {#if habits && habits.archived.length}
          <button type="button" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)} class="hover:text-foreground">Archived ({habits.archived.length}) {showArchived ? "▴" : "▾"}</button>
        {/if}
      </div>
      {#if showArchived && habits}
        <ul class="mx-2.5 mb-1.5 flex flex-col gap-1">
          {#each habits.archived as h (h.id)}
            <li class="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
              <span class="text-muted-foreground">{h.name}</span>
              <Button variant="outline" size="sm" onclick={() => { editingHabit = h; habitDialog = true; }}>Open</Button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

{#if index}
  <GoalDialog bind:open={goalDialog} goal={editingGoal} {index} {sessions} {unit} onSaved={() => { void loadGoals(); guideSignal("goal.saved"); }} />
{/if}
<HabitDialog bind:open={habitDialog} habit={editingHabit} onSaved={() => void reloadHabits()} />
