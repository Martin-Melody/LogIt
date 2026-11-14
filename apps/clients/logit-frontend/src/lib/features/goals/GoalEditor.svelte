<script lang="ts">
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { chip } from "$lib/components/ui/choice";
  import { DateField } from "$lib/components/ui/date-field";
  import ExerciseSearchInput from "$lib/components/ExerciseSearchInput.svelte";
  import { profile } from "$lib/stores/profile.store";
  import { fromDisplayWeight, toDisplayWeight, trimWeight, type WeightUnit } from "@logit/core/domain/units";
  import { localDateIso } from "@logit/core/domain/nutrition";
  import { liftGoalSeries, recentPoints, repsGoalSeries, robustTrend, type Goal, type GoalTarget } from "@logit/core/domain/goals";
  import { getExerciseHistory } from "@logit/core/usecases/progression/getExerciseHistory";
  import { getExerciseRepo, getWorkoutRepo } from "$lib/data/repoProvider";

  /**
   * Set or change a goal. Bodyweight isn't stored here: it's the nutrition goal's target
   * weight, so that option just links there.
   */
  const {
    goal,
    saving = false,
    onsave,
  }: {
    goal?: Goal;
    saving?: boolean;
    onsave: (target: GoalTarget, deadlineIso: string | null) => void;
  } = $props();

  type Kind = "lift" | "reps" | "count" | "bodyweight";
  const KINDS: { id: Kind; label: string }[] = [
    { id: "lift", label: "Lift" },
    { id: "reps", label: "Reps" },
    { id: "count", label: "Total" },
    { id: "bodyweight", label: "Bodyweight" },
  ];

  const unit = $derived(($profile.weightUnit ?? "kg") as WeightUnit);
  const seed = untrack(() => goal);
  const seedUnit = untrack(() => ($profile.weightUnit ?? "kg") as WeightUnit);
  const t = seed?.target;
  const today = localDateIso();
  const year = today.slice(0, 4);

  let kind = $state<Kind>(t?.type ?? "lift");
  let exercise = $state<{ name: string; exerciseId?: string } | null>(
    t && t.type !== "count" ? { name: t.exerciseName, exerciseId: t.exerciseId } : null,
  );
  let weight = $state(t?.type === "lift" ? trimWeight(Math.round(toDisplayWeight(t.weightKg, seedUnit) * 4) / 4) : "");
  let reps = $state(t?.type === "lift" || t?.type === "reps" ? String(t.reps) : t ? "" : "1");
  let metric = $state<"sessions" | "volume">(t?.type === "count" ? t.metric : "sessions");
  let countTarget = $state(
    t?.type === "count"
      ? String(t.metric === "volume" ? Math.round(toDisplayWeight(t.target, seedUnit)) : t.target)
      : "",
  );
  let startIso = $state<string | undefined>(t?.type === "count" ? t.startIso : `${year}-01-01`);
  let hasDeadline = $state(!!seed?.deadlineIso);
  let deadlineIso = $state<string | undefined>(seed?.deadlineIso ?? (t ? undefined : `${year}-12-31`));

  // Reps default to 1 for a lift, and need typing for a reps goal.
  function pickKind(k: Kind) {
    if (k === kind) return;
    if (k === "reps" && reps === "1") reps = "";
    if (k === "lift" && reps === "") reps = "1";
    if (k === "count" && !seed) hasDeadline = true;
    kind = k;
  }

  // Where you're at now for the picked exercise, so the target can be realistic.
  let hint = $state<string | null>(null);
  $effect(() => {
    const ex = exercise;
    const k = kind;
    const r = Number(reps);
    const u = unit;
    hint = null;
    if (!ex || (k !== "lift" && k !== "reps")) return;
    const goalReps = k === "lift" && r >= 1 ? Math.round(r) : 1;
    void getExerciseHistory(
      { id: ex.exerciseId, name: ex.name },
      { workoutRepo: getWorkoutRepo(), exerciseRepo: getExerciseRepo() },
      { includeExcluded: true },
    ).then(({ history }) => {
      if (history.length === 0) {
        hint = "No sessions with this exercise yet.";
        return;
      }
      if (k === "reps") {
        const best = Math.max(...repsGoalSeries(history, { reps: 1 }).points.map((p) => p.value));
        hint = `Best so far: ${best} reps in a set.`;
        return;
      }
      const series = liftGoalSeries(history, { weightKg: Infinity, reps: goalReps });
      const nowMs = Date.now();
      const recent = recentPoints(series.points, nowMs, 84, 4);
      const trend = recent.length >= 4 ? robustTrend(recent) : null;
      const now = trend?.valueAt(nowMs) ?? series.points.at(-1)?.value;
      if (now == null) return;
      const shown = trimWeight(Math.round(toDisplayWeight(now, u) * 2) / 2);
      hint = `You're at about ${shown} ${u} for ${goalReps === 1 ? "1 rep" : `${goalReps} reps`} now.`;
    }).catch(() => {});
  });

  const valid = $derived.by(() => {
    if (kind === "bodyweight") return false;
    if (hasDeadline && !deadlineIso) return false;
    if (kind === "count") return Number(countTarget) > 0 && !!startIso;
    if (!exercise) return false;
    if (kind === "lift") return Number(weight) > 0 && Number(reps) >= 1;
    return Number(reps) >= 1;
  });

  function build(): GoalTarget | null {
    if (kind === "count") {
      const n = Number(countTarget);
      return {
        type: "count",
        metric,
        target: metric === "volume" ? fromDisplayWeight(n, unit) : Math.round(n),
        startIso: startIso!,
      };
    }
    if (!exercise) return null;
    if (kind === "lift") {
      return {
        type: "lift",
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.name,
        weightKg: fromDisplayWeight(Number(weight), unit),
        reps: Math.round(Number(reps)),
      };
    }
    if (kind === "reps") {
      return { type: "reps", exerciseId: exercise.exerciseId, exerciseName: exercise.name, reps: Math.round(Number(reps)) };
    }
    return null;
  }

  function save() {
    const target = build();
    if (!target || !valid) return;
    onsave(target, hasDeadline ? (deadlineIso ?? null) : null);
  }

  const input = "h-10 bg-muted rounded-md px-2 text-sm outline-none focus:ring-1 focus:ring-ring";
