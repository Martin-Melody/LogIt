import type { MuscleGroup } from "./exercise";
import type { MuscleGroupVolumeInsight } from "./muscleGroupInsight";
import type { PlannedStrength, SplitDay, WorkoutSplit } from "./WorkoutSplit";
import { rotationSlots, sortedDays } from "./splitSchedule";

// Hard sets per muscle per week: a target range for each muscle, what a split plans, and
// how the two compare. A set counts fully for the muscles an exercise mainly works and 40%
// for the ones it also works (the same weighting as the muscle-group insights), so a bench
// press counts toward triceps too, just less.
//
// The default ranges follow the research on weekly volume (more sets tend to mean more
// growth, up to a point; most muscles do well somewhere around 10–20 hard sets a week), set a
// little lower for small muscles that also get worked by bigger lifts. Once there's enough
// of the lifter's own history, the muscle-group insight's finding moves the range.

export type SetTarget = { lo: number; hi: number; learned?: boolean };

export const SECONDARY_SET_WEIGHT = 0.4;

export const DEFAULT_SET_TARGETS: Record<MuscleGroup, SetTarget> = {
  chest: { lo: 10, hi: 16 },
  back: { lo: 10, hi: 18 },
  shoulders: { lo: 8, hi: 14 },
  quads: { lo: 10, hi: 16 },
  hamstrings: { lo: 8, hi: 14 },
  glutes: { lo: 8, hi: 14 },
  biceps: { lo: 6, hi: 12 },
  triceps: { lo: 6, hi: 12 },
  calves: { lo: 6, hi: 12 },
  core: { lo: 4, hi: 10 },
  forearms: { lo: 0, hi: 8 },
};

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  biceps: "Biceps",
  triceps: "Triceps",
  calves: "Calves",
  core: "Core",
  forearms: "Forearms",
};

/** A common exercise for a muscle, for when a split has nothing that works it. */
export const EXAMPLE_EXERCISE: Record<MuscleGroup, string> = {
  chest: "Incline dumbbell press",
  back: "Chest-supported row",
  shoulders: "Lateral raise",
  quads: "Leg press",
  hamstrings: "Romanian deadlift",
  glutes: "Hip thrust",
  biceps: "Dumbbell curl",
  triceps: "Cable pushdown",
  calves: "Standing calf raise",
  core: "Cable crunch",
  forearms: "Wrist curl",
};

/**
 * The target for a muscle: the default, moved by the insight when it's sure enough. "More
 * sets went with better sessions above N" raises the bottom of the range to N; "fewer" lowers
 * the top to N.
 */
export function setTargetFor(muscle: MuscleGroup, insight?: { volumeInsight?: MuscleGroupVolumeInsight; confidence?: string }): SetTarget {
  const base = DEFAULT_SET_TARGETS[muscle];
  const v = insight?.volumeInsight;
  if (!v || insight?.confidence === "low") return { ...base };
  const n = Math.round(v.thresholdSets);
  if (v.direction === "higher" && n > base.lo) return { lo: n, hi: Math.max(base.hi, n + 4), learned: true };
  if (v.direction === "lower" && n < base.hi) return { lo: Math.min(base.lo, Math.max(0, n - 4)), hi: n, learned: true };
  return { ...base };
}

export type MuscleTags = { primary: MuscleGroup[]; secondary: MuscleGroup[] };

export type PlannedContribution = {
  dayId: string;
  dayName: string;
  exerciseName: string;
  exerciseId?: string;
  /** Sets on the day, and how many times a week the day comes round. */
  sets: number;
  timesPerWeek: number;
  primary: boolean;
};

export type PlannedWeek = {
  sets: Record<MuscleGroup, number>;
  contributions: Record<MuscleGroup, PlannedContribution[]>;
  /** How many workouts a week the plan assumes. */
  workoutsPerWeek: number;
};

const ALL_MUSCLES = Object.keys(DEFAULT_SET_TARGETS) as MuscleGroup[];

function emptyRecord<T>(make: () => T): Record<MuscleGroup, T> {
  return Object.fromEntries(ALL_MUSCLES.map((m) => [m, make()])) as Record<MuscleGroup, T>;
}

/**
 * How often each workout day comes round in a week. Weekdays: once (per weekday given). A
 * rotation with rest days: its own length in calendar days. A rotation without rest days
 * runs whenever you train, so it's spread over `workoutsPerWeek` (the weekly workout target).
 */