</script>

<div class="flex flex-col gap-5 px-3 py-4">
  {#if !seed}
    <div class="flex flex-col gap-1.5">
      <span class="text-[11px] text-muted-foreground">Kind of goal</span>
      <div class="flex flex-wrap gap-2">
        {#each KINDS as k (k.id)}
          <button type="button" class={chip(kind === k.id)} aria-pressed={kind === k.id} onclick={() => pickKind(k.id)}>{k.label}</button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">
        {#if kind === "lift"}A weight for a number of reps, e.g. bench 100 {unit} × 1 or squat 140 {unit} × 5.
        {:else if kind === "reps"}Reps in one set, e.g. 20 pull-ups.
        {:else if kind === "count"}A running total, e.g. 200 workouts this year.
        {:else}Your target weight.{/if}
      </p>
    </div>
  {/if}

  {#if kind === "bodyweight"}
    <div class="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p class="text-sm">
        Your target weight lives on your nutrition goal, so calories and the goal stay in step. Set it there and it shows up here with a projection.
      </p>
      <Button href="/nutrition/goal" variant="outline">Set target weight</Button>
    </div>
  {:else if kind === "count"}
    <div class="flex flex-col gap-1.5">
      <span class="text-[11px] text-muted-foreground">Count</span>
      <div class="flex gap-2">
        <button type="button" class={chip(metric === "sessions")} aria-pressed={metric === "sessions"} onclick={() => (metric = "sessions")}>Workouts</button>
        <button type="button" class={chip(metric === "volume")} aria-pressed={metric === "volume"} onclick={() => (metric = "volume")}>Weight lifted</button>
      </div>
    </div>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Target</span>
      <div class="flex items-center gap-2">
        <input class="{input} w-32" inputmode="numeric" placeholder={metric === "sessions" ? "200" : "1000000"} bind:value={countTarget} />
        <span class="text-sm text-muted-foreground">{metric === "sessions" ? "workouts" : unit}</span>
      </div>
    </label>
    <div class="flex flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Counting from</span>
      <div class="flex items-center gap-2">
        <DateField bind:value={startIso} aria-label="Counting from" class="w-[9.5rem]" />
        <button type="button" class={chip(startIso === `${year}-01-01`)} onclick={() => (startIso = `${year}-01-01`)}>1 Jan</button>
        <button type="button" class={chip(startIso === today)} onclick={() => (startIso = today)}>Today</button>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-1">
      <span class="text-[11px] text-muted-foreground">Exercise</span>
      {#if exercise}
        <div class="flex h-10 items-center justify-between gap-2 rounded-md bg-muted px-2">
          <span class="truncate text-sm">{exercise.name}</span>
          {#if !seed}
            <button type="button" class="h-10 shrink-0 text-xs text-primary" onclick={() => (exercise = null)}>Change</button>
          {/if}
        </div>
      {:else}
        <ExerciseSearchInput placeholder="e.g. Bench Press" onConfirm={(sel) => (exercise = sel)} />
      {/if}
      {#if hint}<p class="text-xs text-muted-foreground">{hint}</p>{/if}
    </div>

    <div class="flex items-end gap-3">
      {#if kind === "lift"}
        <label class="flex flex-col gap-1">
          <span class="text-[11px] text-muted-foreground">Weight ({unit})</span>
          <input class="{input} w-24" inputmode="decimal" placeholder="100" bind:value={weight} />
        </label>
        <span class="pb-2.5 text-sm text-muted-foreground">×</span>
      {/if}
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-muted-foreground">Reps{kind === "reps" ? " in one set" : ""}</span>
        <input class="{input} w-20" inputmode="numeric" placeholder={kind === "reps" ? "20" : "1"} bind:value={reps} />
      </label>
    </div>
  {/if}

  {#if kind !== "bodyweight"}
    <div class="flex flex-col gap-1.5">
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" class="h-4 w-4 accent-primary" bind:checked={hasDeadline} />
        By a date
      </label>
      {#if hasDeadline}
        <DateField bind:value={deadlineIso} minIso={today} aria-label="Deadline" class="w-[9.5rem]" />
        <p class="text-xs text-muted-foreground">The chart shows whether you're on track for it.</p>
      {/if}
    </div>

    <Button class="w-full" disabled={!valid || saving} onclick={save}>{seed ? "Save" : "Set goal"}</Button>
  {/if}
</div>