export function dayFrequencies(split: WorkoutSplit, workoutsPerWeek: number): Map<string, number> {
  const freq = new Map<string, number>();
  const workoutDays = sortedDays(split).filter((d) => !d.rest);
  if (workoutDays.length === 0) return freq;
  if (split.schedule === "weekdays") {
    for (const d of workoutDays) freq.set(d.id, d.weekday == null ? 0 : 1);
    return freq;
  }
  const slots = rotationSlots(split);
  const hasRest = slots.some((s) => s[0]!.rest);
  const workoutSlots = slots.filter((s) => !s[0]!.rest).length;
  const perSlot = hasRest ? 7 / slots.length : Math.max(1, workoutsPerWeek) / Math.max(1, workoutSlots);
  for (const d of workoutDays) freq.set(d.id, perSlot);
  return freq;
}

function dayLabel(split: WorkoutSplit, day: SplitDay): string {
  return day.name?.trim() || `Day ${sortedDays(split).filter((d) => !d.rest).indexOf(day) + 1}`;
}

/** Hard sets a split plans per muscle per week. `musclesOf` resolves an exercise's tags. */
export function plannedWeeklySets(
  split: WorkoutSplit,
  musclesOf: (block: PlannedStrength) => MuscleTags | null,
  workoutsPerWeek: number,
): PlannedWeek {
  const sets = emptyRecord(() => 0);
  const contributions = emptyRecord<PlannedContribution[]>(() => []);
  const freq = dayFrequencies(split, workoutsPerWeek);
  for (const day of sortedDays(split)) {
    if (day.rest) continue;
    const times = freq.get(day.id) ?? 0;
    if (times <= 0) continue;
    const rounds = new Map((day.groups ?? []).map((g) => [g.id, g.rounds]));
    for (const block of day.blocks) {
      if (block.type !== "strength") continue;
      const tags = musclesOf(block);
      if (!tags) continue;
      const n = (block.groupId ? rounds.get(block.groupId) : undefined) ?? block.targets?.sets ?? 3;
      const base = { dayId: day.id, dayName: dayLabel(split, day), exerciseName: block.exerciseName, exerciseId: block.exerciseId, sets: n, timesPerWeek: times };
      for (const m of new Set(tags.primary)) {
        sets[m] += n * times;
        contributions[m].push({ ...base, primary: true });
      }
      for (const m of new Set(tags.secondary.filter((x) => !tags.primary.includes(x)))) {
        sets[m] += n * times * SECONDARY_SET_WEIGHT;
        contributions[m].push({ ...base, primary: false });
      }
    }
  }
  for (const m of ALL_MUSCLES) sets[m] = Math.round(sets[m] * 10) / 10;
  return { sets, contributions, workoutsPerWeek };
}

export type SplitScoreRow = {
  muscle: MuscleGroup;
  planned: number;
  target: SetTarget;
  status: "under" | "in" | "over";
  fix?: string;
};

/** Each muscle's planned sets against its target, with a fix for one that's short. */
export function scoreSplit(planned: PlannedWeek, targets: Record<MuscleGroup, SetTarget>): SplitScoreRow[] {
  return ALL_MUSCLES.map((muscle) => {
    const target = targets[muscle];
    const p = planned.sets[muscle];
    const status: SplitScoreRow["status"] = p < target.lo - 0.5 ? "under" : p > target.hi + 0.5 ? "over" : "in";
    let fix: string | undefined;
    if (status === "under") {
      const deficit = target.lo - p;
      const direct = planned.contributions[muscle]
        .filter((c) => c.primary)
        .sort((a, b) => b.timesPerWeek - a.timesPerWeek || b.sets - a.sets)[0];
      if (direct) {
        const add = Math.max(1, Math.ceil(deficit / direct.timesPerWeek - 1e-9));
        fix = `Add ${add} ${add === 1 ? "set" : "sets"} of ${direct.exerciseName} on ${direct.dayName}.`;
      } else {
        fix = `Nothing in this split works ${MUSCLE_LABELS[muscle].toLowerCase()} directly. Add an exercise for it, like ${EXAMPLE_EXERCISE[muscle].toLowerCase()}.`;
      }
    } else if (status === "over" && p - target.hi >= 3) {
      fix = `About ${Math.round(p - target.hi)} sets over. Fine if you're recovering well; otherwise take a set or two off.`;
    }
    return { muscle, planned: p, target, status, fix };
  });
}
